import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/app-error';
import { createAuthTokens, verifyRefreshToken } from '../../utils/jwt';
import type { LoginInput, RefreshTokenInput, RegisterInput } from './auth.dto';

/**
 * Các trường thông tin người dùng được phép trả về công khai.
 * Trường `password` bị loại trừ để tránh rò rỉ dữ liệu nhạy cảm.
 */
const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  dateOfBirth: true,
  address: true,
  avatarUrl: true,
  insuranceId: true,
} as const;

/**
 * Tạo đối tượng payload JWT từ userId và role.
 * Payload này được nhúng vào Access Token và Refresh Token.
 *
 * @param userId - UUID của người dùng trong cơ sở dữ liệu.
 * @param role   - Vai trò của người dùng (PATIENT | DOCTOR | ADMIN).
 * @returns Đối tượng `{ userId, role }` dùng để ký JWT.
 */
function toAuthPayload(userId: string, role: Role) {
  return { userId, role };
}

/**
 * Service xử lý nghiệp vụ xác thực người dùng.
 * Bao gồm: Đăng ký tài khoản, Đăng nhập và Làm mới token.
 */
export class AuthService {
  /**
   * Đăng ký tài khoản người dùng mới (Bệnh nhân hoặc Bác sĩ).
   *
   * Quy trình:
   * 1. Kiểm tra email đã tồn tại trong hệ thống chưa (tránh trùng lặp).
   * 2. Băm mật khẩu bằng bcrypt với salt round = 10.
   * 3. Nếu vai trò là DOCTOR, tìm chuyên khoa mặc định ("Đa khoa") để gán.
   * 4. Tạo bản ghi User trong DB.
   * 5. Nếu là DOCTOR, tạo thêm bản ghi Doctor với status = PENDING (chờ Admin duyệt).
   * 6. Ký và trả về cặp Access Token + Refresh Token.
   *
   * @param input - Dữ liệu đăng ký đã được validate bởi `registerSchema`.
   * @returns Đối tượng chứa thông tin user (không có password) và cặp token JWT.
   * @throws {AppError} 409 EMAIL_ALREADY_EXISTS - Nếu email đã được đăng ký.
   * @throws {AppError} 400 NO_SPECIALTY - Nếu đăng ký Bác sĩ nhưng chưa có chuyên khoa nào trong hệ thống.
   */
  static async register(input: RegisterInput) {
    const existingUser = await prisma.user.findFirst({
      where: {
        email: input.email,
        deletedAt: null,
      },
    });

    if (existingUser) {
      throw AppError.conflict('Email is already in use', 'EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const isDoctor = input.role === 'DOCTOR';

    // For doctors, find a default specialty ("Đa khoa" or first available)
    let defaultSpecialtyId: string | undefined;
    if (isDoctor) {
      const specialty = await prisma.specialty.findFirst({
        where: { deletedAt: null, name: 'Đa khoa' },
        select: { id: true },
      }) ?? await prisma.specialty.findFirst({
        where: { deletedAt: null },
        select: { id: true },
      });
      if (!specialty) {
        throw AppError.badRequest('Chưa có chuyên khoa nào trong hệ thống', 'NO_SPECIALTY');
      }
      defaultSpecialtyId = specialty.id;
    }

    const user = await prisma.user.create({
      data: {
        email: input.email,
        password: passwordHash,
        name: input.name,
        role: isDoctor ? Role.DOCTOR : Role.PATIENT,
        phone: input.phone,
      },
      select: publicUserSelect,
    });

    // Create Doctor record so the doctor portal works
    if (isDoctor && defaultSpecialtyId) {
      await prisma.doctor.create({
        data: {
          userId: user.id,
          specialtyId: defaultSpecialtyId,
          status: 'PENDING',
        },
      });
    }

    const tokens = createAuthTokens(toAuthPayload(user.id, user.role));

    return {
      user: {
        ...user,
        ...(isDoctor ? { doctorStatus: 'PENDING' as const } : {}),
      },
      ...tokens,
    };
  }

  /**
   * Đăng nhập bằng email và mật khẩu.
   *
   * Quy trình:
   * 1. Tìm user theo email (chỉ user đang active và chưa bị xóa mềm).
   * 2. So sánh mật khẩu nhập vào với hash đã lưu bằng bcrypt.compare.
   * 3. Ký và trả về cặp Access Token + Refresh Token.
   *
   * Lưu ý bảo mật: Cả hai trường hợp "email không tồn tại" và "sai mật khẩu"
   * đều trả về cùng một thông báo lỗi để tránh lộ thông tin tài khoản.
   *
   * @param input - Dữ liệu đăng nhập đã được validate bởi `loginSchema`.
   * @returns Đối tượng chứa thông tin user (không có password) và cặp token JWT.
   * @throws {AppError} 401 INVALID_CREDENTIALS - Nếu email không tồn tại, tài khoản bị khóa (isActive=false) hoặc sai mật khẩu.
   */
  static async login(input: LoginInput) {
    const user = await prisma.user.findFirst({
      where: {
        email: input.email,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!user) {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.password);
    if (!isPasswordValid) {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const tokens = createAuthTokens(toAuthPayload(user.id, user.role));

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        avatarUrl: user.avatarUrl,
        insuranceId: user.insuranceId,
      },
      ...tokens,
    };
  }

  /**
   * Làm mới cặp Access Token + Refresh Token bằng Refresh Token hiện tại.
   *
   * Quy trình:
   * 1. Giải mã và xác minh Refresh Token bằng JWT_REFRESH_SECRET.
   * 2. Tìm user theo userId trong payload, đảm bảo user vẫn đang active.
   * 3. Ký và trả về cặp token mới (rotation pattern).
   *
   * @param input - Đối tượng chứa `refreshToken` string đã được validate.
   * @returns Đối tượng chứa thông tin user và cặp Access Token + Refresh Token mới.
   * @throws {AppError} 401 INVALID_REFRESH_TOKEN - Nếu token không hợp lệ, hết hạn hoặc user không còn tồn tại/bị khóa.
   */
  static async refresh(input: RefreshTokenInput) {
    const payload = verifyRefreshToken(input.refreshToken);
    const user = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        deletedAt: null,
        isActive: true,
      },
      select: publicUserSelect,
    });

    if (!user) {
      throw AppError.unauthorized('User no longer exists', 'INVALID_REFRESH_TOKEN');
    }

    const tokens = createAuthTokens(toAuthPayload(user.id, user.role));

    return {
      user,
      ...tokens,
    };
  }
}

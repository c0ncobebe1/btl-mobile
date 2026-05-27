import { prisma } from '../../config/database';
import { AppError } from '../../utils/app-error';
import type { UpdateCurrentUserInput } from './users.dto';

/**
 * Các trường thông tin người dùng được phép trả về khi query hồ sơ cá nhân.
 * Trường `password` bị loại trừ hoàn toàn để bảo mật.
 */
const currentUserSelect = {
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
 * Service xử lý nghiệp vụ quản lý hồ sơ người dùng hiện tại.
 * Chỉ cho phép người dùng thao tác trên chính tài khoản của mình (không có IDOR).
 */
export class UsersService {
  /**
   * Lấy thông tin hồ sơ cá nhân của người dùng đang đăng nhập.
   *
   * - Tự động lọc bỏ trường `password` qua `currentUserSelect`.
   * - Nếu user là Bác sĩ, bổ sung thêm trường `doctorStatus` từ bảng Doctor.
   * - Chỉ trả về user còn active và chưa bị xóa mềm.
   *
   * @param userId - UUID của người dùng lấy từ JWT payload (req.user.userId).
   * @returns Đối tượng thông tin hồ sơ người dùng. Bao gồm `doctorStatus` nếu là Bác sĩ.
   * @throws {AppError} 404 USER_NOT_FOUND - Nếu user không tồn tại hoặc đã bị vô hiệu hóa.
   */
  static async getCurrentUser(userId: string) {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        ...currentUserSelect,
        doctor: {
          select: { status: true },
        },
      },
    });

    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    const { doctor, ...rest } = user;
    return {
      ...rest,
      ...(doctor ? { doctorStatus: doctor.status } : {}),
    };
  }

  /**
   * Cập nhật thông tin hồ sơ cá nhân của người dùng đang đăng nhập.
   *
   * Chỉ cho phép cập nhật các trường văn bản cơ bản:
   * `name`, `phone`, `address`, `insuranceId`, `dateOfBirth`.
   * Các trường nhạy cảm như `email`, `password`, `role` KHÔNG được phép thay đổi qua API này.
   *
   * Trước khi cập nhật, hàm gọi `getCurrentUser` để xác minh user còn tồn tại và active.
   * Các giá trị `undefined` trong input sẽ KHÔNG ghi đè dữ liệu hiện tại (partial update).
   * Các giá trị `null` trong input sẽ ghi `null` vào DB (xóa trường đó).
   *
   * @param userId - UUID của người dùng lấy từ JWT payload.
   * @param input  - Dữ liệu cập nhật đã được validate bởi `updateCurrentUserSchema`.
   * @returns Đối tượng thông tin hồ sơ sau khi cập nhật (không có password).
   * @throws {AppError} 404 USER_NOT_FOUND - Nếu user không tồn tại (kiểm tra qua getCurrentUser).
   */
  static async updateCurrentUser(userId: string, input: UpdateCurrentUserInput) {
    await this.getCurrentUser(userId);

    return prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        phone: input.phone === undefined ? undefined : input.phone,
        address: input.address === undefined ? undefined : input.address,
        insuranceId: input.insuranceId === undefined ? undefined : input.insuranceId,
        dateOfBirth: input.dateOfBirth === undefined ? undefined : input.dateOfBirth,
      },
      select: currentUserSelect,
    });
  }
}

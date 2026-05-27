import jwt, { type SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';

/**
 * Cấu trúc payload được nhúng bên trong JWT.
 * Chứa thông tin định danh và phân quyền tối thiểu của người dùng.
 */
interface TokenPayload {
  /** UUID của người dùng trong cơ sở dữ liệu. */
  userId: string;
  /** Vai trò của người dùng: PATIENT | DOCTOR | ADMIN. */
  role: Role;
}

/**
 * Cặp token JWT được trả về sau khi đăng nhập hoặc đăng ký thành công.
 */
export interface AuthTokens {
  /** Access Token ngắn hạn, dùng để xác thực từng request API. */
  accessToken: string;
  /** Refresh Token dài hạn, dùng để xin cấp lại Access Token khi hết hạn. */
  refreshToken: string;
}

/**
 * Ký và tạo Access Token ngắn hạn từ payload người dùng.
 * Thời hạn được lấy từ biến môi trường `JWT_EXPIRES_IN` (ví dụ: "15m").
 *
 * @param payload - Đối tượng chứa `userId` và `role` của người dùng.
 * @returns Chuỗi JWT đã ký bằng `JWT_SECRET`.
 */
export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

/**
 * Ký và tạo Refresh Token dài hạn từ payload người dùng.
 * Thời hạn được lấy từ biến môi trường `JWT_REFRESH_EXPIRES_IN` (ví dụ: "7d").
 *
 * @param payload - Đối tượng chứa `userId` và `role` của người dùng.
 * @returns Chuỗi JWT đã ký bằng `JWT_REFRESH_SECRET`.
 */
export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

/**
 * Giải mã và xác minh tính hợp lệ của Refresh Token.
 * Dùng trong quy trình làm mới token (AuthService.refresh).
 *
 * @param token - Chuỗi Refresh Token cần xác minh.
 * @returns Payload `{ userId, role }` được giải mã từ token.
 * @throws {JsonWebTokenError} Nếu token sai định dạng hoặc chữ ký không khớp.
 * @throws {TokenExpiredError} Nếu token đã hết hạn.
 */
export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

/**
 * Tạo đồng thời cả Access Token và Refresh Token từ cùng một payload.
 * Đây là hàm tiện ích dùng tập trung ở AuthService sau khi đăng nhập/đăng ký/refresh.
 *
 * @param payload - Đối tượng chứa `userId` và `role` của người dùng.
 * @returns Đối tượng `AuthTokens` chứa `accessToken` và `refreshToken`.
 */
export function createAuthTokens(payload: TokenPayload): AuthTokens {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

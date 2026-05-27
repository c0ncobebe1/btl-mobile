import { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { AuthService } from './auth.service';
import { loginSchema, refreshTokenSchema, registerSchema } from './auth.dto';

/**
 * Controller xử lý các HTTP request liên quan đến xác thực người dùng.
 * Mỗi method validate dữ liệu đầu vào bằng Zod schema trước khi chuyển
 * xuống AuthService để xử lý nghiệp vụ.
 *
 * @route Prefix: /api/v1/auth
 */
export class AuthController {
  /**
   * Xử lý yêu cầu đăng ký tài khoản mới.
   *
   * @route   POST /api/v1/auth/register
   * @access  Public
   * @body    { email, password, name, role?: 'PATIENT'|'DOCTOR', phone? }
   * @returns 201 - Thông tin user mới và cặp JWT token.
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { body } = registerSchema.parse({ body: req.body });
      const data = await AuthService.register(body);
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Xử lý yêu cầu đăng nhập bằng email và mật khẩu.
   *
   * @route   POST /api/v1/auth/login
   * @access  Public
   * @body    { email, password }
   * @returns 200 - Thông tin user và cặp JWT token (accessToken + refreshToken).
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { body } = loginSchema.parse({ body: req.body });
      const data = await AuthService.login(body);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Xử lý yêu cầu làm mới Access Token bằng Refresh Token.
   * Dùng khi Access Token hết hạn, client gửi Refresh Token để lấy cặp token mới.
   *
   * @route   POST /api/v1/auth/refresh
   * @access  Public (chỉ cần Refresh Token hợp lệ)
   * @body    { refreshToken }
   * @returns 200 - Thông tin user và cặp JWT token mới.
   */
  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { body } = refreshTokenSchema.parse({ body: req.body });
      const data = await AuthService.refresh(body);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }
}

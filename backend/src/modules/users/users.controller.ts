import { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { UsersService } from './users.service';
import { updateCurrentUserSchema } from './users.dto';

/**
 * Controller xử lý các HTTP request liên quan đến hồ sơ người dùng hiện tại.
 * Tất cả các route đều yêu cầu xác thực JWT (được bảo vệ bởi `authenticate` middleware).
 *
 * @route Prefix: /api/v1/users
 */
export class UsersController {
  /**
   * Lấy thông tin hồ sơ cá nhân của người dùng đang đăng nhập.
   *
   * userId được lấy tự động từ JWT payload (req.user.userId) do middleware
   * `authenticate` giải mã và gắn vào request, đảm bảo không có lỗi IDOR.
   *
   * @route   GET /api/v1/users/me
   * @access  Private (yêu cầu Bearer Token hợp lệ)
   * @returns 200 - Thông tin hồ sơ người dùng (không có password).
   */
  static async getCurrentUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }

      const data = await UsersService.getCurrentUser(req.user.userId);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cập nhật thông tin hồ sơ cá nhân của người dùng đang đăng nhập.
   *
   * Chỉ cho phép sửa các trường văn bản cơ bản: name, phone, address,
   * insuranceId, dateOfBirth. Các trường nhạy cảm (email, password, role)
   * không thể thay đổi qua endpoint này.
   *
   * @route   PUT /api/v1/users/me
   * @access  Private (yêu cầu Bearer Token hợp lệ)
   * @body    { name?, phone?, address?, insuranceId?, dateOfBirth? }
   * @returns 200 - Thông tin hồ sơ sau khi cập nhật (không có password).
   */
  static async updateCurrentUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }

      const { body } = updateCurrentUserSchema.parse({ body: req.body });
      const data = await UsersService.updateCurrentUser(req.user.userId, body);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }
}

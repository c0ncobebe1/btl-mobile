import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { sendError } from '../utils/api-response';
import { Role } from '@prisma/client';

/**
 * Cấu trúc payload JWT sau khi giải mã từ Access Token.
 */
interface JwtPayload {
  /** UUID của người dùng trong cơ sở dữ liệu. */
  userId: string;
  /** Vai trò của người dùng: PATIENT | DOCTOR | ADMIN. */
  role: Role;
}

/**
 * Mở rộng interface Request của Express để gắn thêm thuộc tính `user`
 * sau khi middleware `authenticate` giải mã JWT thành công.
 */
declare global {
  namespace Express {
    interface Request {
      /** Payload JWT đã xác thực, có giá trị sau khi qua middleware `authenticate`. */
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware xác thực JWT Access Token cho các route được bảo vệ.
 *
 * Quy trình:
 * 1. Đọc header `Authorization`, kiểm tra định dạng `Bearer <token>`.
 * 2. Giải mã và xác minh token bằng `JWT_SECRET`.
 * 3. Gắn payload (`userId`, `role`) vào `req.user` để các handler tiếp theo sử dụng.
 *
 * Nếu token thiếu, sai định dạng hoặc hết hạn, trả về 401 ngay
 * mà không tiếp tục vào handler tiếp theo.
 *
 * @param req  - Express Request object.
 * @param res  - Express Response object.
 * @param next - Express NextFunction để chuyển tiếp sang handler hoặc error handler.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 'UNAUTHORIZED', 'Missing or invalid token', 401);
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    sendError(res, 'UNAUTHORIZED', 'Invalid or expired token', 401);
  }
}

/**
 * Middleware factory tạo middleware kiểm tra phân quyền theo vai trò (Role-Based Access Control).
 *
 * Phải được dùng SAU middleware `authenticate`. Nếu `req.user` chưa được gán
 * (tức là chưa qua xác thực) hoặc vai trò của user không nằm trong danh sách
 * cho phép, request sẽ bị từ chối.
 *
 * @param roles - Danh sách các vai trò được phép truy cập route này.
 * @returns Middleware function kiểm tra role của `req.user`.
 *
 * @example
 * // Chỉ ADMIN mới được truy cập
 * router.get('/admin', authenticate, authorize('ADMIN'), handler);
 *
 * @example
 * // Cả DOCTOR và ADMIN đều được phép
 * router.put('/approve', authenticate, authorize('DOCTOR', 'ADMIN'), handler);
 */
export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Not authenticated', 401);
      return;
    }
    if (!roles.includes(req.user.role)) {
      sendError(res, 'FORBIDDEN', 'Insufficient permissions', 403);
      return;
    }
    next();
  };
}

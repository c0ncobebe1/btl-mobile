import { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { AiService } from './ai.service';
import { HealthService } from '../health/health.service';
import {
  sendMessageSchema,
  getSessionMessagesSchema,
  extractSymptomsSchema,
} from './ai.schemas';

/**
 * Controller xử lý các HTTP request liên quan đến AI Chatbot y tế.
 * Tất cả route đều yêu cầu xác thực JWT (`authenticate` middleware).
 *
 * @route Prefix: /api/v1/ai
 */
export class AiController {
  /**
   * Gửi tin nhắn đến AI chatbot và nhận phản hồi.
   * Tự động tạo phiên chat mới nếu không truyền `sessionId`.
   *
   * @route   POST /api/v1/ai/chat
   * @access  Private (yêu cầu Bearer Token hợp lệ)
   * @body    { message: string, sessionId?: string (UUID) }
   * @returns 201 - Đối tượng gồm sessionId, userMessage và aiMessage vừa được lưu.
   */
  static async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { body } = sendMessageSchema.parse({ body: req.body });
      const userId = req.user!.userId;
      const data = await AiService.sendChatMessage(userId, body.sessionId, body.message);
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lấy danh sách tất cả phiên chat của người dùng đang đăng nhập,
   * sắp xếp theo thứ tự mới nhất. Mỗi phiên bao gồm preview tin nhắn cuối.
   *
   * @route   GET /api/v1/ai/chat/sessions
   * @access  Private (yêu cầu Bearer Token hợp lệ)
   * @returns 200 - Mảng các phiên chat (id, title, summary, lastMessage, createdAt, updatedAt).
   */
  static async getSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const data = await AiService.getChatSessions(userId);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mở lại và tải toàn bộ lịch sử tin nhắn của một phiên chat cũ.
   * Có kiểm tra quyền sở hữu để tránh lỗi IDOR (người dùng A không thể
   * đọc phiên chat của người dùng B dù biết sessionId).
   *
   * @route   GET /api/v1/ai/chat/sessions/:id
   * @access  Private (yêu cầu Bearer Token hợp lệ)
   * @params  id - UUID của phiên chat cần mở lại.
   * @returns 200 - Đối tượng gồm thông tin phiên chat và mảng tin nhắn theo thứ tự thời gian.
   */
  static async getSessionMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const { params } = getSessionMessagesSchema.parse({ params: req.params });
      const userId = req.user!.userId;
      const data = await AiService.getSessionMessages(userId, params.id);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Trích xuất danh sách triệu chứng từ đoạn văn bản mô tả của người dùng,
   * đồng thời gợi ý chuyên khoa y tế phù hợp nhất và mức độ khẩn cấp.
   *
   * @route   POST /api/v1/ai/symptoms
   * @access  Private (yêu cầu Bearer Token hợp lệ)
   * @body    { text: string } - Văn bản mô tả triệu chứng (tối đa 2000 ký tự).
   * @returns 200 - Đối tượng gồm symptoms[], suggestedSpecialties[], urgency và reasoning.
   */
  static async extractSymptoms(req: Request, res: Response, next: NextFunction) {
    try {
      const { body } = extractSymptomsSchema.parse({ body: req.body });
      const data = await AiService.extractSymptoms(body.text);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lấy danh sách gợi ý sức khỏe cá nhân hóa cho người dùng.
   * Sử dụng lịch sử khám bệnh và chỉ số sức khỏe để tạo lời khuyên phù hợp.
   *
   * @route   GET /api/v1/ai/health-tips
   * @access  Private (yêu cầu Bearer Token hợp lệ)
   * @returns 200 - Danh sách các gợi ý sức khỏe từ AI.
   */
  static async getHealthTips(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await HealthService.getHealthTips(req.user!.userId);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }
}

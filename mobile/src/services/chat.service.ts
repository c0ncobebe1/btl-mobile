import { api, extractData } from './api';

/**
 * Cấu trúc một tin nhắn đơn trong phiên chat AI.
 */
export interface ChatMessageItem {
  /** UUID của tin nhắn. */
  id: string;
  /** Vai trò gửi tin: 'USER' (người dùng) hoặc 'ASSISTANT' (AI). */
  role: 'USER' | 'ASSISTANT';
  /** Nội dung văn bản của tin nhắn. */
  content: string;
  /** Thời điểm tin nhắn được tạo (ISO 8601 string). */
  createdAt: string;
}

/**
 * Cấu trúc một phiên chat trong danh sách phiên của người dùng.
 * Bao gồm thông tin tóm tắt và tin nhắn cuối để hiển thị preview.
 */
export interface ChatSessionItem {
  /** UUID của phiên chat. */
  id: string;
  /** Tiêu đề phiên chat (thường là 100 ký tự đầu của tin nhắn đầu tiên). */
  title: string | null;
  /** Tóm tắt nội dung phiên chat (hiện tại chưa sử dụng). */
  summary: string | null;
  /** Tin nhắn cuối cùng trong phiên, dùng để hiển thị preview. `null` nếu chưa có tin nhắn. */
  lastMessage: {
    content: string;
    role: 'USER' | 'ASSISTANT';
    createdAt: string;
  } | null;
  /** Thời điểm phiên chat được tạo. */
  createdAt: string;
  /** Thời điểm phiên chat được cập nhật lần cuối (dùng để sắp xếp). */
  updatedAt: string;
}

/**
 * Cấu trúc response khi mở lại một phiên chat cũ.
 * Gồm thông tin phiên và toàn bộ lịch sử tin nhắn.
 */
export interface SessionMessagesResponse {
  /** Thông tin tóm tắt của phiên chat. */
  session: {
    id: string;
    title: string | null;
    summary: string | null;
    createdAt: string;
  };
  /** Danh sách toàn bộ tin nhắn trong phiên theo thứ tự thời gian (cũ nhất trước). */
  messages: ChatMessageItem[];
}

/**
 * Cấu trúc response từ API trích xuất triệu chứng.
 */
export interface SymptomExtractionResponse {
  /** Danh sách triệu chứng được AI phát hiện từ văn bản mô tả. */
  symptoms: string[];
  /** Danh sách chuyên khoa phù hợp nhất (đã khớp với DB). */
  suggestedSpecialties: {
    id: string;
    name: string;
    description: string | null;
  }[];
  /** Mức độ khẩn cấp: 'low' | 'medium' | 'high'. */
  urgency: string;
  /** Giải thích của AI về lý do gợi ý chuyên khoa. */
  reasoning: string;
}

/**
 * Lấy danh sách tất cả phiên chat AI của người dùng đang đăng nhập.
 * Danh sách được sắp xếp theo thứ tự mới nhất, mỗi phiên bao gồm preview tin nhắn cuối.
 *
 * @returns Mảng `ChatSessionItem[]` chứa thông tin các phiên chat.
 * @throws Lỗi từ axios nếu request thất bại (mạng, 401, v.v.).
 */
export async function getChatSessions(): Promise<ChatSessionItem[]> {
  const response = await api.get('/ai/chat/sessions');
  return extractData<ChatSessionItem[]>(response);
}

/**
 * Tải toàn bộ lịch sử tin nhắn của một phiên chat cụ thể để hiển thị lại.
 * API server sẽ kiểm tra quyền sở hữu phiên (chống IDOR):
 * người dùng chỉ có thể đọc phiên chat của chính mình.
 *
 * @param sessionId - UUID của phiên chat cần mở lại.
 * @returns Đối tượng `SessionMessagesResponse` gồm thông tin phiên và mảng tin nhắn.
 * @throws Lỗi 404 nếu phiên không tồn tại hoặc không thuộc về người dùng hiện tại.
 */
export async function getSessionMessages(
  sessionId: string
): Promise<SessionMessagesResponse> {
  const response = await api.get(`/ai/chat/sessions/${sessionId}`);
  return extractData<SessionMessagesResponse>(response);
}

/**
 * Gửi văn bản mô tả triệu chứng lên AI để phân tích và gợi ý chuyên khoa.
 * Không cần phiên chat, đây là tính năng độc lập phục vụ nhanh cho người dùng.
 *
 * @param text - Đoạn văn bản mô tả triệu chứng của người dùng (tối đa 2000 ký tự).
 * @returns Đối tượng `SymptomExtractionResponse` gồm symptoms, suggestedSpecialties, urgency, reasoning.
 * @throws Lỗi từ axios nếu request thất bại.
 */
export async function extractSymptoms(
  text: string
): Promise<SymptomExtractionResponse> {
  const response = await api.post('/ai/symptoms', { text });
  return extractData<SymptomExtractionResponse>(response);
}

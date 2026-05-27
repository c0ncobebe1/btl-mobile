import { prisma } from '../../config/database';
import { chatCompletion } from '../../utils/ai-client';
import { AppError } from '../../utils/app-error';
import type { ChatMessageRole } from '@prisma/client';

/**
 * System prompt định hướng hành vi chatbot y tế văn bản.
 * Hướng dẫn AI hỏi thêm về triệu chứng, gợi ý chuyên khoa phù hợp
 * và luôn từ chối xác nhận chẩn đoán y khoa.
 */
const SYSTEM_PROMPT = `You are a medical assistant chatbot for a clinic appointment system.
- Ask clarifying questions about symptoms (2-3 questions max)
- After gathering info, suggest which medical specialty to visit
- Always include disclaimer: this is not a medical diagnosis
- Be concise and friendly
- Respond in the same language the user writes in`;

/**
 * System prompt chuyên dụng cho tác vụ trích xuất triệu chứng từ văn bản.
 * Yêu cầu AI trả về dữ liệu cấu trúc JSON chứa danh sách triệu chứng,
 * chuyên khoa đề xuất, mức độ khẩn cấp và lý do phân tích.
 */
const SYMPTOM_EXTRACTION_PROMPT = `You are a medical triage assistant. Given the user's symptom description, extract the key symptoms and suggest the most appropriate medical specialty (or specialties) to visit.

Respond in JSON format only:
{
  "symptoms": ["symptom1", "symptom2"],
  "suggestedSpecialties": ["Specialty Name 1"],
  "urgency": "low" | "medium" | "high",
  "reasoning": "Brief explanation"
}

Use the specialty names exactly as they appear in the database when possible.`;

/**
 * Service xử lý các nghiệp vụ AI Chatbot y tế.
 * Bao gồm: Gửi tin nhắn hội thoại, liệt kê phiên chat,
 * mở lại phiên chat cũ và trích xuất triệu chứng từ văn bản.
 */
export class AiService {
  /**
   * Gửi tin nhắn đến AI chatbot và nhận phản hồi.
   *
   * Quy trình:
   * 1. Nếu `sessionId` được cung cấp: tìm phiên chat cũ và xác minh quyền sở hữu (chống IDOR).
   *    Nếu không: tạo phiên chat mới với tiêu đề là 100 ký tự đầu của tin nhắn.
   * 2. Lưu tin nhắn của user vào DB (`role = USER`).
   * 3. Truy xuất toàn bộ lịch sử hội thoại của phiên để tái tạo ngữ cảnh cho AI.
   * 4. Gọi OpenRouter API qua `chatCompletion` với system prompt y tế và lịch sử hội thoại.
   * 5. Lưu câu trả lời của AI vào DB (`role = ASSISTANT`).
   * 6. Cập nhật tiêu đề phiên chat nếu đây là lần gửi đầu tiên.
   *
   * @param userId    - UUID người dùng đang đăng nhập (từ JWT).
   * @param sessionId - UUID phiên chat cũ muốn tiếp tục, hoặc `undefined` để tạo phiên mới.
   * @param message   - Nội dung tin nhắn của người dùng (tối đa 2000 ký tự).
   * @returns Đối tượng gồm `sessionId`, `userMessage` (tin nhắn user vừa lưu) và `aiMessage` (phản hồi AI).
   * @throws {AppError} 404 NOT_FOUND - Nếu `sessionId` được cung cấp nhưng không tìm thấy hoặc không thuộc về user này.
   */
  static async sendChatMessage(userId: string, sessionId: string | undefined, message: string) {
    // Create session if needed
    let session;
    if (sessionId) {
      session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });
      if (!session) {
        throw AppError.notFound('Chat session not found');
      }
    } else {
      session = await prisma.chatSession.create({
        data: {
          userId,
          title: message.slice(0, 100),
        },
      });
    }

    // Save user message
    const userMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'USER' as ChatMessageRole,
        content: message,
      },
    });

    // Build conversation history for AI
    const history = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });

    const aiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map((msg) => ({
        role: (msg.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    // Call AI
    const aiResponseText = await chatCompletion(aiMessages);

    // Save AI response
    const aiMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT' as ChatMessageRole,
        content: aiResponseText,
      },
    });

    // Update session title if it's the first message
    if (!sessionId) {
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { title: message.slice(0, 100) },
      });
    }

    return {
      sessionId: session.id,
      userMessage: {
        id: userMessage.id,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      aiMessage: {
        id: aiMessage.id,
        role: aiMessage.role,
        content: aiMessage.content,
        createdAt: aiMessage.createdAt,
      },
    };
  }

  /**
   * Lấy danh sách tất cả phiên chat của người dùng, sắp xếp mới nhất lên đầu.
   * Mỗi phiên bao gồm tin nhắn cuối cùng để hiển thị preview trên danh sách.
   *
   * @param userId - UUID người dùng đang đăng nhập (từ JWT).
   * @returns Mảng các đối tượng phiên chat, mỗi phần tử gồm id, title, summary,
   *          lastMessage (tin nhắn cuối), createdAt, updatedAt.
   */
  static async getChatSessions(userId: string) {
    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      title: session.title,
      summary: session.summary,
      lastMessage: session.messages[0] ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
  }

  /**
   * Mở lại phiên chat cũ và tải toàn bộ lịch sử tin nhắn của phiên đó.
   *
   * Bảo mật IDOR: Điều kiện `{ id: sessionId, userId }` trong query đảm bảo
   * người dùng chỉ có thể truy cập phiên chat của chính mình.
   * Nếu cố tình truyền sessionId của người khác, hệ thống sẽ trả về 404.
   *
   * @param userId    - UUID người dùng đang đăng nhập (từ JWT).
   * @param sessionId - UUID của phiên chat cần mở lại.
   * @returns Đối tượng gồm thông tin phiên chat (`session`) và mảng tin nhắn (`messages`) theo thứ tự thời gian.
   * @throws {AppError} 404 NOT_FOUND - Nếu phiên chat không tồn tại hoặc không thuộc về user này (chống IDOR).
   */
  static async getSessionMessages(userId: string, sessionId: string) {
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw AppError.notFound('Chat session not found');
    }

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    return {
      session: {
        id: session.id,
        title: session.title,
        summary: session.summary,
        createdAt: session.createdAt,
      },
      messages,
    };
  }

  /**
   * Trích xuất danh sách triệu chứng từ văn bản mô tả của người dùng
   * và gợi ý chuyên khoa phù hợp dựa trên dữ liệu chuyên khoa trong DB.
   *
   * Quy trình:
   * 1. Truy xuất toàn bộ danh sách chuyên khoa trong DB kèm danh sách triệu chứng đặc trưng.
   * 2. Xây dựng context chuyên khoa và ghép vào prompt để AI có thông tin tham chiếu.
   * 3. Gọi AI với `temperature = 0.3` (ít ngẫu nhiên hơn, đảm bảo JSON output ổn định).
   * 4. Parse JSON từ kết quả AI. Khớp tên chuyên khoa gợi ý với bản ghi DB thực tế.
   * 5. Nếu AI không trả về JSON hợp lệ, trả về mảng rỗng và raw text làm `reasoning`.
   *
   * @param text - Văn bản mô tả triệu chứng của người dùng (tối đa 2000 ký tự).
   * @returns Đối tượng gồm `symptoms` (mảng triệu chứng), `suggestedSpecialties` (mảng chuyên khoa khớp DB),
   *          `urgency` ('low'|'medium'|'high') và `reasoning` (giải thích của AI).
   */
  static async extractSymptoms(text: string) {
    // Get all specialties from DB for context
    const specialties = await prisma.specialty.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, description: true, symptoms: true },
    });

    const specialtyContext = specialties
      .map((s) => `- ${s.name}: ${s.symptoms.join(', ')}`)
      .join('\n');

    const prompt = `${SYMPTOM_EXTRACTION_PROMPT}\n\nAvailable specialties:\n${specialtyContext}\n\nUser symptoms: ${text}`;

    const aiResponse = await chatCompletion([
      { role: 'system', content: prompt },
      { role: 'user', content: text },
    ], { temperature: 0.3 });

    // Parse JSON from AI response
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      const parsed = JSON.parse(jsonMatch[0]) as {
        symptoms: string[];
        suggestedSpecialties: string[];
        urgency: string;
        reasoning: string;
      };

      // Match suggested specialties with DB records
      const matchedSpecialties = specialties.filter((s) =>
        parsed.suggestedSpecialties.some(
          (suggested) => s.name.toLowerCase() === suggested.toLowerCase()
        )
      );

      return {
        symptoms: parsed.symptoms,
        suggestedSpecialties: matchedSpecialties.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
        })),
        urgency: parsed.urgency,
        reasoning: parsed.reasoning,
      };
    } catch {
      // If AI response isn't valid JSON, return raw text
      return {
        symptoms: [],
        suggestedSpecialties: [],
        urgency: 'medium',
        reasoning: aiResponse,
      };
    }
  }
}

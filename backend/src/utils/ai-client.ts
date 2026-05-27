import { env } from '../config/env';

/**
 * Cấu trúc một tin nhắn trong cuộc hội thoại gửi đến LLM.
 */
interface ChatMessage {
  /** Vai trò người gửi: 'system' (lệnh hệ thống), 'user' (người dùng), 'assistant' (AI). */
  role: 'system' | 'user' | 'assistant';
  /** Nội dung tin nhắn: chuỗi văn bản đơn giản hoặc mảng ContentPart (đối với multimodal). */
  content: string | ContentPart[];
}

/**
 * Một phần tử nội dung trong tin nhắn multimodal (văn bản + hình ảnh).
 */
interface ContentPart {
  /** Loại nội dung: 'text' hoặc 'image_url'. */
  type: 'text' | 'image_url';
  /** Nội dung văn bản (khi type = 'text'). */
  text?: string;
  /** URL hình ảnh (khi type = 'image_url'). */
  image_url?: { url: string };
}

/**
 * Cấu trúc phản hồi JSON trả về từ OpenRouter/OpenAI Chat Completions API.
 */
interface ChatCompletionResponse {
  choices: {
    message: {
      role: string;
      content: string;
    };
  }[];
}

/**
 * Gọi OpenRouter (hoặc bất kỳ API tương thích OpenAI) để thực hiện chat completion.
 * Hỗ trợ tất cả các model có sẵn trên OpenRouter (Gemini, GPT-4o, Claude, Llama, v.v.).
 *
 * Cấu hình API provider, model mặc định và API key được lấy từ biến môi trường:
 * - `AI_BASE_URL`: Base URL của API (ví dụ: https://openrouter.ai/api/v1)
 * - `AI_API_KEY`: API key để xác thực
 * - `AI_MODEL`: Model mặc định (ví dụ: google/gemini-2.0-flash-exp:free)
 * - `AI_PROVIDER`: Tên provider (nếu là 'openrouter' sẽ thêm header đặc biệt)
 *
 * @param messages  - Mảng tin nhắn lịch sử hội thoại gồm system prompt và các lượt chat.
 * @param options   - Tuỳ chọn ghi đè: model, temperature (0–1), maxTokens.
 * @returns Chuỗi văn bản nội dung phản hồi của AI (content của choice đầu tiên).
 * @throws {Error} Nếu API trả về status code lỗi (non-2xx).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const model = options?.model ?? env.AI_MODEL;
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? 2048;

  const response = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.AI_API_KEY}`,
      ...(env.AI_PROVIDER === 'openrouter' && {
        'HTTP-Referer': env.APP_URL,
        'X-Title': 'BTL Healthcare',
      }),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[ai-client] non-ok response', {
      status: response.status,
      url: `${env.AI_BASE_URL}/chat/completions`,
      model,
      bodyPreview: error.slice(0, 1000),
    });
    throw new Error(`AI API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices[0]?.message?.content ?? '';
}

/**
 * Gửi hình ảnh lên AI để phân tích thị giác (Vision / OCR).
 * Tích hợp với các model đa phương thức trên OpenRouter
 * như `google/gemini-2.0-flash-exp`, `gpt-4o`, v.v.
 *
 * Được dùng chủ yếu để OCR đơn thuốc (module của Tú Anh).
 *
 * @param imageUrl - URL công khai hoặc data URL base64 của hình ảnh cần phân tích.
 * @param prompt   - Yêu cầu phân tích bằng ngôn ngữ tự nhiên gửi đến AI.
 * @param options  - Tuỳ chọn: model ghi đè (mặc định dùng `AI_MODEL`).
 * @returns Chuỗi văn bản kết quả phân tích hình ảnh từ AI.
 * @throws {Error} Nếu API trả về status code lỗi.
 */
export async function visionAnalysis(
  imageUrl: string,
  prompt: string,
  options?: { model?: string }
): Promise<string> {
  const model = options?.model ?? env.AI_MODEL;

  return chatCompletion(
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    { model }
  );
}

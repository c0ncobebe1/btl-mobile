import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

/**
 * Base URL của backend API, được đọc từ biến môi trường Expo.
 * Cần cập nhật thành IP máy trong mạng nội bộ khi test trên thiết bị thật
 * (ví dụ: http://192.168.1.15:3000/api/v1).
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

/**
 * Axios instance được cấu hình sẵn để giao tiếp với backend API.
 *
 * Cấu hình mặc định:
 * - `baseURL`: Đọc từ `EXPO_PUBLIC_API_URL` trong file `.env`.
 * - `timeout`: 15 giây — tránh treo request vô thời hạn trên mạng chậm.
 * - `Content-Type`: `application/json` cho tất cả request.
 *
 * Đã tích hợp sẵn 2 interceptor:
 * - **Request interceptor**: Tự động gắn JWT Access Token vào header `Authorization`.
 * - **Response interceptor**: Tự động xóa token và đưa về màn hình đăng nhập khi nhận 401.
 */
export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Tự động đọc Access Token từ SecureStore
 * và gắn vào header `Authorization: Bearer <token>` trước mỗi request.
 *
 * Nhờ interceptor này, các service không cần tự quản lý token thủ công.
 */
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Response interceptor: Xử lý lỗi 401 Unauthorized toàn cục.
 *
 * Khi nhận được HTTP 401 (token hết hạn hoặc không hợp lệ):
 * 1. Xóa accessToken và refreshToken khỏi SecureStore.
 * 2. Auth store (`useAuthStore`) sẽ phát hiện và điều hướng về màn hình đăng nhập.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      // Navigation to login will be handled by auth store
    }
    return Promise.reject(error);
  }
);

/**
 * Hàm tiện ích trích xuất trường `data` từ cấu trúc phản hồi chuẩn của API.
 * Backend luôn bọc dữ liệu theo format: `{ success: true, data: T }`.
 *
 * @template T - Kiểu dữ liệu của trường `data` trong response.
 * @param response - Đối tượng response từ axios với cấu trúc `{ data: { success, data: T } }`.
 * @returns Dữ liệu thực sự của type T, bỏ qua lớp bọc `success`.
 *
 * @example
 * const sessions = await getChatSessions();
 * // Thay vì: response.data.data
 * // Dùng: extractData<ChatSessionItem[]>(response)
 */
export function extractData<T>(response: { data: { success: boolean; data: T } }): T {
  return response.data.data;
}

/**
 * Hàm tiện ích trích xuất cả `data` và `meta` từ phản hồi phân trang của API.
 * Backend luôn bọc dữ liệu phân trang theo format:
 * `{ success: true, data: T, meta: { page, limit, total, totalPages } }`.
 *
 * @template T - Kiểu dữ liệu của trường `data` (thường là mảng).
 * @param response - Đối tượng response từ axios với cấu trúc phân trang.
 * @returns Đối tượng gồm `data` (mảng dữ liệu) và `meta` (thông tin phân trang).
 */
export function extractPaginatedData<T>(
  response: {
    data: {
      success: boolean;
      data: T;
      meta: { page: number; limit: number; total: number; totalPages: number };
    };
  }
) {
  return {
    data: response.data.data,
    meta: response.data.meta,
  };
}

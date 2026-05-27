import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';
import type { Role, User } from '../types';

/**
 * Định nghĩa cấu trúc state và các action của Auth Store.
 * Được quản lý bởi Zustand, chia sẻ trạng thái đăng nhập toàn ứng dụng.
 */
interface AuthState {
  /** Thông tin người dùng đang đăng nhập. `null` nếu chưa đăng nhập. */
  user: User | null;
  /** Trạng thái xác thực: `true` nếu người dùng đã đăng nhập hợp lệ. */
  isAuthenticated: boolean;
  /** Trạng thái tải ban đầu: `true` khi app đang kiểm tra token lưu trong SecureStore. */
  isLoading: boolean;

  /**
   * Đăng nhập bằng email và mật khẩu.
   * Lưu accessToken và refreshToken vào SecureStore sau khi thành công.
   */
  login: (email: string, password: string) => Promise<void>;

  /**
   * Đăng ký tài khoản mới.
   * Lưu token vào SecureStore và cập nhật state đăng nhập ngay sau khi đăng ký.
   */
  register: (data: { email: string; password: string; name: string; role: Role }) => Promise<void>;

  /** Đăng xuất: xóa token khỏi SecureStore và reset state về trạng thái ban đầu. */
  logout: () => Promise<void>;

  /**
   * Kiểm tra và khôi phục session đăng nhập từ token đã lưu trong SecureStore.
   * Gọi khi app khởi động (trong _layout.tsx) để auto-login nếu token còn hợp lệ.
   */
  loadUser: () => Promise<void>;

  /**
   * Cập nhật trực tiếp thông tin user trong store (dùng sau khi cập nhật hồ sơ).
   * @param user - Đối tượng User mới cần ghi vào store.
   */
  setUser: (user: User) => void;
}

/**
 * Zustand store quản lý trạng thái xác thực toàn cục của ứng dụng di động.
 *
 * Token JWT được lưu trữ an toàn trong `expo-secure-store` (iOS Keychain / Android Keystore),
 * không lưu trong AsyncStorage hay bộ nhớ thông thường để tránh rủi ro bảo mật.
 *
 * @example
 * // Sử dụng trong component React Native
 * const { user, login, logout, isAuthenticated } = useAuthStore();
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  /**
   * Gọi API POST /auth/login, nhận về token và thông tin user.
   * Lưu token vào SecureStore, cập nhật state `user` và `isAuthenticated`.
   *
   * @param email    - Email tài khoản người dùng.
   * @param password - Mật khẩu tài khoản người dùng.
   */
  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user, accessToken, refreshToken } = res.data.data;
    await SecureStore.setItemAsync('accessToken', accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  /**
   * Gọi API POST /auth/register, nhận về token và tạo session đăng nhập ngay lập tức.
   * Lưu token vào SecureStore sau khi đăng ký thành công.
   *
   * @param data - Dữ liệu đăng ký: email, password, name, role ('PATIENT'|'DOCTOR').
   */
  register: async (data) => {
    const res = await api.post('/auth/register', data);
    const { user, accessToken, refreshToken } = res.data.data;
    await SecureStore.setItemAsync('accessToken', accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  /**
   * Xóa toàn bộ token khỏi SecureStore và reset state đăng nhập.
   * Expo Router sẽ tự động redirect sang màn hình login
   * nhờ điều kiện `isAuthenticated` trong _layout.tsx.
   */
  logout: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  /**
   * Kiểm tra token lưu trong SecureStore khi app khởi động.
   * Nếu token tồn tại và hợp lệ: gọi GET /users/me để lấy thông tin user và khôi phục session.
   * Nếu token không tồn tại hoặc bị hết hạn (API trả về 401): reset state về unauthenticated.
   */
  loadUser: async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const res = await api.get('/users/me');
      set({ user: res.data.data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  /**
   * Cập nhật trực tiếp đối tượng `user` trong store mà không gọi lại API.
   * Dùng sau khi cập nhật hồ sơ thành công để đồng bộ UI ngay lập tức.
   *
   * @param user - Đối tượng User đã cập nhật cần ghi vào store.
   */
  setUser: (user) => set({ user }),
}));

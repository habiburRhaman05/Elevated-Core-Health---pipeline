import axiosInstance from "@/lib/axios"
import { API_ENDPOINTS } from "@/constants"
import type { ApiResponse, LoginResponse, User } from "@/types"

export const AuthService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await axiosInstance.post<ApiResponse<LoginResponse>>(
      API_ENDPOINTS.AUTH.LOGIN,
      { email, password },
    )
    return data.data
  },

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { data } = await axiosInstance.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
      API_ENDPOINTS.AUTH.REFRESH,
      { refreshToken },
    )
    return data.data
  },

  async getMe(): Promise<User> {
    const { data } = await axiosInstance.get<ApiResponse<User>>(
      API_ENDPOINTS.AUTH.ME,
    )
    return data.data
  },

  async logout(refreshToken?: string): Promise<void> {
    await axiosInstance.post(API_ENDPOINTS.AUTH.LOGOUT, { refreshToken })
  },

  async updateProfile(input: { name?: string; email?: string }): Promise<User> {
    const { data } = await axiosInstance.patch<ApiResponse<User>>(
      API_ENDPOINTS.AUTH.PROFILE,
      input,
    )
    return data.data
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await axiosInstance.post(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, { currentPassword, newPassword })
  },

  async forgotPassword(email: string): Promise<void> {
    await axiosInstance.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, { email })
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await axiosInstance.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, { token, newPassword })
  },
}

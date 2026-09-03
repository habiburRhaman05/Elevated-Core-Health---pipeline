import axiosInstance from "@/lib/axios"
import { API_ENDPOINTS } from "@/constants"
import type { ApiResponse, EffectivePermissionMap, VaPermissionKey, VaPermissionsResponse } from "@/types"

export const PermissionsService = {
  /** Admin: a VA's full catalog with current grants (defaults filled in). */
  async getForUser(userId: string): Promise<VaPermissionsResponse> {
    const { data } = await axiosInstance.get<ApiResponse<VaPermissionsResponse>>(
      API_ENDPOINTS.ADMIN.PERMISSIONS(userId),
    )
    return data.data
  },

  /** Admin: bulk grant/revoke for one VA. */
  async updateForUser(
    userId: string,
    grants: { key: VaPermissionKey; granted: boolean }[],
  ): Promise<VaPermissionsResponse> {
    const { data } = await axiosInstance.patch<ApiResponse<VaPermissionsResponse>>(
      API_ENDPOINTS.ADMIN.PERMISSIONS(userId),
      { grants },
    )
    return data.data
  },

  /** Any authenticated user: their own effective permission map. */
  async getMine(): Promise<EffectivePermissionMap> {
    const { data } = await axiosInstance.get<ApiResponse<EffectivePermissionMap>>(API_ENDPOINTS.MY_PERMISSIONS)
    return data.data
  },
}

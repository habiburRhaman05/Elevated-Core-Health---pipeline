"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import Cookies from "js-cookie"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { setUser, setLoading, logout } from "@/store/slices/auth.slice"
import { AuthService } from "@/services/auth.service"
import { useQuery } from "@tanstack/react-query"
import { QUERY_KEYS } from "@/constants"
import { config } from "@/config"

export function useAuth() {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const { user, isAuthenticated, isLoading } = useAppSelector((state) => state.auth)

  const { data: me, isError } = useQuery({
    queryKey: QUERY_KEYS.AUTH.ME,
    queryFn: async () => {
      const userData = await AuthService.getMe()
      dispatch(setUser(userData))
      return userData
    },
    enabled: !!Cookies.get(config.auth.tokenKey),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const login = useCallback(
    async (email: string, password: string) => {
      dispatch(setLoading(true))
      try {
        const data = await AuthService.login(email, password)
        Cookies.set(config.auth.tokenKey, data.tokens.accessToken, { expires: 7, sameSite: "Lax" })
        Cookies.set(config.auth.refreshTokenKey, data.tokens.refreshToken, { expires: 30, sameSite: "Lax" })
        Cookies.set("ech_role", data.user.role, { expires: 7, sameSite: "Lax" })
        dispatch(setUser(data.user))

        if (data.user.role === "admin") {
          router.push("/admin/dashboard")
        } else {
          router.push("/dashboard")
        }
      } finally {
        dispatch(setLoading(false))
      }
    },
    [dispatch, router],
  )

  const logoutUser = useCallback(async () => {
    const refreshToken = Cookies.get(config.auth.refreshTokenKey)
    try {
      if (refreshToken) {
        await AuthService.logout(refreshToken)
      }
    } catch {
      // ignore
    }
    Cookies.remove(config.auth.tokenKey)
    Cookies.remove(config.auth.refreshTokenKey)
    Cookies.remove("ech_role")
    dispatch(logout())
    router.push("/login")
  }, [dispatch, router])

  return {
    user: user ?? me ?? null,
    isAuthenticated: isAuthenticated || !!me,
    isLoading: isLoading,
    login,
    logout: logoutUser,
  }
}

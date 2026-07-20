import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const publicRoutes = ["/login", "/forgot-password", "/reset-password"]
const dashboardRoutes = ["/dashboard"]
const adminRoutes = ["/admin/dashboard"]

export function middleware(request: NextRequest) {
  const accessToken = request.cookies.get("ech_access_token")?.value
  const { pathname } = request.nextUrl

  const isAuth = !!accessToken

  if (publicRoutes.some((route) => pathname === route) && isAuth) {
    const role = request.cookies.get("ech_role")?.value
    if (role === "admin") {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url))
    }
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  const isDashboardRoute = dashboardRoutes.some((route) => pathname.startsWith(route))
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route))

  if ((isDashboardRoute || isAdminRoute) && !isAuth) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAdminRoute && isAuth) {
    const role = request.cookies.get("ech_role")?.value
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}

import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Toggle and push to flip maintenance mode on/off (no env var / dashboard config needed).
const MAINTENANCE_MODE = true;

export default function middleware(request: NextRequest) {
  if (MAINTENANCE_MODE) {
    const { pathname } = request.nextUrl;
    const isEn = pathname === "/en" || pathname.startsWith("/en/");
    const isMaintenancePath = pathname === "/maintenance" || pathname === "/en/maintenance";

    if (!isMaintenancePath) {
      // Rewrite with an explicit locale segment ("/id/..."), not the
      // as-needed public form ("/"), since bypassing intlMiddleware below
      // means no one else resolves the default locale's hidden prefix.
      const url = request.nextUrl.clone();
      url.pathname = isEn ? "/en/maintenance" : "/id/maintenance";
      return NextResponse.rewrite(url, {
        status: 503,
        headers: { "Retry-After": "3600" },
      });
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Skip api, _next, _vercel, admin, and static files (with extensions)
  matcher: ["/((?!api/|_next|_vercel|admin|.*\\..*).*)", "/(id|en)/:path*"],
};

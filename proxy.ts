import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionFromRequest, isAuthConfigured } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login"]);
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/internal/worker",
  "/api/internal/prefetch",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    if (pathname === "/login" && getSessionFromRequest(request)) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error:
            "Autenticação não configurada. Defina AUTH_SECRET e pelo menos um login em AUTH_USERNAME/AUTH_PASSWORD ou AUTH_USERS_JSON.",
        },
        { status: 503 },
      );
    }

    const url = new URL("/login", request.url);
    url.searchParams.set("error", "config");
    return NextResponse.redirect(url);
  }

  if (getSessionFromRequest(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sessão inválida ou ausente." }, { status: 401 });
  }

  const url = new URL("/login", request.url);
  const nextPath = `${pathname}${request.nextUrl.search}`;
  if (nextPath !== "/") {
    url.searchParams.set("next", nextPath);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.[^/]+$).*)"],
};

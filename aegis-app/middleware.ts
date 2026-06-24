import { NextRequest, NextResponse } from "next/server";

// Probe API routes — Bearer token auth, skip session check entirely
const PROBE_PATHS = [
  "/api/webhooks/probe",
  "/api/v1/metrics",
  "/api/v1/health",
];

// Auth routes — never intercept these
const AUTH_API_PATH = "/api/auth";

// Public page routes — no session required
const PUBLIC_PAGES = ["/login", "/register"];

function isPublicRoute(pathname: string): boolean {
  // All API routes except dashboard/settings/etc are handled by their own auth
  if (pathname.startsWith("/api/")) return true;
  if (pathname === "/") return true;
  return PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let all API routes through — they do their own auth
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Root → redirect based on session
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Public pages
  if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Protected dashboard pages — check session cookie
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ??
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT static assets, images, and favicons.
     * API routes are allowed through and handle their own auth.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

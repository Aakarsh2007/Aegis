import { NextRequest, NextResponse } from "next/server";

// Routes that the C++ probe uses — skip session checks entirely
const PROBE_PATHS = [
  "/api/webhooks/probe",
  "/api/v1/metrics",
  "/api/v1/health",
];

// Public routes accessible without a session
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/api/auth",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isProbePath(pathname: string): boolean {
  return PROBE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow probe routes unconditionally (they use Bearer API key auth)
  if (isProbePath(pathname)) {
    return NextResponse.next();
  }

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // For protected routes, check for session cookie presence.
  // The actual session validation happens server-side in the layout/API routes.
  // This lightweight check avoids importing Better Auth (which uses Node.js APIs
  // incompatible with Edge Runtime) and simply redirects unauthenticated users.
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ||
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
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

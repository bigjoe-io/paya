import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate: no session cookie → straight to /login. The real check
 * (signature + expiry) runs on the server in every page and action.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("paya_admin")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the login page and Next's own assets.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};

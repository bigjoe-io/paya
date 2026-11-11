import { NextResponse, type NextRequest } from "next/server";

/**
 * Private testing: the app and the docs need a tester access token (cookie
 * set at /admin), signed by the relay with ACCESS_SECRET. Without
 * ACCESS_SECRET configured, everything is open (local development).
 * The relay checks the same token, and whether its code was revoked, on every
 * app request, so this is the first of two locks.
 */
const COOKIE = "paya_access";

async function valid(token: string, secret: string) {
  const [id, exp, mac] = token.split(".");
  if (!id || !exp || !mac || Number(exp) < Date.now()) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${exp}`)));
  const want = btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (want.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ mac.charCodeAt(i);
  return diff === 0;
}

export async function proxy(request: NextRequest) {
  const secret = process.env.ACCESS_SECRET;
  if (!secret) return NextResponse.next();
  const token = request.cookies.get(COOKIE)?.value;
  if (token && (await valid(decodeURIComponent(token), secret))) return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/app/:path*", "/docs/:path*", "/llms.txt", "/llms-full.txt"],
};

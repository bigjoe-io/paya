import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Stateless admin session: an httpOnly cookie holding `<expiry>.<HMAC>`,
 * signed with ADMIN_SESSION_SECRET. No database; rotating the secret signs
 * everyone out. Checked on the server for every page and action.
 */
const COOKIE = "paya_admin";
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("ADMIN_SESSION_SECRET must be set (32+ chars)");
  return s;
}

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("hex");

function safeEqual(a: string, b: string) {
  // Compare fixed-length digests so neither the value nor its length leaks through timing.
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function passwordMatches(input: string) {
  const want = process.env.ADMIN_PASSWORD;
  if (!want || want.length < 12) throw new Error("ADMIN_PASSWORD must be set (12+ chars)");
  return safeEqual(input, want);
}

export async function createSession() {
  const exp = String(Date.now() + TTL_MS);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(Number(exp)),
  });
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [exp, sig] = v.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp));
}

/** Use at the top of every console page and server action. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/login");
}

export const SESSION_COOKIE = COOKIE;

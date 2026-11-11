import crypto from "node:crypto";
import { config } from "./config.js";

/** AES-256-GCM for PAJ session tokens at rest. Output: iv.tag.ciphertext (base64url). */
export function encrypt(plain: string) {
  const key = Buffer.from(config.DATA_KEY!, "hex");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(sealed: string) {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(config.DATA_KEY!, "hex"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

/** Paya app session: base64url(payload).hmac. Stateless; 30 days. */
const SESSION_DAYS = 30;
const sign = (data: string) => crypto.createHmac("sha256", config.SESSION_SECRET!).update(data).digest("base64url");

export function createSession(userId: string) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const data = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  return { token: `${data}.${sign(data)}`, expiresAt: new Date(exp).toISOString() };
}

export function readSession(token: string): string | null {
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const want = Buffer.from(sign(data));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as { uid: string; exp: number };
    return typeof p.uid === "string" && p.exp > Date.now() ? p.uid : null;
  } catch {
    return null;
  }
}

import crypto from "node:crypto";
import { config } from "./config.js";
import { accessCodes, type AccessCode } from "./db.js";

/**
 * Tester access. The admin creates codes; a tester redeems one at
 * usepaya.xyz/admin and gets a signed access token (30 days) that the website
 * checks before showing the app, and the relay checks on every app request.
 *
 *   token = <codeId>.<expiresMs>.<HMAC-SHA256(ACCESS_SECRET, codeId.expiresMs)>
 */
const TOKEN_DAYS = 30;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const hash = (code: string) => crypto.createHash("sha256").update(normalize(code)).digest("hex");
const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const accessEnabled = () => Boolean(config.ACCESS_SECRET);

export function createCode(p: { label: string; maxUses: number | null; expiresDays: number | null }) {
  const bytes = crypto.randomBytes(8);
  const raw = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  const code = `PAYA-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  const id = `acc_${crypto.randomBytes(6).toString("hex")}`;
  accessCodes.insert({
    id,
    label: p.label,
    code_hash: hash(code),
    last4: raw.slice(4, 8),
    max_uses: p.maxUses,
    uses: 0,
    revoked: 0,
    expires_at: p.expiresDays ? new Date(Date.now() + p.expiresDays * 86_400_000).toISOString() : null,
  });
  return { id, code };
}

const usable = (c: AccessCode) =>
  !c.revoked && (!c.expires_at || Date.parse(c.expires_at) > Date.now()) && (c.max_uses === null || c.uses < c.max_uses);

const sign = (data: string) => crypto.createHmac("sha256", config.ACCESS_SECRET!).update(data).digest("base64url");

/** A tester typed a code: if it's good, count the use and return an access token. */
export function redeem(code: string) {
  if (!accessEnabled()) throw new Error("Tester access isn't switched on");
  const c = accessCodes.find((x) => x.code_hash === hash(code));
  if (!c || !usable(c)) return null;
  accessCodes.update(c.id, { uses: c.uses + 1 });
  accessCodes.event(c.id, "redeemed");
  const exp = Date.now() + TOKEN_DAYS * 86_400_000;
  const data = `${c.id}.${exp}`;
  return { token: `${data}.${sign(data)}`, expiresAt: new Date(exp).toISOString(), label: c.label };
}

/** Valid signature, not expired, and its code not revoked since. */
export function verifyAccess(token: string | undefined | null) {
  if (!accessEnabled()) return true;
  if (!token) return false;
  const [id, exp, mac] = token.split(".");
  if (!id || !exp || !mac) return false;
  const want = Buffer.from(sign(`${id}.${exp}`));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
  if (Number(exp) < Date.now()) return false;
  const c = accessCodes.byId(id);
  return Boolean(c && !c.revoked);
}

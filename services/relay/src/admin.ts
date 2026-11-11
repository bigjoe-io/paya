import crypto from "node:crypto";
import { Hono } from "hono";
import { readAudit } from "./audit.js";
import { config } from "./config.js";
import { swaps, type Swap } from "./db.js";
import { oneclick } from "./oneclick.js";

/**
 * Admin API, mounted at /admin. Server-to-server only: the admin app calls it
 * with ADMIN_TOKEN from its own server, never from a browser (no CORS here).
 * Disabled (404) when ADMIN_TOKEN isn't configured.
 */
export const admin = new Hono();

admin.use("*", async (c, next) => {
  if (!config.ADMIN_TOKEN) return c.json({ error: "Not found" }, 404);
  const h = c.req.header("authorization") ?? "";
  const given = Buffer.from(h.startsWith("Bearer ") ? h.slice(7) : "");
  const want = Buffer.from(config.ADMIN_TOKEN);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    await new Promise((r) => setTimeout(r, 300)); // slow down guessing
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

/** Everything except the user's live session token. */
function full(s: Swap) {
  const { paj_token: _omit, ...rest } = s;
  return { ...rest, has_paj_session: Boolean(_omit) };
}

/** Every identifier support might be handed: hashes, addresses, ids, names. */
function haystack(s: Swap) {
  return [
    s.id,
    s.account_id,
    s.deposit_tx,
    s.payment_reference,
    s.deposit_address,
    s.receive_address,
    s.paj_order_id,
    s.account_number,
    s.account_name,
    s.bank_name,
    s.currency,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

admin.get("/stats", (c) => {
  const all = swaps.all();
  const live = all.filter((s) => !s.demo);
  const by = (st: Swap["status"]) => live.filter((s) => s.status === st);
  const paid = by("paid");
  const sum = (list: Swap[], f: (s: Swap) => number) => list.reduce((a, s) => a + f(s), 0);
  const fiatByCurrency: Record<string, number> = {};
  for (const s of paid) fiatByCurrency[s.currency] = (fiatByCurrency[s.currency] ?? 0) + s.fiat_amount;
  const finished = paid.length + by("failed").length + by("refunded").length + by("expired").length;
  return c.json({
    total: all.length,
    live: live.length,
    simulated: all.length - live.length,
    inFlight: live.filter((s) => ["awaiting_deposit", "swapping", "paying"].includes(s.status)).length,
    paid: paid.length,
    failed: by("failed").length,
    refunded: by("refunded").length,
    expired: by("expired").length,
    successRate: finished ? paid.length / finished : null,
    nearVolume: sum(paid, (s) => Number(BigInt(s.amount_in) / 10n ** 18n) / 1e6),
    usdcVolume: sum(paid, (s) => Number(s.usdc_amount)),
    feesUsdc: sum(paid, (s) => Number(s.fee_usdc)),
    fiatByCurrency,
    uniqueWallets: new Set(live.map((s) => s.account_id)).size,
    liveOrders: !config.demo,
  });
});

admin.get("/swaps", (c) => {
  const q = c.req.query("q")?.trim().toLowerCase();
  const status = c.req.query("status");
  const mode = c.req.query("mode"); // live | simulated
  const limit = Math.min(Number(c.req.query("limit") ?? 200) || 200, 1000);
  let list = swaps.all();
  if (status) list = list.filter((s) => s.status === status);
  if (mode === "live") list = list.filter((s) => !s.demo);
  if (mode === "simulated") list = list.filter((s) => s.demo);
  if (q) list = list.filter((s) => haystack(s).includes(q));
  return c.json(list.slice(0, limit).map(full));
});

admin.get("/swaps/:id", (c) => {
  const s = swaps.byId(c.req.param("id"));
  return s ? c.json(full(s)) : c.json({ error: "Not found" }, 404);
});

/** Ask 1Click for the swap's status right now (read-only; doesn't change the record). */
admin.post("/swaps/:id/recheck", async (c) => {
  const s = swaps.byId(c.req.param("id"));
  if (!s) return c.json({ error: "Not found" }, 404);
  if (!s.deposit_address) return c.json({ checkedAt: new Date().toISOString(), swap: null, note: "No Intents deposit address (simulated order)" });
  try {
    const st = await oneclick.status(s.deposit_address);
    return c.json({ checkedAt: new Date().toISOString(), swap: st });
  } catch (e) {
    const msg = (e as Error).message;
    const note = /404/.test(msg)
      ? "NEAR Intents has no record of this deposit address: the user's wallet transaction never reached it."
      : msg;
    return c.json({ checkedAt: new Date().toISOString(), swap: null, note });
  }
});

admin.get("/audit", (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 300) || 300, 2000);
  return c.json(readAudit(limit, c.req.query("q")));
});

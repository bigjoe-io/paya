import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { callerEmail } from "./auth.js";
import { config } from "./config.js";
import { orders, pendingKeys, users } from "./db.js";
import { fossapay } from "./fossapay.js";
import { log } from "./log.js";
import { near } from "./near.js";
import { estimate } from "./pricing.js";
import { getRates } from "./rate.js";
import { onPayoutEvent } from "./watcher.js";

export const app = new Hono();

// Listed origins always; in demo mode also any localhost port, so running the
// frontend on 3001/3100/etc. doesn't fail with an opaque "Failed to fetch".
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
app.use(
  "*",
  cors({
    origin: (origin) =>
      config.corsOrigins.includes(origin) || (config.demoAuth && LOCALHOST.test(origin)) ? origin : null,
    allowHeaders: ["Content-Type", "Authorization", "x-demo-email"],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    network: config.NEAR_NETWORK,
    factory: config.FACTORY_ACCOUNT_ID,
    simulateSwap: config.simulateSwap,
    simulatePayout: config.simulatePayout,
    demoAuth: config.demoAuth,
  }),
);

app.get("/rate", async (c) => c.json(await getRates()));

app.get("/estimate", async (c) => {
  const near = Number(c.req.query("near") ?? "1");
  if (!Number.isFinite(near) || near <= 0) return c.json({ error: "near must be positive" }, 400);
  return c.json(await estimate(near));
});

app.get("/banks", async (c) => c.json(await fossapay.banks()));

/* ---------- me ---------- */

/** Resolve (or create) the caller's Paya account from their email. */
app.post("/me", async (c) => {
  const email = await callerEmail(c);
  if (!email) return c.json({ error: "unauthenticated" }, 401);

  let u = users.byEmail(email);
  if (!u) {
    const id = slugFor(email);
    users.insert(id, email);
    u = users.byId(id)!;
    log("api", `new user ${id} <${email}>`);
  }
  if (!u.deposit_account) {
    // A 64-hex implicit address with the deposit contract on it and no keys.
    // Resumable: a crash mid-setup reuses the same pending key.
    let pending = pendingKeys.get(u.id);
    if (!pending) {
      const fresh = near.newImplicit();
      pendingKeys.put(u.id, fresh.accountId, fresh.secretKey);
      pending = { user_id: u.id, account_id: fresh.accountId, secret_key: fresh.secretKey };
    }
    await near.lockImplicitDeposit(u.id, pending.account_id, pending.secret_key as `ed25519:${string}`);
    await near.registerDeposit(u.id, pending.account_id);
    users.setDeposit(u.id, pending.account_id);
    pendingKeys.clear(u.id); // the key no longer exists on-chain; forget it here too
    log("api", `${u.id} → ${pending.account_id}`);
    u = users.byId(u.id)!;
  }
  return c.json(publicUser(u));
});

app.get("/me", async (c) => {
  const email = await callerEmail(c);
  if (!email) return c.json({ error: "unauthenticated" }, 401);
  const u = users.byEmail(email);
  if (!u) return c.json({ error: "not found" }, 404);
  // What can actually be cashed out: balance minus the contract's storage and reserve.
  const balance = u.deposit_account ? await near.available(u.deposit_account) : 0n;
  return c.json({ ...publicUser(u), balanceYocto: balance.toString() });
});

const bankSchema = z.object({ bankCode: z.string().min(2), accountNumber: z.string().regex(/^\d{10}$/) });

/** Verify a bank account with the rail and save it. */
app.post("/me/bank", async (c) => {
  const email = await callerEmail(c);
  if (!email) return c.json({ error: "unauthenticated" }, 401);
  const u = users.byEmail(email);
  if (!u) return c.json({ error: "not found" }, 404);
  const body = bankSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "bankCode and a 10-digit accountNumber are required" }, 400);

  const banks = await fossapay.banks();
  const bank = banks.find((b) => b.bankcode === body.data.bankCode);
  if (!bank) return c.json({ error: "unknown bank code" }, 400);
  let accountName: string;
  try {
    ({ accountName } = await fossapay.nameEnquiry(bank.bankcode, body.data.accountNumber));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  users.setBank(u.id, { code: bank.bankcode, name: bank.bankname, number: body.data.accountNumber, accountName });
  return c.json(publicUser(users.byId(u.id)!));
});

/** Preview the name on an account before saving. */
app.post("/me/bank/verify", async (c) => {
  const email = await callerEmail(c);
  if (!email) return c.json({ error: "unauthenticated" }, 401);
  const body = bankSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "bankCode and a 10-digit accountNumber are required" }, 400);
  try {
    return c.json(await fossapay.nameEnquiry(body.data.bankCode, body.data.accountNumber));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

app.get("/me/orders", async (c) => {
  const email = await callerEmail(c);
  if (!email) return c.json({ error: "unauthenticated" }, 401);
  const u = users.byEmail(email);
  if (!u) return c.json({ error: "not found" }, 404);
  return c.json(orders.forUser(u.id).map(publicOrder));
});

/* ---------- webhooks ---------- */

app.post("/webhooks/fossapay", async (c) => {
  const raw = await c.req.text();
  let body: { eventId?: string; eventType?: string; data?: { reference?: string; status?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return c.text("bad json", 400);
  }
  if (!fossapay.verifyWebhook(body, c.req.header("x-fossapay-signature"))) return c.text("invalid signature", 401);
  if (!body.eventId || !body.eventType) return c.text("missing fields", 400);
  const { webhooks } = await import("./db.js");
  if (webhooks.seen(body.eventId)) return c.text("ok");
  webhooks.record(body.eventId, body.eventType);
  if (body.eventType.startsWith("payout.") && body.data?.reference) {
    const s = body.eventType.replace("payout.", "") as "completed" | "failed" | "reversed";
    onPayoutEvent(body.data.reference, s);
  }
  return c.text("ok");
});

/* ---------- shapes ---------- */

function slugFor(email: string) {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  let id = base.length >= 2 ? base : `${base}0`;
  let n = 1;
  while (users.idTaken(id)) id = `${base}${++n}`;
  return id;
}

function publicUser(u: ReturnType<typeof users.byId> & object) {
  return {
    id: u.id,
    email: u.email,
    depositAccount: u.deposit_account,
    bank: u.account_number
      ? { code: u.bank_code, name: u.bank_name, accountNumber: u.account_number, accountName: u.account_name }
      : null,
    network: config.NEAR_NETWORK,
  };
}

function publicOrder(o: ReturnType<typeof orders.byId> & object) {
  return {
    id: o.id,
    status: o.status,
    nearAmount: Number(o.near_yocto) / 1e24,
    usdcOut: o.usdc_out ? Number(o.usdc_out) : null,
    rateNgn: o.rate_ngn,
    railFeeNgn: o.rail_fee_ngn,
    marginNgn: o.margin_ngn,
    ngnAmount: o.ngn_amount,
    forwardTx: o.forward_tx,
    payoutReference: o.payout_reference,
    simulated: Boolean(o.simulated),
    error: o.error,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

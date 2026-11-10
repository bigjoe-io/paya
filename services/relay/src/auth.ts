import type { Context } from "hono";
import { PrivyClient } from "@privy-io/server-auth";
import { config } from "./config.js";

/**
 * Resolves the caller's email. With Privy configured, the frontend sends the
 * Privy access token as a Bearer token and we verify it server-side. Without
 * Privy (demo mode), the frontend sends `x-demo-email`.
 */
const privy = config.demoAuth ? null : new PrivyClient(config.PRIVY_APP_ID, config.PRIVY_APP_SECRET);

export async function callerEmail(c: Context): Promise<string | null> {
  if (!privy) {
    const email = c.req.header("x-demo-email")?.trim().toLowerCase();
    return email && email.includes("@") ? email : null;
  }
  const auth = c.req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const claims = await privy.verifyAuthToken(token);
    const user = await privy.getUserById(claims.userId);
    const email = user.email?.address ?? user.google?.email ?? null;
    return email ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

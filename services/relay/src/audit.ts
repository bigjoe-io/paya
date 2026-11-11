import { appendFileSync, existsSync, readFileSync } from "node:fs";

/**
 * Platform-wide audit log: one JSON object per line, append-only. Captures
 * things that aren't a swap record yet — sign-ins, rejected orders, saved
 * bank accounts — so support can reconstruct what a user did and saw.
 * Never contains session tokens or full account numbers.
 */
const FILE = process.env.AUDIT_PATH ?? "./paya-audit.jsonl";

export type AuditEntry = { at: string; type: string; actor?: string; detail?: Record<string, unknown> };

export function audit(type: string, actor?: string, detail?: Record<string, unknown>) {
  const entry: AuditEntry = { at: new Date().toISOString(), type, ...(actor ? { actor } : {}), ...(detail ? { detail } : {}) };
  try {
    appendFileSync(FILE, JSON.stringify(entry) + "\n", { mode: 0o600 });
  } catch {
    /* auditing must never break a user request */
  }
}

/** Most recent entries first, optionally filtered by a substring anywhere in the entry. */
export function readAudit(limit = 200, q?: string): AuditEntry[] {
  if (!existsSync(FILE)) return [];
  const lines = readFileSync(FILE, "utf8").trim().split("\n").filter(Boolean);
  const needle = q?.trim().toLowerCase();
  const out: AuditEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    if (needle && !lines[i].toLowerCase().includes(needle)) continue;
    try {
      out.push(JSON.parse(lines[i]) as AuditEntry);
    } catch {
      /* skip a torn line */
    }
  }
  return out;
}

export const last4 = (s: string) => (s.length <= 4 ? s : `••••${s.slice(-4)}`);

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, CheckCircle2, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { PageTitle } from "@/components/app/ui";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { deviceId, useSession } from "@/components/app/session-provider";
import { useAccount } from "@/components/app/account-provider";
import { api, type Proposal } from "@/lib/api";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string; proposals?: Proposal[] };

const SUGGESTIONS = [
  "What's my balance?",
  "Swap 1 NEAR to USDC",
  "How much naira would I get for 5 NEAR?",
  "Send 2 USDC to my Solana wallet",
];

const fmt = (n: number, d = 4) => n.toLocaleString("en-US", { maximumFractionDigits: d });

export default function AskPage() {
  const { signedIn } = useSession();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: "user" as const, text: t }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const r = await api.ask(next.map(({ role, text }) => ({ role, text })));
      setMsgs([...next, { role: "assistant", text: r.reply, proposals: r.proposals }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <>
      <Topbar />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-6">
        <div className="flex items-center gap-2">
          <PageTitle>Ask Paya</PageTitle>
          <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase">Beta</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Ask in plain words. Paya checks your balance and live prices, and prepares swaps, cash-outs and transfers. Nothing moves until you tap Confirm.
        </p>

        {!signedIn ? (
          <section className="glass-card mt-8 rounded-3xl p-6 text-center">
            <Sparkles className="mx-auto size-6" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted-foreground">Sign in with your email to use Ask Paya.</p>
            <button type="button" onClick={() => setSignIn(true)} className="focus-ring mt-5 min-h-12 w-full rounded-2xl bg-foreground font-medium text-background">
              Sign in with email
            </button>
          </section>
        ) : (
          <>
            <div className="mt-6 flex-1 space-y-4" aria-live="polite">
              {msgs.length === 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="focus-ring min-h-12 rounded-2xl border border-border bg-card px-4 text-left text-sm hover:bg-panel"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}
              {msgs.map((m, i) => (
                <div key={i} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                  <p
                    className={cn(
                      "max-w-[85%] rounded-3xl px-4 py-3 text-[15px] leading-6 whitespace-pre-wrap",
                      m.role === "user" ? "bg-foreground text-background" : "bg-card text-foreground",
                    )}
                  >
                    {m.text}
                  </p>
                  {m.proposals?.map((p) => <ProposalCard key={p.id} p={p} />)}
                </div>
              ))}
              {busy ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> Thinking…
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
                  {error}
                </p>
              ) : null}
              <div ref={end} />
            </div>

            <form onSubmit={submit} className="sticky bottom-4 mt-6 flex items-end gap-2 rounded-3xl border border-border bg-panel p-2 shadow-sm">
              <label className="sr-only" htmlFor="ask-input">
                Message
              </label>
              <textarea
                id="ask-input"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="e.g. Swap half my NEAR to USDC"
                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background disabled:opacity-40"
              >
                <ArrowUp className="size-5" aria-hidden="true" />
              </button>
            </form>
          </>
        )}
        <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
      </main>
    </>
  );
}

/** A proposed money movement. Runs only when the user confirms; sends and bridges also need the email code. */
function ProposalCard({ p }: { p: Proposal }) {
  const { email, startSignIn } = useSession();
  const { refresh } = useAccount();
  const [state, setState] = useState<"ready" | "code" | "working" | "tracking" | "done" | "error" | "cancelled">("ready");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [dep, setDep] = useState<string | null>(null);
  const needsCode = p.kind === "bridge_out" || p.kind === "send_near";

  useEffect(() => {
    if (state !== "tracking" || !dep) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = p.kind === "swap" ? await api.tokenSwapStatus(dep) : await api.walletSwapStatus(dep);
        if (stop) return;
        if (s.status === "done") {
          setState("done");
          setMsg(p.kind === "swap" ? "Done. It's in your balance." : "Done. It's on its way to the recipient.");
          void refresh();
          return;
        }
        if (s.status === "refunded" || s.status === "failed") {
          setState("error");
          setMsg("It didn't go through; the funds went back. Nothing was lost.");
          return;
        }
      } catch {}
      if (!stop) setTimeout(tick, 4000);
    };
    const t = setTimeout(tick, 4000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [state, dep, p.kind, refresh]);

  async function confirm() {
    setMsg(null);
    try {
      if (needsCode && state !== "code") {
        if (!email) throw new Error("Sign in first.");
        setState("working");
        await startSignIn(email);
        setState("code");
        return;
      }
      setState("working");
      if (p.kind === "swap") {
        const r = await api.tokenSwap({ from: p.from, to: p.to, amount: p.amount });
        setDep(r.depositAddress);
        setState("tracking");
      } else if (p.kind === "cashout") {
        await api.cashOut(p.near);
        setState("done");
        setMsg("Cash-out started. Follow it in Activity.");
        void refresh();
      } else if (p.kind === "bridge_out") {
        const r = await api.bridgeOut({ from: p.from, toAsset: p.toAsset, amount: p.amount, recipient: p.recipient, otp: code.trim(), deviceId: deviceId() });
        setDep(r.depositAddress);
        setState("tracking");
      } else {
        await api.withdraw({ to: p.to, near: p.near, otp: code.trim(), deviceId: deviceId() });
        setState("done");
        setMsg("Sent.");
        void refresh();
      }
    } catch (e) {
      setState(needsCode && state === "code" ? "code" : "error");
      setMsg((e as Error).message);
    }
  }

  const title =
    p.kind === "swap"
      ? `Swap ${fmt(p.amount)} ${p.fromSymbol} → ≈ ${fmt(p.amountOut)} ${p.toSymbol}`
      : p.kind === "cashout"
        ? `Cash out ${fmt(p.near)} NEAR → ≈ ${fmt(p.fiatOut, 0)} ${p.currency}`
        : p.kind === "bridge_out"
          ? `Send ${fmt(p.amount)} ${p.fromSymbol} → ≈ ${fmt(p.amountOut)} ${p.toSymbol} on ${p.chain}`
          : `Send ${fmt(p.near)} NEAR to ${p.to}`;
  const detail =
    p.kind === "swap"
      ? `Minimum ${fmt(p.minOut)} ${p.toSymbol} · stays in your balance`
      : p.kind === "cashout"
        ? `Paid to ${p.bank}`
        : p.kind === "bridge_out"
          ? `To ${p.recipient.slice(0, 8)}…${p.recipient.slice(-6)} · confirmed with an email code`
          : "Confirmed with an email code";

  return (
    <div className="mt-2 w-full max-w-[85%] rounded-3xl border border-border bg-panel p-4 shadow-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground break-all">{detail}</p>
      {state === "code" ? (
        <label className="mt-3 block">
          <span className="text-sm text-muted-foreground">Code from {email}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="focus-ring mt-1 min-h-11 w-full rounded-xl border border-border bg-card px-3 font-mono tracking-widest outline-none"
          />
        </label>
      ) : null}
      {msg ? (
        <p className={cn("mt-3 flex items-center gap-2 text-sm", state === "done" ? "text-success" : state === "error" || state === "code" ? "text-warning" : "text-muted-foreground")}>
          {state === "done" ? <CheckCircle2 className="size-4" aria-hidden="true" /> : state === "error" ? <TriangleAlert className="size-4" aria-hidden="true" /> : null}
          {msg}
        </p>
      ) : null}
      {state === "ready" || state === "code" || state === "working" ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={state === "working" || (state === "code" && code.length < 4)}
            className="focus-ring min-h-11 flex-1 rounded-2xl bg-foreground text-sm font-medium text-background disabled:opacity-50"
          >
            {state === "working" ? "Working…" : state === "code" ? "Confirm" : needsCode ? "Continue" : "Confirm"}
          </button>
          <button type="button" onClick={() => setState("cancelled")} disabled={state === "working"} className="focus-ring min-h-11 rounded-2xl border border-border px-4 text-sm">
            Cancel
          </button>
        </div>
      ) : state === "tracking" ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> On its way…
        </p>
      ) : state === "cancelled" ? (
        <p className="mt-3 text-sm text-muted-foreground">Cancelled.</p>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ImagePlus, Loader2, Rocket, Search, TriangleAlert, X } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { PageTitle } from "@/components/app/ui";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { useSession } from "@/components/app/session-provider";
import { useAccount } from "@/components/app/account-provider";
import { api, type LaunchCost, type MarketCoin, type TradeQuote } from "@/lib/api";
import { cn } from "@/lib/utils";

const usd = (n: number | null) =>
  n === null ? "–" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`;
const ago = (iso: string) => {
  const d = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return d < 60 ? `${Math.max(1, d)}m ago` : d < 1440 ? `${Math.round(d / 60)}h ago` : `${Math.round(d / 1440)}d ago`;
};
const short = (a: string) => (a.length > 20 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function CoinIcon({ c, size = 44 }: { c: Pick<MarketCoin, "icon" | "symbol">; size?: number }) {
  return c.icon ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.icon} alt="" width={size} height={size} className="shrink-0 rounded-full bg-card object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-foreground font-bold text-background" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {c.symbol.slice(0, 2)}
    </span>
  );
}

export default function MarketPage() {
  const [data, setData] = useState<{ live: boolean; coins: MarketCoin[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<MarketCoin | null>(null);
  const [launching, setLaunching] = useState(false);

  const load = useCallback(() => {
    api.memes().then(setData, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const coins = (data?.coins ?? []).filter((c) => !q || `${c.name} ${c.symbol}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-5xl px-4 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <PageTitle>Meme market</PageTitle>
            <p className="mt-1 text-sm text-muted-foreground">Launch a meme coin on NEAR in one step, and trade every coin launched on Paya.</p>
          </div>
          <button
            type="button"
            onClick={() => setLaunching(true)}
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90"
          >
            <Rocket className="size-4" aria-hidden="true" /> Launch a coin
          </button>
        </div>

        {data && !data.live ? (
          <p className="mt-5 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Launching and trading open very soon: we&apos;re finishing the final mainnet test. You can preview the launch form and costs now.
          </p>
        ) : null}

        <label className="mt-6 flex min-h-11 max-w-md items-center gap-2 rounded-2xl border border-border bg-card px-3">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search coins</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coins" className="w-full bg-transparent text-sm outline-none" />
        </label>

        {error ? (
          <p role="alert" className="mt-6 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">{error}</p>
        ) : !data ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-card" />)}
          </div>
        ) : coins.length === 0 ? (
          <section className="glass-card mt-6 rounded-3xl p-10 text-center">
            <Rocket className="mx-auto size-8" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold tracking-tight">{q ? `No coins match “${q}”` : "No coins yet"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{q ? "Try another name or ticker." : "Be the first to launch a meme coin on Paya."}</p>
            {!q ? (
              <button type="button" onClick={() => setLaunching(true)} className="focus-ring mt-6 min-h-11 rounded-full bg-foreground px-6 text-sm font-medium text-background">
                Launch a coin
              </button>
            ) : null}
          </section>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {coins.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c)}
                  className="focus-ring glass-card block w-full rounded-3xl p-5 text-left transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
                >
                  <div className="flex items-center gap-3">
                    <CoinIcon c={c} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="text-sm text-muted-foreground">${c.symbol}</p>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground">{ago(c.createdAt)}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Price</dt><dd className="font-mono">{usd(c.priceUsd)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Mkt cap</dt><dd className="font-mono">{usd(c.marketCapUsd)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Liquidity</dt><dd className="font-mono">{usd(c.liquidityUsd)}</dd></div>
                  </dl>
                  {c.description ? <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{c.description}</p> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      {selected ? <TradeDialog coin={selected} live={Boolean(data?.live)} onClose={() => setSelected(null)} onTraded={load} /> : null}
      {launching ? <LaunchDialog live={Boolean(data?.live)} onClose={() => setLaunching(false)} onLaunched={load} /> : null}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto w-[min(100%-2rem,30rem)] rounded-3xl border border-border bg-panel p-0 text-foreground shadow-xl backdrop:bg-foreground/20 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-6 pt-6">
        <h2 id={id} className="text-lg font-semibold tracking-tight">{title}</h2>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="focus-ring -mr-2 grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-card">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="p-6 pt-4">{children}</div>
    </dialog>
  );
}

const field = "focus-ring mt-1 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none";

function TradeDialog({ coin, live, onClose, onTraded }: { coin: MarketCoin; live: boolean; onClose: () => void; onTraded: () => void }) {
  const { signedIn } = useSession();
  const { refresh } = useAccount();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quoted, setQuoted] = useState<{ key: string; q: TradeQuote | null; err: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const value = Number(amount);
  const key = `${side}|${value}`;
  const ready = value > 0 && coin.poolId !== null;

  useEffect(() => {
    if (!ready) return;
    let cancel = false;
    const t = setTimeout(() => {
      api.memeQuote(coin.id, side, value).then((q) => !cancel && setQuoted({ key, q, err: null }), (e: Error) => !cancel && setQuoted({ key, q: null, err: e.message }));
    }, 400);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [key, ready, coin.id, side, value]);
  const cur = quoted?.key === key ? quoted : null;
  const q = ready ? (cur?.q ?? null) : null;

  async function trade(e: FormEvent) {
    e.preventDefault();
    if (!signedIn) return setSignIn(true);
    setBusy(true);
    setError(null);
    try {
      const r = await api.tradeMeme(coin.id, side, value);
      setDone(side === "buy" ? `Bought about ${r.amountOut.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${coin.symbol}.` : `Sold for about ${r.amountOut.toFixed(4)} NEAR.`);
      setAmount("");
      onTraded();
      void refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${coin.name} ($${coin.symbol})`} onClose={onClose}>
      <div className="flex items-center gap-3">
        <CoinIcon c={coin} size={52} />
        <div className="text-sm">
          <p className="font-mono text-lg font-semibold">{usd(coin.priceUsd)}</p>
          <p className="text-muted-foreground">Mkt cap {usd(coin.marketCapUsd)} · Liquidity {usd(coin.liquidityUsd)}</p>
        </div>
      </div>
      {coin.description ? <p className="mt-3 text-sm text-muted-foreground">{coin.description}</p> : null}
      <p className="mt-2 font-mono text-xs break-all text-muted-foreground">{coin.id} · by {short(coin.creator)}</p>
      <p className="mt-2 text-xs text-muted-foreground">Meme coins are very risky: prices swing fast and creators can withdraw their liquidity. Only trade what you can afford to lose.</p>

      <form onSubmit={trade} className="mt-5">
        <div role="tablist" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-xl bg-card p-1 text-sm font-medium">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => { setSide(s); setAmount(""); setDone(null); }}
              className={cn("focus-ring min-h-10 rounded-lg capitalize", side === s ? "bg-panel shadow-sm" : "text-muted-foreground")}>
              {s}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="text-sm text-muted-foreground">{side === "buy" ? "You pay (NEAR)" : `You sell (${coin.symbol})`}</span>
          <input inputMode="decimal" value={amount} onChange={(e) => { setDone(null); setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 20)); }} placeholder="0" className={cn(field, "font-mono text-lg")} />
        </label>
        {q ? (
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">You get</dt><dd className="font-mono">≈ {q.amountOut.toLocaleString("en-US", { maximumFractionDigits: side === "buy" ? 2 : 6 })} {side === "buy" ? coin.symbol : "NEAR"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Minimum</dt><dd className="font-mono">{q.minOut.toLocaleString("en-US", { maximumFractionDigits: side === "buy" ? 2 : 6 })}</dd></div>
            {q.priceImpact !== null ? <div className="flex justify-between"><dt className="text-muted-foreground">Price impact</dt><dd className={cn("font-mono", q.priceImpact > 0.05 && "text-warning")}>{(q.priceImpact * 100).toFixed(2)}%</dd></div> : null}
            <div className="flex justify-between"><dt className="text-muted-foreground">Route</dt><dd>Ref Finance</dd></div>
          </dl>
        ) : cur?.err ? <p className="mt-3 text-sm text-warning">{cur.err}</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">{error}</p> : null}
        {done ? <p className="mt-3 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden="true" />{done}</p> : null}
        <button type="submit" disabled={!live || busy || !q} className="focus-ring mt-4 min-h-12 w-full rounded-2xl bg-foreground font-medium text-background disabled:bg-foreground/15 disabled:text-muted-foreground">
          {!live ? "Trading opens soon" : busy ? "Confirming…" : !signedIn ? "Sign in to trade" : side === "buy" ? `Buy ${coin.symbol}` : `Sell ${coin.symbol}`}
        </button>
      </form>
      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </Modal>
  );
}

/** Downscale an image file to a small square data URI (≤ ~16 KB) suitable for on-chain metadata. */
async function toIcon(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const s = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  for (const quality of [0.8, 0.6, 0.45, 0.3]) {
    const url = canvas.toDataURL("image/webp", quality);
    if (url.length < 20_000) return url;
  }
  throw new Error("That image is too detailed. Try a simpler one.");
}

function LaunchDialog({ live, onClose, onLaunched }: { live: boolean; onClose: () => void; onLaunched: () => void }) {
  const { signedIn } = useSession();
  const { me, refresh } = useAccount();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [supply, setSupply] = useState("1000000000");
  const [liq, setLiq] = useState("1");
  const [pct, setPct] = useState("90");
  const [cost, setCost] = useState<{ key: string; c: LaunchCost | null; err: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<MarketCoin | null>(null);
  const [signIn, setSignIn] = useState(false);

  const input = { name: name.trim(), symbol: symbol.trim().toUpperCase(), description, icon, supply: Number(supply), liquidityNear: Number(liq), liquidityPercent: Number(pct) };
  const key = JSON.stringify({ ...input, icon: icon?.length ?? 0 });
  const ready = input.name.length >= 2 && /^[A-Z][A-Z0-9]{1,7}$/.test(input.symbol) && input.supply >= 1000 && input.liquidityNear >= 0.5;

  useEffect(() => {
    if (!ready) return;
    let cancel = false;
    const t = setTimeout(() => {
      api.memeCost(input).then((c) => !cancel && setCost({ key, c, err: null }), (e: Error) => !cancel && setCost({ key, c: null, err: e.message }));
    }, 500);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
  const cur = cost?.key === key ? cost : null;
  const c = ready ? (cur?.c ?? null) : null;
  const lowBalance = me && c ? me.balance < c.requiredBalanceNear : false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!signedIn) return setSignIn(true);
    setBusy(true);
    setError(null);
    try {
      const coin = await api.launchMeme(input);
      setLaunched(coin);
      onLaunched();
      void refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (launched)
    return (
      <Modal title="Your coin is live" onClose={onClose}>
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden="true" />
          <p className="mt-3 font-semibold">{launched.name} (${launched.symbol}) is trading now.</p>
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{launched.id}</p>
        </div>
      </Modal>
    );

  return (
    <Modal title="Launch a meme coin" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="focus-within:ring-2 focus-within:ring-ring grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-border bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {icon ? <img src={icon} alt="Coin image" className="size-full object-cover" /> : <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />}
            <input type="file" accept="image/*" className="sr-only" aria-label="Coin image"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) toIcon(f).then(setIcon, (err: Error) => setError(err.message)); }} />
          </label>
          <div className="grid flex-1 grid-cols-1 gap-3">
            <label className="block"><span className="text-sm text-muted-foreground">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 32))} placeholder="Paya Doge" className={field} /></label>
            <label className="block"><span className="text-sm text-muted-foreground">Ticker</span>
              <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="PDOGE" className={cn(field, "font-mono uppercase")} /></label>
          </div>
        </div>
        <label className="block"><span className="text-sm text-muted-foreground">Description (optional)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 280))} rows={2} className={cn(field, "py-2")} /></label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block"><span className="text-xs text-muted-foreground">Total supply</span>
            <input inputMode="numeric" value={supply} onChange={(e) => setSupply(e.target.value.replace(/\D/g, "").slice(0, 15))} className={cn(field, "font-mono")} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Liquidity (NEAR)</span>
            <input inputMode="decimal" value={liq} onChange={(e) => setLiq(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))} className={cn(field, "font-mono")} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">% to pool</span>
            <input inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, "").slice(0, 3))} className={cn(field, "font-mono")} /></label>
        </div>

        {c ? (
          <dl className="space-y-1 rounded-2xl bg-card p-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Token address</dt><dd className="font-mono">{c.tokenId}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Create token (NEAR storage)</dt><dd className="font-mono">{c.factoryNear.toFixed(3)} NEAR</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Exchange setup</dt><dd className="font-mono">{c.feesNear.toFixed(3)} NEAR</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Starting liquidity</dt><dd className="font-mono">{c.liquidityNear} NEAR</dd></div>
            <div className="flex justify-between border-t border-border pt-1 font-medium"><dt>Total</dt><dd className="font-mono">{c.totalNear.toFixed(3)} NEAR</dd></div>
            {!c.available ? <p className="pt-1 text-warning">${input.symbol} is already taken on NEAR. Pick another ticker.</p> : null}
            {lowBalance ? <p className="pt-1 text-warning">You need about {c.requiredBalanceNear.toFixed(2)} NEAR in your balance (some is reserved for network fees and refunded).</p> : null}
          </dl>
        ) : cur?.err ? <p className="text-sm text-warning">{cur.err}</p> : null}

        <p className="text-xs text-muted-foreground">
          Your coin is created with NEAR&apos;s official token factory and gets a Ref Finance pool, so anyone can trade it straight away. You own the full supply; the share you put in the pool becomes liquidity you can withdraw later.
        </p>
        {error ? <p role="alert" className="flex items-center gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" />{error}</p> : null}
        <button type="submit" disabled={!live || busy || !c || !c.available || Boolean(lowBalance)}
          className="focus-ring min-h-12 w-full rounded-2xl bg-foreground font-medium text-background disabled:bg-foreground/15 disabled:text-muted-foreground">
          {!live ? "Launching opens soon" : busy ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Launching (about a minute)…</span> : !signedIn ? "Sign in to launch" : `Launch $${input.symbol || "COIN"}`}
        </button>
      </form>
      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </Modal>
  );
}

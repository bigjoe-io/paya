"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { yoctoToNear, type WalletTx } from "@/lib/api";

/**
 * The connected NEAR wallet (Nightly, HOT, Meteor, … via NEAR Connect).
 * Paya has no accounts of its own: the wallet IS the account, and it signs
 * the one transaction that moves money.
 */
const RPC = process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://free.rpc.fastnear.com";

type WalletState = {
  accountId: string | null;
  /** Liquid NEAR the wallet can spend (balance minus storage it must keep). */
  balance: number | null;
  ready: boolean;
  connecting: boolean;
  hidden: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sign + broadcast; resolves with the transaction hash. */
  signAndSend: (tx: WalletTx) => Promise<string>;
  refreshBalance: () => Promise<void>;
  toggleHidden: () => void;
};

const WalletContext = createContext<WalletState | null>(null);

/* ---- "hide balances" preference (per browser) ---- */
const HIDE_KEY = "paya:hide";
const hideListeners = new Set<() => void>();
const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};
const subscribeHidden = (cb: () => void) => {
  hideListeners.add(cb);
  return () => hideListeners.delete(cb);
};

async function fetchBalance(accountId: string): Promise<number> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "paya",
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: accountId },
    }),
  });
  const j = (await r.json()) as { result?: { amount: string; locked: string; storage_usage: number } };
  if (!j.result) return 0;
  // Storage the account must keep: 1e19 yocto per byte.
  const storage = BigInt(j.result.storage_usage) * BigInt("10000000000000000000");
  const free = BigInt(j.result.amount) - storage;
  return free > BigInt(0) ? yoctoToNear(free.toString()) : 0;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const hidden = useSyncExternalStore(subscribeHidden, readHidden, () => false);

  // NEAR Connect touches window/IndexedDB, so load it in the browser only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const connector = new NearConnector({
        network: "mainnet",
        features: { signAndSendTransaction: true },
        footerBranding: null,
      });
      connectorRef.current = connector;
      connector.on("wallet:signIn", ({ wallet, accounts }) => {
        if (cancelled) return;
        setWallet(wallet);
        setAccountId(accounts[0]?.accountId ?? null);
      });
      connector.on("wallet:signOut", () => {
        if (cancelled) return;
        setWallet(null);
        setAccountId(null);
        setBalance(null);
      });
      // Restore a previous session.
      try {
        const { wallet, accounts } = await connector.getConnectedWallet();
        if (!cancelled) {
          setWallet(wallet);
          setAccountId(accounts[0]?.accountId ?? null);
        }
      } catch {
        /* not connected yet */
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      connectorRef.current?.removeAllListeners();
    };
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!accountId) return;
    try {
      setBalance(await fetchBalance(accountId));
    } catch {
      /* keep the last known balance */
    }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const load = () =>
      fetchBalance(accountId)
        .then((b) => {
          if (!cancelled) setBalance(b);
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accountId]);

  const connect = useCallback(async () => {
    const c = connectorRef.current;
    if (!c) return;
    setConnecting(true);
    try {
      const w = await c.connect();
      const accounts = await w.getAccounts();
      setWallet(w);
      setAccountId(accounts[0]?.accountId ?? null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const c = connectorRef.current;
    if (c && wallet) await c.disconnect(wallet);
    setWallet(null);
    setAccountId(null);
    setBalance(null);
  }, [wallet]);

  const signAndSend = useCallback(
    async (tx: WalletTx) => {
      if (!wallet) throw new Error("Connect a wallet first");
      const outcome = await wallet.signAndSendTransaction({
        receiverId: tx.receiverId,
        actions: tx.actions,
      });
      const hash = (outcome as { transaction?: { hash?: string } }).transaction?.hash;
      if (!hash) throw new Error("The wallet didn't return a transaction hash");
      return hash;
    },
    [wallet],
  );

  const toggleHidden = useCallback(() => {
    try {
      localStorage.setItem(HIDE_KEY, readHidden() ? "0" : "1");
    } catch {
      /* ignore */
    }
    hideListeners.forEach((l) => l());
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      accountId,
      balance,
      ready,
      connecting,
      hidden,
      connect,
      disconnect,
      signAndSend,
      refreshBalance,
      toggleHidden,
    }),
    [accountId, balance, ready, connecting, hidden, connect, disconnect, signAndSend, refreshBalance, toggleHidden],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

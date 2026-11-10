"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * Wallet session for the dashboard.
 *
 * Non-custodial: Paya never creates an account for the user. They connect a
 * NEAR wallet, and that wallet is what gets linked to their bank account.
 * This is a stub that mimics the shape of the real connector; swap the body of
 * `connect`/`disconnect` for @hot-labs/near-connect when the app wires up.
 */
type WalletState = {
  accountId: string | null;
  connecting: boolean;
  hidden: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleHidden: () => void;
};

const WalletContext = createContext<WalletState | null>(null);

/* --- tiny localStorage-backed store (safe when storage is unavailable) --- */

const STORAGE_KEY = "paya:wallet";
type Saved = { accountId: string | null; hidden: boolean };
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(next: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: state lives only in memory for this render */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function parse(raw: string | null): Saved {
  if (!raw) return { accountId: null, hidden: false };
  try {
    const v = JSON.parse(raw) as Partial<Saved>;
    return { accountId: v.accountId ?? null, hidden: Boolean(v.hidden) };
  } catch {
    return { accountId: null, hidden: false };
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const saved = useMemo(() => parse(raw), [raw]);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    // TODO: replace with NearConnector.connect() and read the signed-in account.
    await new Promise((r) => setTimeout(r, 600));
    write({ accountId: "joseph.near", hidden: saved.hidden });
    setConnecting(false);
  }, [saved.hidden]);

  const disconnect = useCallback(() => {
    write({ accountId: null, hidden: saved.hidden });
  }, [saved.hidden]);

  const toggleHidden = useCallback(() => {
    write({ accountId: saved.accountId, hidden: !saved.hidden });
  }, [saved]);

  const value = useMemo<WalletState>(
    () => ({
      accountId: saved.accountId,
      hidden: saved.hidden,
      connecting,
      connect,
      disconnect,
      toggleHidden,
    }),
    [saved, connecting, connect, disconnect, toggleHidden],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import type { WalletTx } from "@/lib/api";

/**
 * A NEAR wallet connected with NEAR Connect (HOT, Meteor, Nightly, MyNEAR Wallet, …).
 * Separate from email sign-in: the wallet signs its own transactions and keeps its own funds.
 */
type WalletState = {
  accountId: string | null;
  ready: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sign and send in order; resolves with each transaction's hash. */
  signAndSendAll: (txs: WalletTx[]) => Promise<string[]>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);

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
      });
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
  }, [wallet]);

  const signAndSendAll = useCallback(
    async (txs: WalletTx[]) => {
      if (!wallet) throw new Error("Connect a wallet first");
      const outcomes = await wallet.signAndSendTransactions({
        transactions: txs.map((t) => ({ receiverId: t.receiverId, actions: t.actions })),
      } as Parameters<NearWalletBase["signAndSendTransactions"]>[0]);
      const hashes = (outcomes ?? []).map((o) => (o as { transaction?: { hash?: string } }).transaction?.hash ?? "");
      if (!hashes.length || !hashes[hashes.length - 1]) throw new Error("The wallet didn't confirm the transaction.");
      return hashes;
    },
    [wallet],
  );

  const value = useMemo<WalletState>(
    () => ({ accountId, ready, connecting, connect, disconnect, signAndSendAll }),
    [accountId, ready, connecting, connect, disconnect, signAndSendAll],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

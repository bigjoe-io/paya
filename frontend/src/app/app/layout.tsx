import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { SessionProvider } from "@/components/app/session-provider";
import { WalletProvider } from "@/components/app/wallet-provider";

export const metadata: Metadata = {
  title: "Paya app",
};

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <WalletProvider>
      <SessionProvider>
        <AppShell>{children}</AppShell>
      </SessionProvider>
    </WalletProvider>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { SessionProvider } from "@/components/app/session-provider";
import { AccountProvider } from "@/components/app/account-provider";

export const metadata: Metadata = {
  title: "Paya app",
};

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <SessionProvider>
      <AccountProvider>
        <AppShell>{children}</AppShell>
      </AccountProvider>
    </SessionProvider>
  );
}

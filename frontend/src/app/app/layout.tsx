import type { Metadata } from "next";
import { MobileNav, Sidebar } from "@/components/app/sidebar";
import { WalletProvider } from "@/components/app/wallet-provider";

export const metadata: Metadata = {
  title: "Paya app",
};

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <WalletProvider>
      <div className="dark flex min-h-dvh bg-sidebar text-foreground lg:p-2">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col pb-16 lg:rounded-3xl lg:bg-panel lg:pb-0">
          {children}
        </div>
        <MobileNav />
      </div>
    </WalletProvider>
  );
}

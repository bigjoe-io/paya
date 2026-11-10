"use client";

import type { ReactNode } from "react";
import { MobileNav, Sidebar } from "@/components/app/sidebar";
import { SignIn } from "@/components/app/sign-in";
import { useSession } from "@/components/app/session-provider";

/** Gate: the dashboard only renders for a signed-in email. */
export function AppShell({ children }: { children: ReactNode }) {
  const { email } = useSession();
  if (!email) return <SignIn />;
  return (
    <div className="app-bg flex min-h-dvh text-foreground lg:gap-2 lg:p-2">
      <Sidebar />
      <div className="glass flex min-w-0 flex-1 flex-col pb-16 lg:rounded-3xl lg:pb-0">{children}</div>
      <MobileNav />
    </div>
  );
}

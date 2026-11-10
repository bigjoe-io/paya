"use client";

import { Topbar } from "@/components/app/topbar";
import { OrderList } from "@/components/app/order-list";
import { PageTitle } from "@/components/app/ui";

export default function ActivityPage() {
  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-4xl px-4 pb-12 lg:px-6">
        <PageTitle>Activity</PageTitle>
        <p className="mt-1 text-sm text-muted-foreground">Every cash-out, with what you sent and what landed.</p>
        <div className="mt-6">
          <OrderList />
        </div>
      </main>
    </>
  );
}

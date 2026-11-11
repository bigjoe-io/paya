"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { AddressCard } from "@/components/app/address-card";
import { BankForm } from "@/components/app/bank-form";
import { RateCard } from "@/components/app/rate-card";
import { OrderList } from "@/components/app/order-list";
import { useSession } from "@/components/app/session-provider";
import { Amount } from "@/components/app/ui";
import { yoctoToNear } from "@/lib/api";

export default function HomePage() {
  const { me } = useSession();
  const pending = me?.balanceYocto ? yoctoToNear(me.balanceYocto) : 0;

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-4xl px-4 pb-12 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cash out</h1>
            <p className="mt-1 text-sm text-muted-foreground">NEAR in, naira out. Automatically.</p>
          </div>
          {pending > 0.001 && (
            <p className="text-sm text-muted-foreground">
              Waiting in your address: <Amount className="text-foreground">{pending.toFixed(4)} NEAR</Amount>
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-4">
          <AddressCard />
          <div className="grid gap-4 md:grid-cols-2">
            <BankForm compact />
            <RateCard />
          </div>
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recent cash-outs</h2>
            <Link
              href="/app/activity"
              className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              All activity <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-4">
            <OrderList limit={3} />
          </div>
        </section>
      </main>
    </>
  );
}

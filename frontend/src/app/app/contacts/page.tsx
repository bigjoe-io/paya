"use client";

import { Topbar } from "@/components/app/topbar";
import { BankForm } from "@/components/app/bank-form";
import { PageTitle } from "@/components/app/ui";

export default function BankPage() {
  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-4xl px-4 pb-12 lg:px-6">
        <PageTitle>Bank account</PageTitle>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          The Nigerian bank account your cash-outs are paid into. The holder&apos;s name is confirmed with the bank before any money is sent.
        </p>
        <div className="mt-6">
          <BankForm />
        </div>
      </main>
    </>
  );
}

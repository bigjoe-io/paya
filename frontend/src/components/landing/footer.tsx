import Link from "next/link";
export function Footer() {
  return (
    <footer className="container-page pb-12">
      <nav
        aria-label="Footer"
        className="flex items-center justify-center gap-8 py-8 text-[15px]"
      >
        <a
          href="https://x.com/"
          className="focus-ring -m-2 rounded-md p-2 hover:text-muted-foreground"
          aria-label="Paya on X"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.9l-5.4-7.06L4 22H.744l8.02-9.17L.5 2h7.08l4.88 6.45L18.244 2Zm-1.21 18h1.8L7.04 3.9H5.1L17.034 20Z" />
          </svg>
        </a>
        <Link href="/docs" className="focus-ring -m-2 rounded-md p-2 hover:text-muted-foreground">
          Docs
        </Link>
        <a href="/terms" className="focus-ring -m-2 rounded-md p-2 hover:text-muted-foreground">
          Terms of Service
        </a>
        <a href="/privacy" className="focus-ring -m-2 rounded-md p-2 hover:text-muted-foreground">
          Privacy Policy
        </a>
      </nav>

      <div className="border-t border-border pt-8 text-sm text-muted-foreground">
        <div className="flex justify-between">
          <p>Disclaimers</p>
          <p>All rights reserved</p>
        </div>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-pretty">
          <li>
            Paya is a technology platform, not a bank. Each account has its own NEAR address, managed
            by Paya: NEAR sent there is cashed out to your verified bank account or sent on your
            instruction. Conversions are routed to the best available exchange provider, and bank payouts are made by licensed
            payout partners.
          </li>
          <li>
            Payouts are available in Nigeria (NGN), Ghana (GHS), Kenya (KES), Tanzania (TZS), South
            Africa (ZAR) and the United States (USD). Rates are indicative until you swap; every fee is shown before you confirm.
          </li>
        </ol>
      </div>
    </footer>
  );
}

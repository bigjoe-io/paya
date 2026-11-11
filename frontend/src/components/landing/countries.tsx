/** Payout countries — the same list and flags the app's recipient picker uses. */
export const COUNTRIES = [
  { code: "NGN", country: "Nigeria", flag: "🇳🇬", currency: "Naira" },
  { code: "GHS", country: "Ghana", flag: "🇬🇭", currency: "Cedi" },
  { code: "KES", country: "Kenya", flag: "🇰🇪", currency: "Shilling" },
  { code: "TZS", country: "Tanzania", flag: "🇹🇿", currency: "Shilling" },
  { code: "ZAR", country: "South Africa", flag: "🇿🇦", currency: "Rand" },
  { code: "USD", country: "United States", flag: "🇺🇸", currency: "Dollar" },
] as const;

export function Countries() {
  return (
    <section id="countries" className="container-page scroll-mt-20 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">Cash out across Africa and beyond</h2>
        <p className="mt-3 text-muted-foreground text-pretty">
          NEAR to your bank account in your local currency, or in US dollars. More countries are on the way.
        </p>
      </div>
      <ul className="mx-auto mt-10 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COUNTRIES.map((c) => (
          <li
            key={c.code}
            className="flex flex-col items-center rounded-3xl bg-card px-4 py-6 text-center"
          >
            <span className="text-4xl leading-none" aria-hidden="true">
              {c.flag}
            </span>
            <span className="mt-3 font-medium">{c.country}</span>
            <span className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
              {c.code} · {c.currency}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { BadgeCheck, Gauge, Zap } from "lucide-react";

const items = [
  {
    icon: Gauge,
    title: "Live rates",
    body: "The dollar rate of the day, updated every minute. Your fee is shown before you send.",
  },
  {
    icon: BadgeCheck,
    title: "Verified bank details",
    body: "We check the account name before you confirm, so money never goes to the wrong person.",
  },
  {
    icon: Zap,
    title: "Instant payout",
    body: "Settlement runs the moment your transaction is final on NEAR — usually under a minute.",
  },
];

export function Highlights() {
  return (
    <section className="container-page pb-20 md:pb-28">
      <ul className="grid gap-14 md:grid-cols-3 md:gap-8">
        {items.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex flex-col items-center text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-card">
              <Icon className="size-7" aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 max-w-xs text-muted-foreground text-pretty">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

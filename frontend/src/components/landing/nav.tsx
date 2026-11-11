import Link from "next/link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

const links = [
  { href: "#features", label: "Features" },
  { href: "#countries", label: "Countries" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#security", label: "Security" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="container-page flex h-16 items-center justify-between"
      >
        <Link href="/" className="focus-ring rounded-full" aria-label="Paya home">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="focus-ring inline-flex min-h-10 items-center rounded-full px-4 text-[15px] text-muted-foreground transition-colors duration-100 hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <ButtonLink href="/app" className="min-h-10 px-5">
          Open app
        </ButtonLink>
      </nav>
    </header>
  );
}

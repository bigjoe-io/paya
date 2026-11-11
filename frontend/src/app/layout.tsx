import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// Inter with the optical-size axis: large text renders as Inter Display
// (the pairing Fuse uses), body text as regular Inter.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.usepaya.xyz"),
  title: {
    default: "Paya — Buy NEAR with naira, cash out NEAR to your bank",
    template: "%s | Paya",
  },
  description:
    "Buy NEAR with a bank transfer and cash NEAR out to your bank account in naira. Sign in with email — no exchange, no P2P, no seed phrase. Live in Nigeria; more African countries coming.",
  keywords: [
    "buy NEAR in Nigeria",
    "buy NEAR with naira",
    "NEAR to naira",
    "cash out NEAR",
    "sell NEAR Nigeria",
    "NEAR off-ramp Africa",
    "crypto to bank account Nigeria",
    "NEAR Protocol Africa",
  ],
  applicationName: "Paya",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Paya",
    locale: "en_NG",
    url: "/",
    title: "Paya — Buy NEAR with naira, cash out NEAR to your bank",
    description: "Move money between NEAR and your bank account, both ways. Sign in with email.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  // Google Search Console ownership (HTML tag method). Public by design; override with GOOGLE_SITE_VERIFICATION.
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION ?? "lqEQ5y3u-fTIvwPo47Rz2vCUuMzPfpmWV7ri5Z2YW_I" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

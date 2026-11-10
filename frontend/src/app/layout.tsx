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
  title: "Paya — One click from NEAR to fiat",
  description:
    "Paya is a one-click off-ramp on NEAR. Send NEAR, receive naira in your bank account in under a minute. Non-custodial, transparent rates, Nigeria first.",
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

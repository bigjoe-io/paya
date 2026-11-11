import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tester access · Paya", robots: { index: false, follow: false } };

export default function Layout({ children }: LayoutProps<"/admin">) {
  return children;
}

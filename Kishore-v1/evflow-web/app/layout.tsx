import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVFLOW — EV Trip Planner",
  description:
    "Plan EV trips with charging stops on the Bengaluru–Mysuru corridor.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}

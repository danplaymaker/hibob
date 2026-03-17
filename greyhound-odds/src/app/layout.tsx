import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greyhound Odds — Market Discrepancy Scanner",
  description:
    "Detect pricing discrepancies between Betfair Exchange and bookmakers for greyhound racing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold tracking-wide uppercase text-[var(--text-primary)]">
              Greyhound Odds
            </h1>
            <span className="text-xs text-[var(--text-muted)] border border-[var(--border)] px-2 py-0.5 rounded">
              MVP
            </span>
          </div>
          <nav className="flex items-center gap-4 text-xs">
            <a
              href="/"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Dashboard
            </a>
            <a
              href="/?view=opportunities"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Opportunities
            </a>
            <a
              href="/?view=alerts"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Alerts
            </a>
          </nav>
        </header>
        <main className="p-4">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import Nav from "@/components/shared/Nav";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Systematic Options Trading Platform",
  description: "Watchlist-driven systematic options research and execution",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="layout">
            <Nav />
            <main className="main">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}

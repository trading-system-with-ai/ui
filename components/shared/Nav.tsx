"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/", label: "Dashboard" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/trading-pool", label: "Trading Pool" },
  { href: "/positions", label: "Positions" },
  { href: "/backtests", label: "Backtests" },
  { href: "/risk", label: "Risk" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">Options Platform</div>
      <nav>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className={pathname === s.href ? "active" : ""}>
            {s.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

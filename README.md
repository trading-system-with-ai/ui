# Trading Platform — UI

Next.js front end for the systematic options trading platform. Talks **only** to the
backend gateway (`NEXT_PUBLIC_API_BASE`) — never directly to market-data, broker, or
LLM providers.

## Sections

Dashboard · Recommendations · Watchlist · Trading Pool · Positions · Backtests · Risk ·
Activity · Settings

Working today — all nine §28 sections are live: Dashboard (trading status banner,
alerts feed, top opportunities, counts, recent activity), Recommendations (LLM
candidates with promote-to-watchlist), Watchlist (add/remove/promote) plus per-symbol
pages with Price / Options / Backtest / Trade Plan / Audit tabs, Trading Pool
(enable/disable trading, PAUSE ALL, §4.3 promotion checks), Positions (open positions,
exit checks, auto-monitor status), Backtests (run + history with fill models), Risk
(limits, exposure, portfolio Greeks), Activity (full audit trail with filters), and
Settings (read-only effective config).

## UX safety principles (from the development plan §39)

- Watchlist (research-only) is visually distinct from Trading Pool (authorized);
- destructive/enabling actions require confirmation;
- trading status is a prominent banner, never buried;
- audit trail is a first-class page.

## Quick start

```bash
npm install
cp .env.example .env.local   # points at http://localhost:8000
npm run dev                  # http://localhost:3000
```

## Development log

See [docs/DEVLOG.md](docs/DEVLOG.md).

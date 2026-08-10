# Trading Platform — UI

Next.js front end for the systematic options trading platform. Talks **only** to the
backend gateway (`NEXT_PUBLIC_API_BASE`) — never directly to market-data, broker, or
LLM providers.

## Sections

Dashboard · Recommendations · Watchlist · Trading Pool · Positions · Backtests · Risk ·
Activity · Settings

Working today: Dashboard (trading status banner, counts, recent activity), Watchlist
(add/remove/promote), Trading Pool (enable/disable trading, PAUSE ALL), Activity (full
audit trail). Remaining sections are placeholders tied to their development phase.

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

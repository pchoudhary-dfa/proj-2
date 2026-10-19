# DFA v6 Dashboard

Next.js dashboard app with authentication via [`dfa-v6-comp-login`](packages/dfa-v6-comp-login) and a same-origin BFF (`/api/auth/*`).

## Prerequisites

- Node.js 18+
- Access to the DFA Toolkit API and dashboard app credentials (`APP_ID`, `NEXT_PUBLIC_API_KEY`, etc.)

## Environment

Copy `.env.example` to `.env.local` and set values from your toolkit onboarding:

```bash
cp .env.example .env.local
```

Key variables:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_BASE_ID` | Product base id (e.g. `DTK_DASHBOARD`) |
| `NEXT_PUBLIC_APP_ID` | Unique adaptation id |
| `NEXT_PUBLIC_API_BASE_URL` | Toolkit API host |
| `NEXT_PUBLIC_API_KEY` | Fed client key |
| `DM_API_SIGNING_PRIVATE_KEY` | Optional server PEM for BFF signing |

## Development

```bash
npm install
npm run dev
```

`predev` builds `packages/dfa-v6-comp-login` when `dist/` is missing. To rebuild the login package manually:

```bash
npm run build:packages
```

Open [http://localhost:3000](http://localhost:3000) for the login screen. After sign-in you are redirected to `/dashboard`.

## Production build

```bash
npm run build
npm run start
```

## Monorepo packages

- `packages/dfa-v6-comp-login` — shared login UI (Vite library)
- `packages/design-tokens` — CSS variables used by the login component

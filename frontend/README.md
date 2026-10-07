# Frontend — Nairobi Service Recommender

Next.js 14 (App Router) + TypeScript + Tailwind CSS client for the service
recommender. Talks to the FastAPI backend in `../ml-service/`.

## Requirements
- Node.js 18+
- The backend running locally (see `../LOCAL_SETUP.md`). Every page except the
  landing page reads live data from it; there is no mock data.

## Getting started
```bash
cd frontend
npm install
npm run dev
```
Runs on [http://localhost:3000](http://localhost:3000) (falls back to 3001 if
3000 is taken).

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build (`next build`) |
| `npm run start` | Serve the production build |
| `npm run lint` | Run `next lint` |

## Structure
- `app/(marketing)/` — public landing page only (shared Navbar/Footer layout)
- `app/(app)/` — authenticated sidebar shell: `/dashboard`, `/profile`,
  `/notifications`, the client booking flow (`/request` → `/results` →
  `/booking`), `/provider/*`, `/admin/*` (role-gated via `use-auth-guard.ts`)
- `app/login/`, `app/register/` — top-level, no shared chrome
- `app/globals.css`, `tailwind.config.ts` — teal/stone design system

## Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL of the FastAPI backend |

Copy `.env.example` to `.env.local` to override. The value is read in
`lib/api.ts` and inlined at build time.

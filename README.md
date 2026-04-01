# Group Trip Planner

A collaborative trip planning app for groups. Plan itineraries, track budgets, manage reservations, share packing lists, and collaborate in real time — hosted entirely on Cloudflare's free tier.

## Features

- **Google Sign-In** — OAuth 2.0 with session cookies; guest access via invite link (no account required)
- **Interactive Map** — Leaflet + OpenStreetMap; drop pins, link activities to locations, per-day route polylines
- **Drag & Drop Itinerary** — Reorder activities by day with live optimistic updates
- **Day Notes** — Rich-text notes per day (Tiptap editor, auto-save)
- **Expense Tracking** — Split costs equally, by percentage, or custom amounts; settlement calculator
- **Reservations** — Log flights, hotels, restaurants with confirmation numbers
- **Packing Lists** — Template-based lists, assign items to members, check off as you pack
- **Document Storage** — Upload boarding passes and confirmations to Cloudflare R2 (50 MB/trip)
- **Weather Forecast** — 16-day forecast via Open-Meteo (free, no API key needed)
- **Real-time Collaboration** — Live updates via WebSockets (Cloudflare Durable Objects)
- **AI Packing Suggestions** — Destination-aware suggestions via Cloudflare Workers AI
- **PWA** — Installable on iOS and Android

## Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Cloudflare Workers (TypeScript) |
| API framework | Hono |
| Database | Cloudflare D1 (SQLite) |
| Sessions / cache | Cloudflare KV |
| Real-time | Cloudflare Durable Objects (WebSocket hub per trip) |
| File storage | Cloudflare R2 |
| AI | Cloudflare Workers AI (`llama-3.1-8b-instruct-fp8`) |
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| Server state | TanStack Query v5 |
| Client state | Zustand |
| Maps | Leaflet + react-leaflet + OpenStreetMap |
| Drag & drop | @dnd-kit/core + @dnd-kit/sortable |
| Charts | Recharts |
| Rich text | Tiptap |
| PWA | vite-plugin-pwa + Workbox |
| Frontend hosting | Cloudflare Pages |

All external services are free — OpenStreetMap (maps), Nominatim (geocoding), Open-Meteo (weather), open.er-api.com (exchange rates).

## Project Structure

```
group-trip-planner/
├── src/                          # Cloudflare Worker (backend)
│   ├── index.ts                  # Entry point, route registration, CORS, rate limiting
│   ├── types.ts                  # Shared TypeScript types and Env bindings
│   ├── durable-objects/
│   │   └── TripRoom.ts           # WebSocket hub — one instance per trip
│   ├── middleware/
│   │   └── auth.ts               # requireAuth / optionalAuth / requireFullAccount
│   ├── lib/
│   │   ├── auth.ts               # JWT sign/verify (Web Crypto), session helpers
│   │   ├── activity.ts           # Activity feed logger
│   │   └── geocode.ts            # Nominatim geocoding with KV cache
│   ├── routes/
│   │   ├── auth.ts               # Google OAuth flow
│   │   ├── trips.ts              # Trip CRUD, members, activity feed
│   │   ├── itineraries.ts        # Itinerary items + reorder
│   │   ├── day-notes.ts          # Per-day rich text notes
│   │   ├── expenses.ts           # Expense tracking + splits + summary
│   │   ├── reservations.ts       # Booking tracker
│   │   ├── packing.ts            # Packing lists + items + templates
│   │   ├── documents.ts          # R2 upload/download/delete
│   │   ├── invites.ts            # Invite token CRUD + public redeem
│   │   ├── weather.ts            # Open-Meteo proxy with KV cache
│   │   ├── currency.ts           # Exchange rates proxy with KV cache
│   │   ├── ws.ts                 # WebSocket ticket + Durable Object forwarding
│   │   └── ai.ts                 # AI suggestions
│   └── db/
│       ├── queries.ts            # D1 query helpers
│       ├── seed.sql              # Local dev seed data
│       └── migrations/
│           ├── 0001_initial_schema.sql
│           └── 0002_auth_and_features.sql
├── test/                         # Vitest test suite (runs in Workers runtime)
│   ├── helpers.ts                # DB migrations, seed helpers, request utilities
│   ├── auth.test.ts              # JWT, /auth/me, /auth/logout
│   ├── trips.test.ts             # Trip CRUD, member roles, access control
│   ├── itineraries.test.ts       # Itinerary items, lat/lng, role guards
│   ├── expenses.test.ts          # Expense creation, splits, balance summary
│   ├── invites.test.ts           # Invite tokens, guest redemption
│   └── packing.test.ts           # Packing lists, templates, check toggle
├── frontend/                     # React app (Cloudflare Pages)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.tsx
│   │   │   ├── AuthCallbackPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── TripPage.tsx      # Tab shell with activity feed + guest banner
│   │   │   ├── InvitePage.tsx    # Public invite landing
│   │   │   └── trip/             # Per-tab pages
│   │   │       ├── ItineraryPage.tsx
│   │   │       ├── MapPage.tsx
│   │   │       ├── ExpensesPage.tsx
│   │   │       ├── ReservationsPage.tsx
│   │   │       ├── PackingPage.tsx
│   │   │       ├── DocumentsPage.tsx
│   │   │       └── TripSettingsPage.tsx
│   │   ├── hooks/                # useAuth, useTripWebSocket, etc.
│   │   ├── store/                # authStore, tripStore (Zustand)
│   │   ├── api/                  # Typed fetch wrapper (client.ts)
│   │   ├── lib/                  # dateUtils, leafletConfig, currencyUtils
│   │   └── types/api.ts          # Frontend mirror of backend types
│   ├── public/
│   │   └── _redirects            # SPA fallback for Cloudflare Pages
│   └── .env.production           # VITE_API_URL for production builds
├── .github/workflows/deploy.yml  # CI/CD: test → migrate → deploy Worker + Pages
├── wrangler.toml                 # Cloudflare Workers configuration
└── vitest.config.ts              # Test runner configuration (Workers pool)
```

## Local Development

### Prerequisites

- Node.js 20+
- A Cloudflare account (free)
- A Google Cloud project with OAuth 2.0 credentials

### 1. Install dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Create Cloudflare resources

```bash
npx wrangler d1 create group-trip-planner-db
npx wrangler kv namespace create SESSIONS
npx wrangler r2 bucket create group-trip-planner-docs
```

Copy the output `database_id` and `id` values into `wrangler.toml`.

### 3. Configure environment

Create `.dev.vars` in the project root:

```
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
JWT_SECRET=<output of: openssl rand -hex 32>
FRONTEND_URL=http://localhost:5173
ENVIRONMENT=development
```

### 4. Run migrations

```bash
npm run db:migrate:local
```

### 5. Start dev servers

```bash
# Terminal 1 — backend (http://localhost:8787)
npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd frontend && npm run dev
```

The frontend Vite dev server proxies all API paths to the Worker.

## Testing

Tests run directly in the Cloudflare Workers runtime using [`@cloudflare/vitest-pool-workers`](https://developers.cloudflare.com/workers/testing/vitest-integration/). Each test gets an isolated in-memory D1 database and KV namespace — no mocks, no stubs.

```bash
npm test           # run all tests once
npm run test:watch # re-run on file changes
```

### Test coverage

| Suite | What's tested |
|-------|--------------|
| `auth.test.ts` | JWT sign/verify, token expiry, /auth/me with valid and invalid sessions, /auth/logout clears KV |
| `trips.test.ts` | CRUD, owner-only delete, viewer cannot edit, member list |
| `itineraries.test.ts` | CRUD, lat/lng update, viewer cannot create, non-member gets 403 |
| `expenses.test.ts` | Create with splits, per-person balance calculation, delete cascades splits |
| `invites.test.ts` | Token preview, authenticated redeem, guest user creation, revoke clears KV |
| `packing.test.ts` | List CRUD, template bulk insert, check/uncheck toggle, delete cascades items |

## Deployment

Deployments run automatically on push to `main` via GitHub Actions (`.github/workflows/deploy.yml`):

1. Type-check backend
2. Run test suite
3. Apply D1 migrations to production
4. Deploy Worker
5. Type-check + build frontend
6. Deploy frontend to Cloudflare Pages

### Manual first-time setup

```bash
# Set production secrets
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put JWT_SECRET
npx wrangler secret put FRONTEND_URL   # https://group-planner.korih.com

# Apply migrations to production DB
npx wrangler d1 migrations apply group-trip-planner-db --remote

# Deploy Worker
npm run deploy

# Build and deploy frontend
cd frontend
npm run build
npx wrangler pages deploy dist --project-name group-trip-planner-frontend
```

### GitHub Actions secrets

Add these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers, D1, Pages, and R2 permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `VITE_API_URL` | `https://api.group-planner.korih.com` |

### Google OAuth setup

In Google Cloud Console → Credentials → your OAuth 2.0 client, add these **Authorized redirect URIs**:

```
http://localhost:8787/auth/google/callback
http://127.0.0.1:8787/auth/google/callback
https://api.group-planner.korih.com/auth/google/callback
```

### R2 CORS

In Cloudflare Dashboard → R2 → `group-trip-planner-docs` → Settings → CORS:

```json
[{
  "AllowedOrigins": ["https://group-planner.korih.com"],
  "AllowedMethods": ["GET", "PUT"],
  "AllowedHeaders": ["Content-Type"],
  "MaxAgeSeconds": 3600
}]
```

## Architecture Notes

**Auth flow:** Google OAuth → Worker sets HttpOnly session cookie on `api.group-planner.korih.com` → redirects to Pages frontend. Subsequent API calls include the cookie automatically (`credentials: 'include'`). Same-site cookies work across `korih.com` subdomains with `SameSite=Lax`.

**Guest access:** Invitees without a Google account get a `guest_<token>` stored in KV. The frontend stores this in `sessionStorage` and sends it as a `Bearer` token on every request. Guests get read-only access by default.

**Real-time:** Each trip has a Durable Object instance acting as a WebSocket broadcast hub. The Worker writes to D1 first, then calls the DO to broadcast the change to all connected clients. The DO uses the hibernation API so idle connections don't incur billable time.

**KV usage** is the tightest free-tier constraint (1,000 writes/day). Session reads happen on every authenticated request; mitigated by Worker-level in-memory caching within a single invocation.

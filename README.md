# Group Trip Planner

Make it easier to plan group trips and have a nice itinerary.

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (TypeScript)
- **Framework**: [Hono](https://hono.dev/) — lightweight web framework for Cloudflare Workers
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) — serverless SQLite
- **Cache/Sessions**: [Cloudflare KV](https://developers.cloudflare.com/kv/) — key-value store
- **AI**: [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) — LLM-powered itinerary suggestions

## Project Structure

```
src/
├── index.ts              # Worker entry point & route registration
├── types.ts              # Shared TypeScript types
├── routes/
│   ├── users.ts          # User management endpoints
│   ├── trips.ts          # Trip CRUD & member management
│   ├── itineraries.ts    # Itinerary item CRUD
│   ├── expenses.ts       # Expense tracking & splitting
│   └── ai.ts             # AI-powered itinerary suggestions
└── db/
    ├── queries.ts         # D1 database query helpers
    ├── seed.sql           # Local development seed data
    └── migrations/
        └── 0001_initial_schema.sql
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Create Cloudflare resources

```bash
# Create a D1 database
wrangler d1 create group-trip-planner-db

# Create a KV namespace
wrangler kv namespace create SESSIONS
```

Update `wrangler.toml` with the `database_id` and KV namespace `id` returned by the commands above.

### 3. Run database migrations

```bash
# Apply migrations locally
npm run db:migrate:local

# Seed local database with sample data
npm run db:seed
```

### 4. Start the local development server

```bash
npm run dev
```

The API will be available at `http://localhost:8787`.

## API Endpoints

### Health Check
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API health check |

### Users
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/:id` | Get user by ID |
| GET | `/users/by-email/:email` | Get user by email |
| POST | `/users` | Create a user |

### Trips
| Method | Path | Description |
|--------|------|-------------|
| GET | `/trips?userId=<id>` | List trips for a user |
| GET | `/trips/:id` | Get trip details |
| POST | `/trips` | Create a trip |
| PATCH | `/trips/:id` | Update a trip |
| DELETE | `/trips/:id` | Delete a trip |
| GET | `/trips/:id/members` | List trip members |
| POST | `/trips/:id/members` | Add a member to a trip |
| DELETE | `/trips/:id/members/:userId` | Remove a member from a trip |

### Itinerary
| Method | Path | Description |
|--------|------|-------------|
| GET | `/itineraries?tripId=<id>` | List itinerary items for a trip |
| GET | `/itineraries/:id` | Get itinerary item |
| POST | `/itineraries` | Create itinerary item |
| PATCH | `/itineraries/:id` | Update itinerary item |
| DELETE | `/itineraries/:id` | Delete itinerary item |

### Expenses
| Method | Path | Description |
|--------|------|-------------|
| GET | `/expenses?tripId=<id>` | List expenses for a trip |
| GET | `/expenses/summary?tripId=<id>` | Get per-member expense summary |
| GET | `/expenses/:id` | Get expense details |
| GET | `/expenses/:id/splits` | Get expense splits |
| POST | `/expenses` | Create expense (auto-splits equally among members) |

### AI
| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai/suggestions` | Generate AI itinerary suggestions |
| POST | `/ai/optimize-itinerary` | Optimize an existing itinerary |

#### Example: Generate AI suggestions

```bash
curl -X POST http://localhost:8787/ai/suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "Tokyo, Japan",
    "start_date": "2025-04-01",
    "end_date": "2025-04-10",
    "group_size": 4,
    "interests": ["food", "culture", "anime"],
    "budget": "moderate"
  }'
```

## Deployment

```bash
# Run migrations on the remote D1 database
npm run db:migrate

# Deploy the Worker
npm run deploy
```

## Development

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Regenerate Cloudflare types from wrangler.toml
npm run cf-typegen
```

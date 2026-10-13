# MSME Business Platform (MVP)

Multi-tenant business management for Philippine MSMEs: sales and collections, orders, customers, expenses,
employees and reports, with a 14-day free trial. *Temporary product name.*

| | |
|---|---|
| Frontend | React 19 + TypeScript + Vite, Tailwind CSS 4, React Router, React Hook Form + Zod, Recharts, Lucide |
| Backend | Supabase: Postgres with Row Level Security, Auth, private Storage |
| Hosting | Netlify (static SPA; no server secrets needed yet) |
| Money / time | Integer centavos · PHP · Asia/Manila by default |

## Quick start
```bash
npm install
cp .env.example .env     # Supabase URL + publishable key
npm run dev              # http://localhost:5173
npm test                 # unit tests
npm run test:db          # SQL tenancy/RLS tests on a local Postgres 17 (see docs/TESTING.md)
npm run build            # type-check + production build
```

## Docs
- [docs/PLAN.md](docs/PLAN.md): requirements review, decisions, risks, architecture, schema, roadmap
- [docs/CHECKLIST.md](docs/CHECKLIST.md): what's done, what's pending, what's tested
- [docs/SETUP.md](docs/SETUP.md): Supabase and Netlify configuration
- [docs/TESTING.md](docs/TESTING.md): how to run and what the tests cover
- [docs/SECURITY.md](docs/SECURITY.md): tenancy model, roles, error codes, privacy

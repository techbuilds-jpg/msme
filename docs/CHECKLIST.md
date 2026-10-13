# Implementation checklist

Legend: ✅ done and tested · 🟡 done, not yet tested end-to-end in the browser · ⬜ pending

## Phase 1 — Architecture & setup
- ✅ Requirements review, decisions, risks, architecture, schema and roadmap ([PLAN.md](PLAN.md))
- ✅ Supabase project `MSME Business Platform` (ref `oufamslcxfqmtwyuxyzo`, Singapore, free tier)
- ✅ Schema: 23 tables, composite tenant keys, constraints, indexes, timestamps (4 migrations, applied remotely)
- ✅ RLS on every table; anonymous visitors have no table or function access (verified on the live project)
- ✅ Permission model: owner, manager and employee roles plus per-member grants, enforced in the database
- ✅ Trial enforcement in the database: read-only after expiry, 100 orders+sales cap, 3-user cap, one trial per account
- ✅ Audit log triggers (members, settings, subscription, invitations, sales, payments, expenses, employees)
- ✅ Rate limiting for business creation, invitations and error reports
- ✅ Invitation system (hashed tokens, email-matched acceptance, seat limit, re-invite replaces)
- ✅ Support-access grants (time-limited, read-only, audited) — DB only; UI in Phase 4
- ✅ SQL test suite: 71 assertions incl. cross-tenant reads/writes, manipulated IDs, roles, trial limits
- ✅ Live smoke test on Supabase (rolled back): onboarding + cross-tenant denial
- ✅ React app scaffold, design tokens, reusable UI kit, navy sidebar shell (responsive, skip link, keyboard nav)
- ✅ Register / login / forgot password pages; validation and failed sign-in verified in the browser
- ✅ Real sign-up → email verification → onboarding → overview, verified with the owner's account (2026-10-13)
- 🟡 Password reset, profile edit, resend verification, business picker, accept-invite — built and type-checked,
     backed by tested RPCs; not yet clicked through in the browser
- ✅ Netlify config: SPA redirect, security headers + CSP
- ✅ GitHub repo: https://github.com/techbuilds-jpg/msme
- ⬜ Netlify site

## Phase 2 — Core application
- ⬜ Dashboard KPIs (sales, collected, receivables, expenses, net cash movement, orders) with date filters
- ⬜ Customers (list, search, add/edit, detail with orders, transactions, balance)
- ⬜ Orders (RPCs save_order / change_order_status / add_order_note, detail page with activity log)
- ⬜ Sales & payments (RPCs create_sale / record_payment / refund / void, idempotency keys)
- ⬜ Expenses (+ private receipt storage bucket and policies, summaries)
- ⬜ Catalogue of products/services

## Phase 3 — Business administration
- ⬜ Employees directory & profiles · ⬜ Team: invite, roles, permission grants UI · ⬜ Settings (business profile, modules, categories)
- ⬜ Reports + CSV export (audited) · ⬜ Audit log viewer

## Phase 4 — Trial & demo
- ⬜ Contact-us / consultation request, upgrade interest · ⬜ Demo sandbox (anonymous sign-in, seeded, auto-deleted by pg_cron)
- ⬜ Platform admin: metrics, trial extension, suspension, feature flags, errors, audit events, support-access UI

## Phase 5 — Testing & deployment
- ⬜ Isolation tests against a Supabase branch through the REST API · ⬜ Responsive pass · ⬜ Production deploy

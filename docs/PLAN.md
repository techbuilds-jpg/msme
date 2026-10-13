# MSME Business Platform — Architecture & Plan

Temporary product name: **MSME Business Platform**. This document is the "before writing code" review the brief asks
for. The live progress list is in [CHECKLIST.md](CHECKLIST.md).

---

## 1. Requirements review — decisions I made (change any of them)

| # | Gap in the brief | Decision |
|---|---|---|
| D1 | How money is stored | Integer **centavos** (`bigint`). No floating point anywhere. Currency is per business (default PHP); the MVP does not convert currencies. |
| D2 | What "100 orders/transactions" counts | Orders **plus** sales, combined, counted on creation. Payments, expenses and customers do not count. Limit is a column on `subscriptions`, so it can change per business. |
| D3 | "One business per new trial registration" | A user can start **one** trial business (`profiles.trial_used_at`). Being invited into other businesses is unlimited. Platform admins can lift it. Demo businesses don't count. |
| D4 | What "max three active user accounts" counts | Active members **plus** pending invitations ≤ `subscriptions.max_users` (3 on trial), so invites can't be used to bypass the limit. |
| D5 | What happens after trial expiry | Read-only: every insert/update on operational tables is refused by the database. Login, viewing, CSV export and "contact us" stay open. Nothing is deleted automatically. |
| D6 | Expiry needs a cron? | No. "Expired" is computed from `trial_ends_at < now()`, so it's always correct. Admins extend a trial by moving the date. |
| D7 | Employee vs. user | `business_members` = people who **log in** (with a role). `employees` = the **staff directory** (can exist without a login, e.g. a rider); optionally linked to a member. Orders are assigned to employees. This keeps attendance, leave and payroll possible later without touching auth. |
| D8 | Permissions model | Role defaults (owner / manager / employee) **plus** per-member extra grants (`extra_permissions text[]`). One SQL function, `private.has_perm(business, perm)`, is used by every RLS policy and RPC. |
| D9 | How financial writes happen | Sales, payments, refunds and voids **only** through `SECURITY DEFINER` functions that lock the sale row, recompute totals server-side and require an idempotency key. Direct table writes to those tables are revoked. |
| D10 | Deleting financial records | Not allowed. Sales, payments and expenses are **voided** with a reason, and the void is audited. |
| D11 | Order activity log | One `order_activity` table (created, status changed, assigned, note, edited). Status history = rows of kind `status_changed`, each with actor and timestamp. |
| D12 | Extensibility for business types | `orders.order_type` + `orders.custom_fields jsonb` + `business_settings.enabled_modules`. Future modules (alterations, deliveries, projects) add their own tables keyed by `(business_id, order_id)`. |
| D13 | Demo sandbox | Each visitor gets their **own** throwaway demo business, seeded with clearly fictional data (`businesses.is_demo = true`). It uses Supabase anonymous sign-in, so the demo never touches real tenants and needs no shared login. Demo businesses are deleted after 48 h by a scheduled `pg_cron` job. *(Phase 4)* |
| D14 | Platform admin vs. tenant data | Admins see **aggregates only** (counts, usage, status) through admin functions. To read a tenant's records, the business owner must create a time-limited **support grant**. Grants are audited, and RLS honours them read-only. |
| D15 | Invitations | The owner or manager creates an invite. A random token is shown once as a link to copy and send; only its SHA-256 hash is stored. Accepting requires being signed in with a **verified email that matches** the invite. Automatic invite emails are optional later (see §6). |
| D16 | Server-side code | Almost everything is Postgres functions + RLS called from the browser with the user's JWT. **No service-role key is needed in Phase 1–3.** Netlify Functions are reserved for anything that needs a secret (e.g. an email provider). |
| D17 | Dashboard "updates when records change" | Refetch after every mutation and on window focus. Supabase Realtime can be added later; it isn't needed for correctness. |
| D18 | Data retention | `platform_settings.retention_days_after_expiry` (default 180) is shown to admins, who can see which expired tenants are past it. Deletion stays a **manual, audited admin action**; nothing is purged automatically and nothing promises indefinite storage. |
| D19 | BIR | Sale numbers are internal references, not official receipts or invoices. The UI says so. |

## 2. Major risks & mitigations

| Risk | Mitigation |
|---|---|
| Cross-tenant data leak (the #1 risk) | RLS on **every** tenant table, keyed on `business_id`. Composite foreign keys `(business_id, x_id)` stop anyone linking to another tenant's customer/order even with a guessed UUID. A trigger makes `business_id` immutable. SQL tests act as users of Business A and try to read and write Business B. |
| RLS recursion / slow policies | Membership checks live in `SECURITY DEFINER` helpers in a non-exposed `private` schema, with `search_path = ''`. Every `business_id` column is indexed. |
| Double payments (double-click, retry) | Unique `(business_id, idempotency_key)` on payments and sales. The payment RPC locks the sale row `FOR UPDATE` and refuses amounts above the balance. |
| Trial-limit race (two inserts at 99) | The usage counter on `subscriptions` is updated in the same transaction under a row lock, so the 101st insert fails. |
| Privilege escalation (employee makes themselves owner) | Membership changes only via RPC. Managers can't create owners or managers or change owners. The last owner can't be removed. |
| Service-role key leak | Not used in the browser. Nothing in Phases 1–3 needs it. |
| Supabase free-tier limits (auth email rate ≈ 2/h on the built-in SMTP, project pauses after 1 week idle) | Fine for a trial. Before real customers, add custom SMTP (Resend/Brevo have free tiers) and move to Pro ($25/mo) to avoid pausing. |
| Data Privacy Act (RA 10173) | Collect only what's needed, keep files in private storage, audit-log sensitive actions, provide a privacy notice and an export path. Data residency: Singapore (`ap-southeast-1`). |

## 3. Architecture

```
Browser (React + Vite, Netlify CDN)
   │  anon/publishable key + user JWT
   ▼
Supabase
   ├─ Auth            email+password, email verification, reset, (anonymous sign-in for demo)
   ├─ PostgREST       tables guarded by RLS (reads + simple writes)
   ├─ RPC functions   multi-step / financial / admin operations (SECURITY DEFINER, explicit permission checks)
   ├─ Storage         private `receipts` bucket, path = <business_id>/<uuid>, RLS on storage.objects
   └─ pg_cron         demo cleanup (Phase 4)
Netlify Functions   only when a secret is required (none yet)
```

Schemas: `public` (exposed tables and RPCs) and `private` (helpers; not exposed through the API).

## 4. Database design

```
auth.users 1─1 profiles
profiles ─< business_members >─ businesses ─1 business_settings
                                     │      └1 subscriptions (trial)
                                     ├─< business_invitations
                                     ├─< employees (optional member_id → business_members)
                                     ├─< customers
                                     ├─< catalog_items (products/services price list)
                                     ├─< orders ─< order_items
                                     │     └─< order_activity (status history, notes, assignments)
                                     ├─< sales ─< sale_items
                                     │     └─< payments (payments + refunds, voidable)
                                     ├─< expense_categories ─< expenses (receipt in Storage)
                                     ├─< audit_logs
                                     ├─< support_access_grants
                                     └─< consultation_requests
platform_admins, platform_settings, app_errors, private.rate_limits
```

All tenant tables have `business_id uuid not null`, `created_at`, `updated_at`, and an index on `business_id`.
Child tables reference parents with composite keys `(business_id, parent_id)`.

**Roles → default permissions**

| Permission | Owner | Manager | Employee |
|---|:-:|:-:|:-:|
| customers.view / customers.manage | ✓ | ✓ | ✓ |
| orders.view / orders.manage | ✓ | ✓ | ✓ |
| sales.view, sales.manage, payments.manage, sales.discount | ✓ | ✓ | grant |
| expenses.view, expenses.manage | ✓ | ✓ | grant |
| reports.view, reports.export | ✓ | ✓ | grant |
| team.manage (employees, invites) | ✓ | ✓ (employees only) | – |
| settings.manage | ✓ | – | – |

"grant" = an owner can switch it on per person.

## 5. Folder structure

```
msme-platform/
  docs/                     PLAN, CHECKLIST, SETUP, SECURITY, TESTING, DEPLOYMENT
  supabase/
    migrations/             numbered SQL, never edited after being applied
    tests/                  SQL tenant-isolation + workflow tests (run on local Postgres)
  scripts/test-db.sh        throwaway local DB → migrations → SQL tests
  src/
    app/                    App, router, route guards, providers
    components/ui/          design system: Button, Field, Card, Table, Modal, Badge, EmptyState…
    components/layout/      AppShell (navy sidebar), AuthLayout, AdminLayout
    features/<module>/      api.ts (data access) + pages/components per module:
                            auth, business, onboarding, dashboard, sales, orders, customers,
                            expenses, employees, reports, settings, trial, admin, demo
    lib/                    supabase client, money, dates, csv, permissions, hooks
  tests/                    vitest unit tests (money, validation, permissions)
  netlify.toml              build, SPA redirect, security headers (CSP)
```

UI talks to `features/*/api.ts`, never to `supabase` directly. Brand colours live only in `src/index.css` `@theme`.

## 6. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Project setup, Supabase project, full schema, RLS, core functions, auth (register / verify / login / reset / profile), business creation and selection, app shell, Netlify config, tenant-isolation tests | **in progress** |
| 2 | Onboarding templates, dashboard, customers, orders, sales and payments, expenses (+ receipts) | pending |
| 3 | Employees, roles and permissions UI, invitations UI, reports + CSV, audit log viewer | pending |
| 4 | Trial UI (banner, warnings, read-only mode, contact us), demo sandbox, platform admin area | pending |
| 5 | Security/isolation test pass on the real project, responsive checks, production build, Netlify deploy | pending |

### Things you'll need to do (I can't do them for you)
1. **Netlify**: connect the GitHub repo (or let me deploy through the Netlify connector) and set the two `VITE_` env vars.
2. **GitHub**: create an empty repo and push `main`.
3. **Supabase dashboard → Auth → URL configuration**: set Site URL and redirect URLs to your Netlify domain (I'll give exact values).
4. **Platform admin**: after you register, I add your user to `platform_admins` (SQL, one line).
5. **Optional, before real customers**: custom SMTP for auth emails, and Supabase Pro to avoid project pausing.

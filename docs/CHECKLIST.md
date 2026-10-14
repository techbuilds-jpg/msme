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
- ✅ Netlify site: https://msme-platform.netlify.app (manual deploys for now; Git auto-deploy needs linking in Netlify UI)

## Phase 2 — Core application
- ✅ Database: `save_order`, `change_order_status`, `add_order_note`, `create_sale`, `record_payment` (payments and refunds),
     `void_payment`, `void_sale`, `void_expense`, `dashboard_summary`, `expense_summary`, `customer_balances` view,
     private `receipts` bucket with per-business storage policies (migrations 5–6, applied remotely)
- ✅ SQL tests: 59 more assertions — numbering, totals, partial payments, idempotent retries, overpayment/over-refund,
     voids, permissions per role, cross-tenant attempts on every RPC, dashboard figures, receipt isolation
- ✅ Live smoke test on Supabase (rolled back): order → status → sale with upfront payment → payment → balance → dashboard
- 🟡 Dashboard: KPIs ordered by category template, Today / This week / This month / Custom, sales vs collections trend
     (+ table view), orders by status, recent transactions, empty state, refetch on tab focus
- 🟡 Customers: list + search + status filter, add/edit, detail with orders, transaction history, outstanding balance
- 🟡 Orders: list with status/assignee filters + search, create/edit with line items, detail with status control,
     notes and chronological activity log; "Record sale" from an order
- 🟡 Sales & collections: list with payment-status/date filters, new sale (price list, discount within limit, optional
     upfront payment), detail with payments, refunds, voids (with reasons); price list (catalogue) tab
- 🟡 Expenses: list with date/category filters, category summary, add/edit with private receipt upload, custom
     categories, void with reason, signed short-lived receipt links
     — 🟡 = built, type-checked and backed by tested database functions; not yet clicked through in a browser
       (needs a signed-in test account, see the Phase 2 note in the README of this checklist)

## Phase 3 — Business administration
- ✅ Database: `report_data` (7 reports, each needing reports.view plus the data's own permission, 5,000-row cap),
     `log_export` (needs reports.export, rate-limited, audited), module/KPI validation on settings, order/sale
     numbering that skips numbers already used after a prefix change (migration 7, applied remotely)
- ✅ SQL tests: 19 more assertions (149 total) incl. permission splits (reports.view without sales.view), export
     refusal, other-tenant refusal; live smoke test on Supabase (rolled back)
- ✅ CSV helper unit-tested (escaping, formula-injection guard, numbers stay numeric)
- 🟡 Employees: directory (current / former), add/edit, profile with app-access role, assigned orders, recent activity
- 🟡 Settings → Team & permissions: members with roles and extra permissions, invite (copyable one-time link),
     revoke, deactivate/reactivate, role matrix; owner-only permission grants, managers limited to employees
- 🟡 Settings → Business profile, Preferences (modules, dashboard figures + order, numbering prefixes, discount limit),
     Expense categories (rename / hide / add), Audit log (filters, paging, actor names, raw details)
- 🟡 Reports: sales summary, collections, receivables (with age), expense breakdown, orders by status, employee
     assignments (with overdue), customer transaction history; date filter, totals, CSV export (logged first)
     — 🟡 = built, type-checked and backed by tested database functions; not yet clicked through in a browser
- Note: export permission controls the *download* and is audited; anyone who can view a report can still read it on screen.

## Phase 4 — Trial & demo
- ✅ Database (migrations 8–10, applied remotely): `request_consultation`, owner-issued support grants
     (`grant_support_access` / `revoke_support_access`, audited `support_open`), demo sandbox (`start_demo` +
     fictional seed data), hourly `pg_cron` job `cleanup-demos` (active on Supabase), admin functions
     (`admin_overview`, `admin_list_businesses`, `admin_extend_trial`, `admin_set_suspension`, `admin_set_plan`,
     consultations, platform settings), payments cascade on whole-tenant delete
- ✅ SQL tests: 41 more assertions (197 total): demo isolation between visitors, anonymous users can't create real
     businesses, cleanup after 48 h, support grants (read-only, scoped, revocable, audited), admin can't read tenant
     records or tenant audit entries, suspension = read-only, plan/modules change, settings validation
- ✅ Trial already enforced in the database since Phase 1 (read-only after expiry, limits); banner now has
     **Contact us** and a limit-reached warning
- 🟡 Settings → Data export (CSV per table, audited, works after expiry) and Settings → Support access
- 🟡 Demo page `/demo` and "Try a demo" link — page verified in the browser; starting a demo needs
     **Anonymous sign-ins enabled** in Supabase (currently off, the page shows "not available")
- 🟡 Platform admin `/admin`: overview metrics, businesses (filters incl. upgrade interest / past retention; extend,
     suspend, plan + limits + modules, all with reasons), inquiries, support access, app errors, admin audit, platform
     settings (trial defaults, retention, contact details)

## Security add-on
- ✅ Cloudflare Turnstile on sign-in, sign-up, forgot-password, resend-verification and demo (anonymous sign-in);
     token passed to Supabase Auth as `captchaToken`, reset after every attempt; CSP allows challenges.cloudflare.com.
     Verified in the browser: widget renders on all four pages, demo refuses to start without it.
- ⬜ Turn on CAPTCHA in Supabase (needs the Turnstile secret key) — until then Supabase ignores the token

## Phase 5 — Testing & deployment
- ⬜ Isolation tests against a Supabase branch through the REST API · ⬜ Responsive pass · ⬜ Production deploy

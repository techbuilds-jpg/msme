# Testing

## Unit tests
`npm test` runs the money parsing/formatting tests (vitest).

## Database tests (tenancy, RLS, permissions, trial)
`supabase/tests/10_tenancy_test.sql` runs against a **throwaway local Postgres 17** with the migrations
applied on top of minimal Supabase stubs (`00_supabase_stubs.sql`). Never point it at the real project.

```bash
# one-time: create a local cluster (any free port)
initdb -D ~/msme-pg -U postgres --auth=trust && echo "port = 55433" >> ~/msme-pg/postgresql.conf
LC_ALL=en_US.UTF-8 pg_ctl -D ~/msme-pg -l ~/msme-pg/log start
# each run
PGHOST=127.0.0.1 PGPORT=55433 PGUSER=postgres npm run test:db
```

It acts as different users (owner A, employee, manager, owner B, outsider, platform admin, unverified, anon) and checks:
- Business B cannot read, insert, update, move rows or load the context of Business A, even with known IDs
- composite keys reject cross-tenant references (an expense in B with A's category, an order in B with A's customer)
- orders, sales and payments cannot be written directly; customers cannot be deleted
- employee and manager restrictions, permission grants, self-demotion and last-owner protection, deactivation
- invitations: hashed tokens, wrong-email and unverified acceptance refused, single use, seat limit
- support access: read-only and only for the granted business
- trial: expired = read-only, transaction cap enforced, usage counter accurate
- deleting a whole tenant cascades cleanly and leaves a platform audit record

## Manual acceptance (Phase 1)
1. Register → verification email → sign in → onboarding form → Overview shows "14 days left", 0/100, 1/3 users.
2. Try onboarding a second business with the same account: refused.
3. Narrow the browser to phone width: the sidebar becomes a menu button and drawer.

## Manual acceptance (Phase 2)
Use a **separate test account and business** (e.g. a `+test` Gmail alias) so a real trial isn't filled with
practice data; each order and sale counts toward the 100-transaction trial limit.
1. Customers: add one, search for it, edit it.
2. Orders: create an order with two lines for that customer, assign it, change status twice, add a note; the
   activity log shows each step with your name.
3. Sales: from the order, "Record sale" → items pre-filled → pay part now → detail shows Partially Paid and the
   balance. Record the rest → Paid. Refund a little → Partially Paid. Void the refund (owner/manager) → Paid.
4. Expenses: add one with a photo/PDF receipt, open the receipt, void another one with a reason.
5. Overview: switch Today / This week / This month / Custom; figures match what you entered; "Net cash movement"
   = collected − expenses.
6. Sign in as an employee (invite one): sales and expense figures are hidden; orders and customers work.

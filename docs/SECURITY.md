# Security model

- **Tenant isolation**: every operational row has `business_id`. RLS policies allow access only when
  `business_id` is in the set of businesses where the caller holds the required permission
  (`private.businesses_with(perm)`). Child rows use composite foreign keys `(business_id, parent_id)`, and
  `business_id` can't be changed after insert.
- **Writes**: simple records (customers, employees, catalogue, expenses, expense categories) are written directly
  under RLS with column-level grants. Multi-step and financial operations (orders, sales, payments, membership,
  invitations, onboarding) go only through `SECURITY DEFINER` functions that check permissions explicitly.
- **No deletes of financial data**: sales, payments and expenses are voided with a reason; changes are audited.
- **Platform admins** see business-level metadata and aggregates, not tenant records. Reading tenant data requires an
  owner-issued, time-limited (≤ 7 days), read-only support grant.
- **Secrets**: the browser holds only the publishable key. No service-role key is used.
- **Rate limits**: per-user fixed windows in `private.rate_limits` for business creation (5/h), invitations (20/h),
  invitation preview/accept and error reports. Supabase Auth applies its own limits to sign-up, sign-in and reset.

## Error codes raised by the database
| Code | Meaning |
|---|---|
| `TR001` | Trial expired: records are read-only |
| `TR002` | Trial order/sale limit reached |
| `TR003` | User limit reached (active members + pending invitations) |
| `TR004` | Business suspended |
| `TR005` | Account already used its one trial |
| `RL001` | Rate limit exceeded |
| `42501` | Permission denied |

## Data Privacy Act (RA 10173) readiness
Minimal personal data; consent at sign-up; draft privacy notice at `/privacy` (must be finalised by the operator);
private storage for receipts; audit trail; export path (Phase 3); data hosted in Singapore; no automatic deletion,
with a configurable retention setting (`platform_settings.retention_days_after_expiry`).

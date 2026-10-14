# Setup

## 1. Supabase (project already created)
Project: **MSME Business Platform**, ref `oufamslcxfqmtwyuxyzo`, region `ap-southeast-1`.
Migrations in `supabase/migrations/` are already applied. For a new environment, apply them in filename order
(Supabase SQL editor, or `supabase db push` with the CLI).

**Auth → URL Configuration** (Supabase dashboard). You need to do this; I can't change Auth settings from here:
- Site URL: your Netlify URL once it exists (until then `http://localhost:5173`)
- Redirect URLs: add `http://localhost:5173/**` and `https://<your-netlify-site>/**`

**Auth → Providers → Email**: keep "Confirm email" **on** (the app and database both require verified emails).

> The built-in Supabase email sender only delivers to your project's team members and is heavily rate-limited.
> That's fine for testing with your own address. Before inviting real trial users, set up custom SMTP
> (Auth → SMTP Settings); Resend or Brevo have free tiers.

**Auth → Providers → Anonymous sign-ins**: turn **on** for the demo sandbox (`/demo`). Strongly recommended
with it: **Auth → Attack Protection → CAPTCHA** (hCaptcha or Turnstile, both free) so bots can't create demos in bulk.
Demos are also rate-limited in the database (3 per visitor per hour, 200 per hour overall) and deleted after 48 hours.

## 2. First sign-up and platform admin
1. `npm run dev`, open http://localhost:5173/register, and register with your own email.
2. Click the verification link, sign in, then complete onboarding.
3. To make yourself platform administrator, run this in the SQL editor (replace the email):
   ```sql
   insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';
   ```

## 3. Environment variables
| Variable | Where | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` locally, Netlify env vars | `https://oufamslcxfqmtwyuxyzo.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | same | the **publishable** key (`sb_publishable_…`) from Project Settings → API |

The service-role key is **not** used anywhere and must never be added with a `VITE_` prefix.

## 4. Netlify
1. Push the repo to GitHub (create an empty repo first).
2. Netlify → Add new site → Import from GitHub. Build settings come from `netlify.toml`.
3. Add the two `VITE_` variables above, then deploy.
4. Put the Netlify URL into Supabase Site URL / Redirect URLs (step 1).

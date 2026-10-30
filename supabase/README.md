<!-- Purpose: How to set up and look after the Supabase backend for saved presets (issue #61).
     Consumers: the project owner (Maxwell) and contributors changing the database.
     Dependencies: migrations/*.sql, apply-migrations.mjs, .github/workflows/supabase-migrations.yml,
     the SUPABASE_ACCESS_TOKEN repository secret, and Supabase project uluovxbitpyaijrzwzyp. -->

# Supabase

The shared **presets** feature ([`apps/shared/`](../apps/shared/README.md)) stores saved app parameters in one Supabase table. Anyone can read presets. Saving works without an account: the first save signs the visitor in anonymously, and they can delete their own presets later from the same browser.

The client holds only the public project URL and the **publishable** key. Row-level security decides what that key can do. Never put a secret or service-role key in the repo or the client.

## Setup is automatic

Nobody pastes SQL into the dashboard. Database changes live in [`migrations/`](migrations/) as timestamped `.sql` files. When a change to `supabase/migrations/**` reaches `main`, the [Supabase migrations workflow](../.github/workflows/supabase-migrations.yml) runs [`apply-migrations.mjs`](apply-migrations.mjs). That script uses the Supabase Management API, so no database password is needed:

- It lists the migration files in filename order.
- It skips any version already recorded in `supabase_migrations.schema_migrations`, the history table the Supabase CLI uses, so `supabase migration list` agrees.
- It runs each remaining file and records it in one transaction. A failed file changes nothing and stops the run.

You can also start the workflow by hand from the Actions tab (**Run workflow**). Re-running it is harmless. It does not touch the Deploy workflow, GitHub Pages, or pull request previews, and pull requests do not run it. So a migration takes effect only after its PR merges.

To add a database change, create `migrations/<YYYYMMDDHHMMSS>_<name>.sql` (or run `supabase migration new <name>`). Write it so it is safe to run twice. Never edit a migration that has already run; add a new one instead.

### The access token secret

The workflow needs the repository secret **`SUPABASE_ACCESS_TOKEN`**: a Supabase personal access token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens). Add it under **Settings > Secrets and variables > Actions > New repository secret** ([direct link](https://github.com/mlichtenstein/copilot_pwa_experiment/settings/secrets/actions)). Without it, the workflow fails with a message that says so. The token can manage the whole Supabase account, so keep it only in that secret, never in the repo or the client.

To run the script locally: `SUPABASE_ACCESS_TOKEN=... node supabase/apply-migrations.mjs --dry-run` (drop `--dry-run` to apply).

### Current state

`20261030090000_presets.sql` has been applied and recorded on Oct 30, 2026. Anonymous sign-ins are on: this is an auth setting, not SQL, so it was switched on once through the Management API (`external_anonymous_users_enabled`). It is the dashboard's **Authentication > Sign In / Providers > Allow anonymous sign-ins** toggle. Keep **Allow new users to sign up** on as well, because an anonymous sign-in counts as a sign-up. If anonymous sign-ins are turned off, the list still loads, but saving reports that anonymous sign-ins are off.

## What the migration sets up

- Table `public.presets`: `id`, `app` (for example `cloud-simulator/convection`), `name` (1-80 characters), `note` (up to 500), `params` (a JSON object including the seed, at most 8 KB), `commit_sha`, `created_at`, and `created_by` (defaults to `auth.uid()`).
- Row-level security: everyone can select. Signed-in users, including anonymous ones, can insert rows only as themselves, and can update or delete only their own rows.
- Abuse limit: a trigger rejects more than 20 saves per user per rolling hour. Supabase also limits anonymous sign-ins to 30 per hour per IP address by default (**Authentication > Rate Limits**).

## Moderation

Use **Table Editor > presets** in the dashboard. It bypasses row-level security, so you can edit or delete any row there. To browse without the dashboard:

```sh
curl "https://uluovxbitpyaijrzwzyp.supabase.co/rest/v1/presets?select=name,note,app,created_at&order=created_at.desc" \
  -H "apikey: sb_publishable_yAkIT03wv4PQHR9_vlDrog_0RmDEH64"
```

To clean up old anonymous users (their presets go with them), run in the SQL Editor:

```sql
delete from auth.users where is_anonymous is true and created_at < now() - interval '30 days';
```

## Optional follow-up: CAPTCHA

Supabase recommends CAPTCHA (Cloudflare Turnstile or hCaptcha) for anonymous sign-ins to slow down bots: **Authentication > Attack Protection**. Do not turn it on yet. The client does not send a CAPTCHA token, so every anonymous sign-in would fail. Adding the Turnstile widget to the panel and sending its token on sign-up is a follow-up.

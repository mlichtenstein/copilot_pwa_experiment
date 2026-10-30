<!-- Purpose: How to set up and look after the Supabase backend for the emoji rating bar's saved settings (issue #61).
     Consumers: the project owner (Maxwell) and contributors changing the database.
     Dependencies: migrations/*.sql, apply-migrations.mjs, .github/workflows/supabase-migrations.yml,
     the SUPABASE_ACCESS_TOKEN repository secret, and Supabase project uluovxbitpyaijrzwzyp. -->

# Supabase

The shared **rating bar** ([`apps/shared/`](../apps/shared/README.md)) stores each emoji tap, with the app's settings and a thumbnail, in one Supabase table, `cloud_simulator_presets`. Anyone can read the ratings. Rating works without an account: the first tap signs the visitor in anonymously.

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

Both migrations have been applied and recorded, on Oct 30, 2026:

1. `20261030090000_presets.sql` created the first `presets` table.
2. `20261030120000_cloud_simulator_presets.sql` renamed it to `cloud_simulator_presets` and turned it into the rating table described below. It was applied from the PR branch before merge, so the workflow will skip it on merge as already recorded.

Anonymous sign-ins are on. This is an auth setting, not SQL, so it was switched on once through the Management API (`external_anonymous_users_enabled`). In the dashboard it is the **Authentication > Sign In / Providers > Allow anonymous sign-ins** toggle. Keep **Allow new users to sign up** on as well, because an anonymous sign-in counts as a sign-up. If anonymous sign-ins are turned off, the Recent list still loads, but tapping an emoji reports that anonymous sign-ins are off.

## The table

`public.cloud_simulator_presets`, one row per emoji tap:

| Column | What it holds |
| --- | --- |
| `id` | uuid |
| `app_id` | the page, for example `cloud-simulator/convection`, `cloud-simulator/rain`, `cloud-simulator/sunset` or `cloud-simulator/horizon` (1-80 characters) |
| `display_name` | the name the visitor typed (1-80 characters) |
| `rating` | `love` ❤️, `beautiful` 🎨, `gross` 🤮 or `boring` ⬜ |
| `params` | a JSON object with every setting, including the seed, view and resolution (at most 8 KB) |
| `thumbnail` | a `data:image/png`, `webp` or `jpeg` base64 data URL of the canvas, about 128×96, at most 51,200 characters (50 KB); null if none |
| `created_at`, `created_by` | when, and the (anonymous) user, which defaults to `auth.uid()` |
| `note`, `commit_sha` | kept from the first version, unused by the bar, nullable |

- **Ratings:** the rating check is `NOT VALID`, so it applies to every new row but leaves the one row saved before ratings existed (rating null) in place. Delete that row and run `alter table public.cloud_simulator_presets validate constraint cloud_simulator_presets_rating_check;` to make it strict for old rows too.
- **Row-level security:** everyone can select. Signed-in users, including anonymous ones, can insert rows only as themselves and delete only their own rows. Nobody can update a row through the API; a tap is a fact. The bar has no undo, but the delete-own-rows policy stays so a visitor's own client could remove a tap later.
- **Abuse limit:** a trigger rejects more than 120 taps per user per rolling hour. Supabase also limits anonymous sign-ins to 30 per hour per IP address by default (**Authentication > Rate Limits**).

## Moderation

Use **Table Editor > cloud_simulator_presets** in the dashboard. It bypasses row-level security, so you can edit or delete any row there. To browse without the dashboard:

```sh
curl "https://uluovxbitpyaijrzwzyp.supabase.co/rest/v1/cloud_simulator_presets?select=display_name,rating,app_id,created_at&order=created_at.desc" \
  -H "apikey: sb_publishable_yAkIT03wv4PQHR9_vlDrog_0RmDEH64"
```

To count ratings per page: `...?select=app_id,rating&app_id=eq.cloud-simulator/sunset`, then tally them, or run `select app_id, rating, count(*) from cloud_simulator_presets group by 1, 2;` in the SQL Editor.

To clean up old anonymous users (their ratings go with them), run in the SQL Editor:

```sql
delete from auth.users where is_anonymous is true and created_at < now() - interval '30 days';
```

## Optional follow-up: CAPTCHA

Supabase recommends CAPTCHA (Cloudflare Turnstile or hCaptcha) for anonymous sign-ins to slow down bots: **Authentication > Attack Protection**. Do not turn it on yet. The client does not send a CAPTCHA token, so every anonymous sign-in would fail. Adding the Turnstile widget to the bar and sending its token on sign-up is a follow-up.

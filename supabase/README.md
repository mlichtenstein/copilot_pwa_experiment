<!-- Purpose: How to set up and look after the Supabase backend for saved presets (issue #61).
     Consumers: the project owner (Maxwell) and contributors changing the database.
     Dependencies: migrations/*_presets.sql; the Supabase dashboard for project uluovxbitpyaijrzwzyp. -->

# Supabase

The shared **presets** feature ([`apps/shared/`](../apps/shared/README.md)) stores saved app parameters in one Supabase table. Anyone can read presets. Saving works without an account: the first save signs the visitor in anonymously, and they can delete their own presets later from the same browser.

The client holds only the public project URL and the **publishable** key. Row-level security decides what that key can do. Never put a secret or service-role key in the repo or the client.

## One-time setup (project owner)

1. **Create the table.** In the dashboard, open **SQL Editor**, paste all of [`migrations/20261030090000_presets.sql`](migrations/20261030090000_presets.sql), and click **Run**. (With the Supabase CLI linked to the project, `supabase db push` does the same.)
2. **Turn on anonymous saves.** Open **Authentication > Sign In / Providers** and switch on **Allow anonymous sign-ins**, then **Save**. Leave **Allow new users to sign up** on, because an anonymous sign-in counts as a sign-up.

Until step 1 is done, the Presets panel says the table is missing. Until step 2 is done, the list loads but saving reports that anonymous sign-ins are off. Copy link (parameters in the URL) works either way, including offline.

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

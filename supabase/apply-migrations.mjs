/*
 * Purpose: Apply supabase/migrations/*.sql files that the project hasn't run yet, in filename
 *   order, through the Supabase Management API (no database password needed). Each file runs
 *   in one transaction together with its row in supabase_migrations.schema_migrations, the
 *   same history table the Supabase CLI uses, so `supabase migration list` and `db push` agree.
 * Consumers: .github/workflows/supabase-migrations.yml on pushes to main; maintainers locally:
 *   `SUPABASE_ACCESS_TOKEN=... node supabase/apply-migrations.mjs [--dry-run]`.
 * Dependencies: Node 20+ (fetch); env SUPABASE_ACCESS_TOKEN (a personal access token; never
 *   printed) and optional SUPABASE_PROJECT_REF; POST /v1/projects/{ref}/database/query.
 */
import { readdir, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ref = process.env.SUPABASE_PROJECT_REF || "uluovxbitpyaijrzwzyp";
const token = process.env.SUPABASE_ACCESS_TOKEN;
const dryRun = process.argv.includes("--dry-run");
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Query failed (HTTP ${response.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

// Quote text as a dollar-quoted literal with a tag that can't occur inside it.
function literal(text) {
  let tag;
  do tag = `$m${randomBytes(6).toString("hex")}$`; while (text.includes(tag));
  return tag + text + tag;
}

if (!token) { console.error("SUPABASE_ACCESS_TOKEN is not set."); process.exit(1); }

const files = (await readdir(dir)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
await query(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;`);
const applied = new Set((await query("select version from supabase_migrations.schema_migrations")).map(row => row.version));
const pending = files.filter(name => !applied.has(name.split("_")[0]));
console.log(`${files.length} migration file(s), ${files.length - pending.length} already applied, ${pending.length} pending.`);

for (const name of pending) {
  const version = name.split("_")[0];
  const label = name.slice(version.length + 1, -4);
  if (dryRun) { console.log(`Would apply ${name}`); continue; }
  const sql = await readFile(path.join(dir, name), "utf8");
  await query(`begin;
${sql}
;
insert into supabase_migrations.schema_migrations (version, name, statements)
  values (${literal(version)}, ${literal(label)}, array[${literal(sql)}]);
commit;`);
  console.log(`Applied ${name}`);
}

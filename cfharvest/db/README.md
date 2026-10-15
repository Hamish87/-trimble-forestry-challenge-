# CFHarvest replica · database (Supabase / Postgres)

The replica runs without a database: by default the plan lives in the browser session (sessionStorage) and travels to the game and back inside the handoff envelopes. This folder adds an optional Postgres backend, schema `cfharvest`, that the replica reads and writes through Supabase's REST API (PostgREST). The data model is described in [`SCHEMA.md`](SCHEMA.md).

| File | What it does |
|---|---|
| `schema.sql` | Schema `cfharvest`: tables, enums, views, triggers. Idempotent. |
| `seed.sql` | Demo tenant "Demo-Lohnunternehmen" with the game's stands, machines and master data. Idempotent. |
| `grants.sql` | API grants for `anon` / `authenticated`. **Demo only** (see Security). |
| `apply.sh` | `apply.sh <DATABASE_URL> [--grants]`: runs the files above with `psql`, then prints the dashboard steps. |

## 1. Create the database

### Option A — a new Supabase project (recommended)

1. In the Supabase dashboard, create a project, e.g. `cfharvest-replica`, on the free tier. Pick the region closest to the booth (Frankfurt `eu-central-1` for INTERFORST) and keep the database password.
2. Copy the connection string: **Project Settings → Database → Connection string**. Use the *Session pooler* URI (IPv4-friendly) or *Direct connection*, with the password filled in.
3. Apply schema, seed and grants:
   ```bash
   cfharvest/db/apply.sh "postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" --grants
   ```
   Without `psql`, paste `schema.sql`, `seed.sql` and `grants.sql` into the **SQL Editor**, one after the other, and run each one.
4. Expose the schema to the API: **Project Settings → Data API → Exposed schemas**, add `cfharvest`, Save. Without this step, PostgREST answers `406 / PGRST106 "The schema must be one of the following"`, and the replica falls back to its local session.

### Option B — an existing Supabase project (isolated schema)

Everything lives in its own schema `cfharvest`. `schema.sql` creates no extensions, touches nothing in `public` or `auth`, and never drops anything, so it can share a project with other work.

1. Apply in the same way as option A, with that project's connection string. Leave out `--grants` if the project already has data you do not want exposed: then run only the parts of `grants.sql` you accept.
2. Add `cfharvest` to **Exposed schemas**. Keep the schemas already listed there.
3. Remove everything again with `DROP SCHEMA cfharvest CASCADE;`. Only that schema is affected.

To reset the demo tenant without dropping the schema: `DELETE FROM cfharvest.company WHERE id = md5('cfh-demo:company')::uuid;`, then run `seed.sql` again.

## 2. Point the replica at it

Fill in [`cfharvest/app/config.js`](../app/config.js):

```js
const CFH_CONFIG={
  supabaseUrl:'https://<project-ref>.supabase.co',   // Project Settings → API → Project URL
  publishableKey:'sb_publishable_…',                 // Project Settings → API Keys → publishable (or the legacy anon key)
  schema:'cfharvest',
  tenantId:''                                        // empty = the seed's demo tenant
};
```

Use only the **publishable** (anon) key. The service-role or secret key bypasses every permission, and this file is served to every visitor. It must never appear in the repository or on Vercel.

## 3. Switch the store

| How | Effect |
|---|---|
| nothing | local session store (default; this is what the Vercel deployment uses as long as `config.js` is empty) |
| `…/cfharvest/app/?store=supabase` | Supabase for this page load |
| `localStorage.setItem('cfharvest-store','supabase')` in the browser console | Supabase on every load in this browser (`removeItem` to undo) |
| `?store=local` | forces the local store, even with the localStorage switch |

What happens with Supabase:

- On opening, the replica reads the plan from the database once. It uses the database plan only when the session has no plan of its own. A plan that came back from the game wins and is written to the database.
- Every saved change is written 300 ms after the last edit, one batched upsert per changed table. The session copy is still written at once, so the game handoff keeps working.
- If `config.js` is empty, the database cannot be reached, the tenant is missing (`seed.sql` not run), or any request fails, the replica switches to the local session for the rest of the visit. It then shows **"Datenbank nicht erreichbar – lokale Sitzung"** in the banner, and the browser console gives the reason.
- Production reported by the game (HPR / FPR) is written to `production_message` / `production_line` for the follow-up views, and is never read back. Reported volumes stay game-owned.

`SCHEMA.md §6.3` lists exactly which plan parts are stored in which tables.

## 4. Security caveat (demo only)

- **Row-level security is off**, and `grants.sql` gives `anon` and `authenticated` read, insert, update, and delete rights (delete only on the tables the replica mirrors) on schema `cfharvest`. Anyone with the publishable key, which is public by design, can therefore read and change every row of every tenant. Use fake demo data only: no real customers, people, or contracts.
- Before real use: enable RLS on every `cfharvest` table with the tenant policy in the header of `schema.sql`, issue `tenant_id` in the JWT `app_metadata` through Supabase Auth, revoke the `anon` grants, and add role-based policies (Administratör / Planerare / Mobil-Maskin).
- The store uses last-writer-wins. Two planners working on the same tenant at once overwrite each other's batches.
- Delete the project, or `DROP SCHEMA cfharvest CASCADE`, when the fair is over.

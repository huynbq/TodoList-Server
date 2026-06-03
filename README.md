# TodoList NestJS Server

Production-oriented NestJS backend for the React TodoList app. It uses Supabase Postgres through Prisma and keeps all database access behind the NestJS API.

## Features

- Compatible routes for the current React frontend: `/api/todos`, `/api/todos/:id`, toggle status, update order, and delete.
- Supabase Postgres + Prisma schema with indexes for status filtering, ordered pagination, and trigram text search.
- Offset pagination for frontend compatibility and `nextCursor` for high-scale cursor pagination.
- Global DTO validation, CORS, rate limiting, and `/api/health` for Render health checks.
- Render deployment config in `render.yaml`.

## Local Setup

```bash
npm install
copy .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

Optional seed:

```bash
set SEED_TODOS=100000
npm run seed
```

Use a smaller seed locally first, then test 1M rows against Supabase when the schema and indexes are confirmed.

## Supabase Setup

This backend is linked to Supabase project:

```text
Project ref: jhcleokmfkexdoyviyyx
Project URL: https://jhcleokmfkexdoyviyyx.supabase.co
```

The initial `todos` schema has already been applied through Supabase MCP. The table is `public.todos`, with RLS enabled and indexes for status filtering, ordered pagination, and title/description trigram search.

Supabase advisors currently report `RLS Enabled No Policy` for `public.todos`. That is intentional for this architecture: React talks to NestJS, and NestJS talks to Postgres. With no RLS policies, accidental frontend Data API access returns no rows.

Set `DATABASE_URL` and `DIRECT_URL` from Supabase Dashboard > Connect. The database password is not exposed through MCP, so fill that value from your dashboard.

For Render, a practical starting point is the Supavisor session pooler string:

```text
DATABASE_URL="postgres://postgres.jhcleokmfkexdoyviyyx:YOUR_DATABASE_PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgres://postgres.jhcleokmfkexdoyviyyx:YOUR_DATABASE_PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres"
```

Replace `aws-0-region.pooler.supabase.com` with the exact host shown in your Supabase dashboard.

If your database password contains special URL characters, encode them in `DATABASE_URL` and `DIRECT_URL`. For example, `@` inside the password must become `%40`.

Optional hardening: create a dedicated Prisma database user in Supabase SQL Editor instead of using the default `postgres` connection user:

```sql
create user "prisma" with password 'custom_password' bypassrls createdb;
grant "prisma" to "postgres";
grant usage on schema public to prisma;
grant create on schema public to prisma;
grant all on all tables in schema public to prisma;
grant all on all routines in schema public to prisma;
grant all on all sequences in schema public to prisma;
alter default privileges for role postgres in schema public grant all on tables to prisma;
alter default privileges for role postgres in schema public grant all on routines to prisma;
alter default privileges for role postgres in schema public grant all on sequences to prisma;
```

Recommended connection strings:

- `DATABASE_URL`: Supavisor session pooler on port `5432` for Render web service, or transaction pooler on `6543` with `?pgbouncer=true` if you scale horizontally.
- `DIRECT_URL`: direct connection or Supavisor session pooler for migrations.

Because the React app should go through NestJS, do not expose Supabase service role keys to the frontend.

## API

```text
GET    /api/todos?limit=50&offset=0&status=all&search=
GET    /api/todos?limit=50&cursor=<nextCursor>
POST   /api/todos
PUT    /api/todos/:id
PATCH  /api/todos/:id/toggle-status
PATCH  /api/todos/:id/order
PATCH  /api/todos/:id/reorder
DELETE /api/todos/:id
GET    /api/health
```

Reorder payload:

```json
{
  "previousId": "todo-before-id-or-null",
  "nextId": "todo-after-id-or-null"
}
```

Ordering uses spaced values: `1000, 2000, 3000...`. Moving between two todos assigns the average order. Moving to the top uses `firstOrder / 2`; moving to the bottom uses `lastOrder + 1000`. If the gap becomes too small, the backend reindexes orders in one SQL update.

List response includes:

```json
{
  "data": [],
  "total": 0,
  "offset": 0,
  "limit": 50,
  "nextOffset": null,
  "nextCursor": null,
  "hasMore": false
}
```

## Render

Set these environment variables in Render:

```text
NODE_ENV=production
DATABASE_URL=...
DIRECT_URL=...
FRONTEND_ORIGIN=https://your-react-app.example.com
```

Build command:

```bash
npm ci && npx prisma generate && npm run build
```

Start command:

```bash
npm run start:prod
```

The initial schema was applied through Supabase MCP, so do not run `npx prisma migrate deploy` against this project until Prisma migration history is resolved or a new migration workflow is chosen.

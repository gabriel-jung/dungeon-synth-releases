-- Migration: switch site from service-role key to publishable (anon) key.
--
-- APPLIED in production. Kept as the source-of-truth record of the policies
-- enabled on the live database; replay only when bootstrapping a fresh
-- Supabase project.
--
-- Background: the site is read-only and public. Pre-migration, lib/supabase.ts
-- used the service-role key, which bypasses RLS — a future bug that let user
-- input flow into a dynamic from() call could have leaked/written any table.
-- Defense in depth: enable RLS on every read table and grant anon SELECT-only.
--
-- Steps (for a fresh project):
--   1. Apply this SQL via the Supabase SQL editor.
--   2. Set SUPABASE_PUBLISHABLE_KEY in Vercel env (and .env.local) to the
--      project's publishable / anon key (Supabase dashboard → API).
--   3. Deploy. The site automatically prefers the publishable key
--      (lib/supabase.ts).
--   4. Once verified, delete SUPABASE_SECRET_KEY from Vercel env.
--
-- This migration is forward-compatible: enabling RLS does not affect
-- service-role connections, so step 1 alone breaks nothing.


-- ---------------------------------------------------------------------------
-- Enable RLS on all read tables.
-- ---------------------------------------------------------------------------
alter table albums      enable row level security;
alter table hosts       enable row level security;
alter table tags        enable row level security;
alter table album_tags  enable row level security;


-- ---------------------------------------------------------------------------
-- Grant SELECT to anon. The site only reads; no INSERT / UPDATE / DELETE
-- policies are created, so anon cannot mutate anything.
-- ---------------------------------------------------------------------------
create policy "anon can read albums"
  on albums for select
  to anon
  using (true);

create policy "anon can read hosts"
  on hosts for select
  to anon
  using (true);

create policy "anon can read tags"
  on tags for select
  to anon
  using (true);

create policy "anon can read album_tags"
  on album_tags for select
  to anon
  using (true);


-- ---------------------------------------------------------------------------
-- RPCs in docs/rpc.sql are language sql stable and execute with the caller's
-- privileges, which means they pick up the SELECT policies above. No further
-- grants needed.
--
-- (If a future RPC needs to read tables anon shouldn't see directly, mark
-- it `security definer` and `set search_path = public` so it runs with the
-- function owner's permissions.)
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Verify.
-- ---------------------------------------------------------------------------
-- Run as anon (e.g., from the Supabase SQL editor with role anon, or via
-- a publishable-key client) — every query should still return data:
--
--   select count(*) from albums;
--   select count(*) from hosts;
--   select * from tag_counts('genre', 50);
--
-- Confirm RLS is enforced — direct writes should be rejected:
--   insert into albums (artist, title) values ('x', 'y');
--   -- expected: ERROR: new row violates row-level security policy

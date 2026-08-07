-- Re-tenant 'the-taste' -> 'trending-juice'.
--
-- The rebrand commit (d659e60) edited the `store_id` defaults inside migrations
-- that had already been applied. Editing an applied migration changes nothing on
-- a database that already ran it: `create table if not exists` is a no-op the
-- second time, so the live column defaults, the seeded rows and the storage
-- policies all stayed on 'the-taste' while the entire client moved to
-- 'trending-juice'. The client then queries a tenant that has no rows — staff
-- cannot sign in, and orders, menu, offers and telemetry all read empty.
--
-- This migration is the forward fix. It is deliberately idempotent and safe to
-- run against a database in any of three states:
--
--   * never provisioned      — the UPDATEs match nothing, the ALTERs re-assert
--                              defaults the create-table already set,
--   * provisioned on the old key — rows move across and defaults are corrected,
--   * already re-tenanted    — every statement is a no-op.
--
-- It runs as one transaction, so a failure part-way leaves the tenant key
-- consistent rather than half-migrated.

begin;

-- 1. Column defaults ---------------------------------------------------------
-- `set default` is unconditional, but `alter table` on a missing table aborts
-- the transaction, so each is guarded on the table existing. A store that never
-- ran the customer-platform migration should still get the core tables fixed.

do $$
declare
  t text;
  tables constant text[] := array[
    'activity_log',
    'audit_events',
    'customer_favorites',
    'customer_notification_preferences',
    'customer_offers',
    'customer_reviews',
    'customer_saved_addresses',
    'customers',
    'document_embeddings',
    'inventory',
    'menu_categories',
    'menu_items',
    'orders',
    'public_order_rate_limits',
    'recipes',
    'reservations',
    'shifts',
    'staff',
    'staff_memberships',
    'staff_pin_rate_limits',
    'store_security_settings',
    'suppliers',
    'tables'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;
    end if;

    -- Only touch tables that actually carry the column. public_order_rate_limits
    -- and staff_pin_rate_limits declare store_id with no default; giving them one
    -- is harmless and keeps the tenant key uniform.
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'store_id'
    ) then
      continue;
    end if;

    execute format('alter table public.%I alter column store_id set default %L', t, 'trending-juice');
    execute format('update public.%I set store_id = %L where store_id = %L', t, 'trending-juice', 'the-taste');
  end loop;
end
$$;

-- 2. Storage policy ----------------------------------------------------------
-- 20260716154206_launch_security_hardening.sql:593 pins the tenant key as a
-- literal inside the menu-image storage policy rather than reading the row's
-- store_id, so an applied database still authorises against 'the-taste' and
-- every menu-image upload fails. `create policy` has no `if not exists`, so the
-- policy is dropped and recreated. The `name like 'items/%'` path constraint is
-- carried over verbatim — it is the other half of the rule and must not be lost.

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  drop policy if exists "Managers manage menu images" on storage.objects;

  create policy "Managers manage menu images" on storage.objects
    for all to authenticated
    using (
      bucket_id = 'menu-images'
      and name like 'items/%'
      and public.has_staff_role('trending-juice', array['developer','owner','manager'])
    )
    with check (
      bucket_id = 'menu-images'
      and name like 'items/%'
      and public.has_staff_role('trending-juice', array['developer','owner','manager'])
    );
end
$$;

commit;

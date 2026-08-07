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
-- No explicit BEGIN/COMMIT, matching every other migration here: the Supabase
-- CLI already applies each file in its own transaction, so a failure part-way
-- rolls the whole thing back and leaves the tenant key consistent rather than
-- half-migrated. An explicit COMMIT would end that outer transaction early.

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

-- 3. Customer offers ---------------------------------------------------------
-- Two problems with the rows seeded by 202606290001, both of which reach the
-- customer:
--
--   * The codes were 'BOOST' and 'FUSION', but the client's FALLBACK_OFFERS
--     (src/services/customerPlatform.ts) advertises 'POWERBOOST' and
--     'FRUITFUSION'. fetchCustomerOffers falls back whenever the device is
--     offline or the query returns nothing, so which code a customer sees is
--     down to connectivity — and half the time staff cannot find it.
--
--   * display_value carried a hard rupee amount ('Save ₹30'). That field is the
--     prominent number on the offer card, and customerPlatform.ts:27-31 pins the
--     rule: the board price belongs in the description, because the server owns
--     eligibility and final price at checkout. A number there reads as a
--     guarantee the server has not made.
--
-- The seed is realigned with FALLBACK_OFFERS so both sources say the same thing.

do $$
begin
  if to_regclass('public.customer_offers') is null then
    return;
  end if;

  delete from public.customer_offers
  where store_id = 'trending-juice' and code in ('BOOST', 'FUSION');

  insert into public.customer_offers (store_id, code, title, label, description, display_value, icon, sort_order)
  values
    ('trending-juice', 'POWERBOOST', 'Power Boost', 'Combo favourite', 'Any juice plus any shake — ₹120 on the board.', 'Server validates at checkout', 'bolt', 10),
    ('trending-juice', 'FRUITFUSION', 'Fruit Fusion', 'Juice and a bite', 'Any juice with a fruit chaat on the side — ₹100 on the board.', 'Server validates at checkout', 'local_offer', 20),
    ('trending-juice', 'COOLDUO', 'Cool Duo', 'For two', 'Any shake plus a cold coffee — ₹110 on the board.', 'Server validates at checkout', 'groups', 30),
    ('trending-juice', 'REWARDS', 'Points on every order', 'Sip Club', 'Sign in before checkout and grow your rewards balance with every order.', 'Members', 'workspace_premium', 40)
  on conflict (store_id, code) do update
  set title = excluded.title,
      label = excluded.label,
      description = excluded.description,
      display_value = excluded.display_value,
      icon = excluded.icon,
      sort_order = excluded.sort_order;
end
$$;

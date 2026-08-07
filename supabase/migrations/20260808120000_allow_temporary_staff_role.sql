-- Allow the 'temporary_staff' role to exist in the database.
--
-- The application has treated temporary_staff as a first-class role for a long
-- time: it is in STAFF_ROLES in src/services/authGuards.ts, main.ts routes to
-- it, Sidebar.tsx narrows the navigation for it, cloudDb.ts trims the pull for
-- it, and StaffView.tsx offers it in the Add Staff role picker. The two check
-- constraints written in the initial schema were never extended to match, so
-- the role could be chosen in the UI but never saved: the staff-admin edge
-- function's insert failed the constraint and the account was never created.
--
-- This only widens the set of accepted values; no existing row changes.
--
-- The second half of this migration gives the role the RLS grants it needs to
-- be useful. Creating the account is only half the job: temporary_staff was
-- absent from every has_staff_role allowlist, so the account could be made and
-- signed into ("staff memberships self read" is role-agnostic) and then landed
-- on an empty app with no menu and no orders.
--
-- The grant is scoped to the Express Panel, which is the only place the client
-- ever sends this role: main.ts routes it straight to #/pos-kitchen, Sidebar.tsx
-- shows it only that route plus the Help Center, and cloudDb.ts pulls it only
-- active orders and skips inventory outright. So it gets menu reads, the order
-- lifecycle, tables, customers, and the two append-only log tables — the union
-- of what cashier and kitchen need to work a counter — and nothing else.
--
-- Deliberately still denied: inventory, suppliers, recipes, reservations, menu
-- writes, the staff roster, and reading activity_log or audit_events. Cancelling
-- an order is denied too, by the existing role check inside
-- enforce_order_status_transition(); this role can advance an order but not void
-- one.

alter table public.staff
  drop constraint if exists staff_role_check;
alter table public.staff
  add constraint staff_role_check
  check (role in (
    'developer', 'owner', 'manager', 'cashier',
    'kitchen', 'waiter', 'delivery', 'temporary_staff'
  ));

alter table public.staff_memberships
  drop constraint if exists staff_memberships_role_check;
alter table public.staff_memberships
  add constraint staff_memberships_role_check
  check (role in (
    'developer', 'owner', 'manager', 'cashier',
    'kitchen', 'waiter', 'delivery', 'temporary_staff'
  ));

-- Menu: read only. Writing the menu stays with managers and above.
drop policy if exists "staff read menu_categories" on public.menu_categories;
create policy "staff read menu_categories" on public.menu_categories
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

drop policy if exists "staff read menu_items" on public.menu_items;
create policy "staff read menu_items" on public.menu_items
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

-- Orders: take them and move them along. Cancellation is blocked separately by
-- enforce_order_status_transition(), which admits only developer/owner/manager.
drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

drop policy if exists "staff insert orders" on public.orders;
create policy "staff insert orders" on public.orders
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff']));

drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders" on public.orders
  for update to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

-- Tables: seating and clearing. Reads were already public.
drop policy if exists "staff write tables" on public.tables;
create policy "staff write tables" on public.tables
  for all to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff']));

-- Customers: attaching a walk-in to a counter order.
drop policy if exists "staff read customers" on public.customers;
create policy "staff read customers" on public.customers
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','delivery','temporary_staff']));

drop policy if exists "staff write customers" on public.customers;
create policy "staff write customers" on public.customers
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff']));

drop policy if exists "staff update customers" on public.customers;
create policy "staff update customers" on public.customers
  for update to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff']));

-- Logs stay append-only for this role: it can write its trail but not read the
-- store's. The matching read policies are left untouched on purpose.
drop policy if exists "staff insert activity_log" on public.activity_log;
create policy "staff insert activity_log" on public.activity_log
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

drop policy if exists "staff insert audit_events" on public.audit_events;
create policy "staff insert audit_events" on public.audit_events
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

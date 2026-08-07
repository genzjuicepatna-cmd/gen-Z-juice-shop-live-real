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
-- Note that temporary_staff is deliberately absent from the has_staff_role
-- allowlists in the RLS policies. That is the intended restriction — a
-- temporary staff member reads their own membership (the "staff memberships
-- self read" policy is role-agnostic, so sign-in works) and the public menu,
-- and nothing else. Granting them wider access is a product decision, not part
-- of making account creation work.

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

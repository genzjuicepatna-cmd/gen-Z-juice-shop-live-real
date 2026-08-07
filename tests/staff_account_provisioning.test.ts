// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { STAFF_ROLES } from '../src/services/authGuards';

const read = (path: string) => readFileSync(path, 'utf8');

const edgeFunction = read('supabase/functions/staff-admin/index.ts');
const staffAdmin = read('src/services/staffAdmin.ts');
const staffView = read('src/views/staff/StaffView.tsx');
const initialSchema = read('supabase/migrations/20260628000000_initial_schema.sql');
const roleMigration = read('supabase/migrations/20260808120000_allow_temporary_staff_role.sql');

test('auth user lookup never relies on the dropped listUsers filter option', () => {
  // auth-js only serializes page/per_page, so `listUsers({ filter })` silently
  // degrades to "the N most recently created users in the project" and the
  // staff being looked up is essentially never among them. Matched on the call
  // form so the comment warning against it does not trip this.
  assert.doesNotMatch(edgeFunction, /await serviceClient\.auth\.admin\.listUsers\(/);
  assert.match(edgeFunction, /findAuthUserByEmail/);

  // The replacement must hit GoTrue directly, where `filter` is honoured.
  assert.match(edgeFunction, /\/auth\/v1\/admin\/users/);
  assert.match(edgeFunction, /searchParams\.set\("filter", target\)/);
});

test('a substring filter match is still narrowed to an exact address', () => {
  // GoTrue filters with email LIKE '%filter%', so "a@b.com" also returns
  // "xa@b.com". Linking the wrong account would hand a stranger the store.
  assert.match(
    edgeFunction,
    /String\(user\?\.email \|\| ""\)\.toLowerCase\(\) === target/
  );
});

test('both lookup call sites go through the shared helper', () => {
  const inviteAction = edgeFunction.slice(edgeFunction.indexOf('action === "invite-staff"'));
  const lookupAction = edgeFunction.slice(edgeFunction.indexOf('action === "lookup-auth-user"'));

  assert.match(inviteAction, /findAuthUserByEmail\(supabaseUrl, serviceRoleKey, email\)/);
  assert.match(lookupAction, /findAuthUserByEmail\(supabaseUrl, serviceRoleKey, email\)/);
});

test('every client-side staff role is accepted by the server and the database', () => {
  for (const role of STAFF_ROLES) {
    assert.match(
      edgeFunction,
      new RegExp(`"${role}"`),
      `staff-admin rejects the "${role}" role the client can assign`
    );
    assert.match(
      roleMigration,
      new RegExp(`'${role}'`),
      `the role check constraint rejects "${role}"`
    );
  }
});

test('the temporary_staff migration replaces the constraints that omitted it', () => {
  // Guard the premise: the initial schema really did leave the role out.
  assert.doesNotMatch(initialSchema, /temporary_staff/);
  assert.match(initialSchema, /role varchar\(30\) not null check \(role in \(/);

  assert.match(roleMigration, /alter table public\.staff\b[\s\S]*?drop constraint if exists staff_role_check/);
  assert.match(
    roleMigration,
    /alter table public\.staff_memberships\b[\s\S]*?drop constraint if exists staff_memberships_role_check/
  );
});

test('temporary_staff gets the Express Panel it is routed to, and nothing more', () => {
  const main = read('src/main.ts');
  // Guard the premise: the client really does send this role to #/pos-kitchen.
  assert.match(main, /staff\.role === 'temporary_staff'[\s\S]{0,80}#\/pos-kitchen/);

  for (const policy of [
    'staff read menu_categories',
    'staff read menu_items',
    'staff read orders',
    'staff insert orders',
    'staff update orders',
    'staff write tables',
    'staff read customers',
    'staff write customers',
    'staff update customers',
    'staff insert activity_log',
    'staff insert audit_events'
  ]) {
    // Bounded so a policy that omits the role cannot pass on a later one's match.
    assert.match(
      roleMigration,
      new RegExp(`create policy "${policy}"[\\s\\S]{0,400}?temporary_staff`),
      `"${policy}" does not reach temporary_staff`
    );
    // Recreating a policy replaces it wholesale, so each must be dropped first.
    assert.match(
      roleMigration,
      new RegExp(`drop policy if exists "${policy}"`),
      `"${policy}" is recreated without being dropped`
    );
  }
});

test('temporary_staff is kept out of manager-grade and read-back surfaces', () => {
  // Widening any of these is a deliberate decision, not a side effect of
  // making the account creatable.
  for (const policy of [
    'managers write menu_categories',
    'managers write menu_items',
    'staff read inventory',
    'managers write inventory',
    'managers access suppliers',
    'managers read staff roster',
    'managers read activity_log',
    'owners read audit_events'
  ]) {
    assert.doesNotMatch(
      roleMigration,
      new RegExp(`create policy "${policy}"`),
      `"${policy}" should not be touched by this migration`
    );
  }

  // Cancelling an order stays with developer/owner/manager.
  const transitions = read('supabase/migrations/20260718000000_enforce_order_status_transitions.sql');
  assert.match(transitions, /caller_role not in \('developer', 'owner', 'manager'\)/);
  assert.doesNotMatch(transitions, /temporary_staff/);
});

test('an unrecognised role fails loudly instead of syncing as a cashier', () => {
  assert.doesNotMatch(staffAdmin, /STAFF_ROLES\.includes\(value\) \? value : 'cashier'/);
  assert.match(staffAdmin, /Unrecognised staff role/);
  // Reuse one allowlist rather than keeping a second copy in step by hand.
  assert.match(staffAdmin, /import \{ STAFF_ROLES \} from '\.\/authGuards'/);
});

test('owners can create staff logins for every role except owner and developer', () => {
  assert.match(
    staffView,
    /canInvite = currentRole === 'developer' \|\| \(currentRole === 'owner' && !reservedRole\)/
  );
  assert.match(staffView, /reservedRole = selectedRole === 'owner' \|\| selectedRole === 'developer'/);
  assert.doesNotMatch(staffView, /canInvite = authService\.getCurrentStaff\(\)\?\.role === 'developer'/);

  // The server is the real boundary and must keep enforcing the same rule.
  assert.match(edgeFunction, /Only developers can create owner or developer accounts/);
});

test('saving after a login was created reuses the id the server assigned', () => {
  // Otherwise Dexie mints an unrelated autoincrement id and the sync pushes it
  // back up as a second staff row for the same person.
  assert.match(staffView, /this\.createdCloudStaffId = Number\(result\.data\?\.staffId\) \|\| null/);
  assert.match(staffView, /db\.staff\.put\(\{ \.\.\.newStaff, id: this\.createdCloudStaffId \}\)/);
  assert.match(staffView, /occupant && occupant\.cloudUserId !== cloudUserId/);
  assert.match(staffView, /this\.createdCloudStaffId = null;/);
});

// @ts-nocheck
import { getSupabaseClient } from './supabaseClient';

import { STORE_ID } from '../content/brand';
const DEFAULT_STORE_ID = STORE_ID;
const STAFF_ROLES = ['developer', 'owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery'];

function getStoreId() {
  return localStorage.getItem('store_id') || DEFAULT_STORE_ID;
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return STAFF_ROLES.includes(value) ? value : 'cashier';
}

function isActive(value) {
  return value === true || value === 1 || value === 'true';
}

export function mapStaffForAdminFunction(staff) {
  return {
    id: staff?.id || null,
    storeId: getStoreId(),
    cloudUserId: staff?.cloudUserId || null,
    name: String(staff?.name || '').trim(),
    role: normalizeRole(staff?.role),
    allowExpress: staff?.allowExpress === 1 || staff?.allowExpress === true,
    isActive: staff?.isActive === undefined ? true : isActive(staff.isActive),
    createdAt: staff?.createdAt || null,
    updatedAt: staff?.updatedAt || new Date().toISOString()
  };
}

export async function invokeStaffAdmin(action, body = {}) {
  const client = await getSupabaseClient({ persistSession: true });
  if (!client) {
    return { success: false, message: 'Supabase URL and anon key are not configured.' };
  }

  const { data, error } = await client.functions.invoke('staff-admin', {
    body: { action, storeId: getStoreId(), ...body }
  });

  if (error) {
    let message = error.message || String(error);
    try {
      const body = await error.context?.json?.();
      message = body?.error || message;
    } catch (_parseError) {
      // Keep the Supabase client error message when the function body is empty.
    }
    return { success: false, message };
  }
  if (data?.error) {
    return { success: false, message: data.error };
  }

  return { success: true, data };
}

export async function syncStaffViaAdminFunction(staff) {
  const mapped = mapStaffForAdminFunction(staff);
  if (!mapped.name) {
    return { success: false, message: 'Staff name is required.' };
  }
  return invokeStaffAdmin('upsert-staff', { staff: mapped });
}

export async function setStaffActiveViaAdminFunction(staffOrId, active) {
  const staffId = typeof staffOrId === 'object' ? staffOrId?.id : staffOrId;
  if (!staffId) {
    return { success: false, message: 'Staff ID is required.' };
  }
  return invokeStaffAdmin('set-active', { staffId, isActive: Boolean(active) });
}

/**
 * Look up a Supabase Auth user by email to verify they have real credentials.
 * Used by StaffView to enforce that operational backend access is only granted
 * to users with actual Supabase Auth accounts (not fake/local-only staff).
 *
 * @param {string} email - Email address to look up
 * @returns {{ success: boolean, data?: { found: boolean, authUserId?: string, email?: string, confirmed?: boolean, existingMembership?: object }, message?: string }}
 */
export async function lookupAuthUser(email) {
  if (!email || !email.includes('@')) {
    return { success: false, message: 'A valid email address is required.' };
  }
  return invokeStaffAdmin('lookup-auth-user', { email: email.toLowerCase().trim() });
}

/**
 * Create the Supabase Auth login for a new staff member and link it to a staff
 * row, in one call.
 *
 * Until this existed, `upsert-staff` could only attach a staff record to an auth
 * user that already existed, so onboarding an owner meant running
 * scripts/provision-admin.js with the service-role key from a terminal. A
 * developer setting up a client store could assign the owner *role* from the
 * panel but not create the owner's *login*.
 *
 * Two modes, both enforced server-side:
 *  - omit `password` to send a Supabase invite email (needs SMTP on the project)
 *  - pass one to create a confirmed account directly (minimum 12 characters)
 *
 * Creating an owner or developer login requires the caller to BE a developer;
 * the edge function returns 403 otherwise. The password is never echoed back.
 *
 * @param {{ email: string, name: string, role: string, password?: string, allowExpress?: boolean, staffId?: number }} input
 * @returns {{ success: boolean, data?: { staffId: number, authUserId: string, invited: boolean }, message?: string }}
 */
export async function inviteStaffLogin({ email, name, role, password, allowExpress, staffId } = {}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, message: 'A valid email address is required.' };
  }
  if (!String(name || '').trim()) {
    return { success: false, message: 'Staff name is required.' };
  }
  if (!String(role || '').trim()) {
    return { success: false, message: 'A staff role is required.' };
  }
  if (password && String(password).length < 12) {
    return { success: false, message: 'Initial password must be at least 12 characters.' };
  }

  return invokeStaffAdmin('invite-staff', {
    email: cleanEmail,
    password: password || undefined,
    staff: {
      id: staffId || undefined,
      name: String(name).trim(),
      role: String(role).trim().toLowerCase(),
      allowExpress: Boolean(allowExpress)
    }
  });
}

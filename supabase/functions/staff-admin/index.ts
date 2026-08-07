// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse as baseJsonResponse, restrictedCorsHeaders } from "../_shared/cors.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const DEFAULT_STORE_ID = "trending-juice";
// Must stay in sync with STAFF_ROLES in src/services/authGuards.ts and the
// role check constraints on public.staff / public.staff_memberships.
const STAFF_ROLES = [
  "developer",
  "owner",
  "manager",
  "cashier",
  "kitchen",
  "waiter",
  "delivery",
  "temporary_staff"
];

type StaffAdminPayload = {
  action?: string;
  storeId?: string;
  staffId?: number;
  role?: string;
  name?: string;
  isActive?: boolean;
  email?: string;
  password?: string;
  staff?: {
    id?: number | null;
    storeId?: string;
    cloudUserId?: string | null;
    name?: string;
    role?: string;
    allowExpress?: boolean;
    isActive?: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
};

function cleanText(value: unknown, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function normalizeRole(role: unknown) {
  const value = cleanText(role, 30).toLowerCase();
  return STAFF_ROLES.includes(value) ? value : "";
}

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

/**
 * Find a Supabase Auth user by exact email address.
 *
 * Do NOT reach for `serviceClient.auth.admin.listUsers({ filter })` here.
 * auth-js only serializes `page` and `per_page` into the request; any `filter`
 * passed to it is silently dropped. The call this replaced —
 * `listUsers({ filter: email, page: 1, perPage: 5 })` — was therefore really
 * asking GoTrue for "the 5 most recently created users in the project" (the
 * endpoint's default sort is created_at desc) and then hoping the address we
 * wanted happened to be among them. Every customer that signs up is an auth
 * user too, so on a live store it essentially never was. That single silent
 * mismatch broke both callers: `lookup-auth-user` reported "no login exists"
 * for staff whose accounts were plainly there, and `invite-staff` sailed past
 * its duplicate check and then failed on createUser with "already registered".
 *
 * GoTrue's admin endpoint does support `filter` (`email LIKE '%filter%'`), so
 * call it directly and match the address exactly afterwards.
 */
async function findAuthUserByEmail(supabaseUrl: string, serviceRoleKey: string, email: string) {
  const target = email.trim().toLowerCase();
  const endpoint = new URL("/auth/v1/admin/users", supabaseUrl);
  endpoint.searchParams.set("filter", target);
  endpoint.searchParams.set("page", "1");
  // A full address is a narrow substring match; this is a ceiling, not a page size.
  endpoint.searchParams.set("per_page", "200");

  const response = await fetch(endpoint.toString(), {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Auth lookup failed (${response.status}). ${detail}`.trim());
  }

  const body = await response.json();
  const users = Array.isArray(body?.users) ? body.users : [];
  // `filter` is a substring match, so "a@b.com" also matches "xa@b.com".
  return users.find((user: any) => String(user?.email || "").toLowerCase() === target) || null;
}

async function getNextStaffId(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await serviceClient
    .from("staff")
    .select("id")
    .order("id", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.length ? Number(data[0].id) + 1 : 1;
}

async function activeRoleCount(serviceClient: ReturnType<typeof createClient>, storeId: string, role: string) {
  const { count, error } = await serviceClient
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("role", role)
    .eq("is_active", true);

  if (error) throw error;
  return count || 0;
}

async function requireOwner({
  serviceClient,
  token,
  storeId
}: {
  serviceClient: ReturnType<typeof createClient>;
  token: string;
  storeId: string;
}): Promise<{ user: any; membership: any } | { error: string; status: number }> {
  if (!token) return { error: "Missing authorization token.", status: 401 };

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return { error: "Invalid authorization token.", status: 401 };

  const { data: membership, error: membershipError } = await serviceClient
    .from("staff_memberships")
    .select("role, is_active, staff_id")
    .eq("store_id", storeId)
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError) return { error: `Membership check failed: ${membershipError.message}`, status: 500 };
  if (membership?.role !== "owner" && membership?.role !== "developer") {
    return { error: "Only active owners or developers can manage cloud staff.", status: 403 };
  }

  return { user, membership };
}

async function audit(serviceClient: ReturnType<typeof createClient>, storeId: string, action: string, details: Record<string, unknown>) {
  const { error } = await serviceClient.from("audit_events").insert({
    store_id: storeId,
    action,
    target_table: "staff",
    target_id: String(details.staffId || ""),
    details
  });
  if (error) console.warn(`staff-admin audit failed: ${error.message}`);
}

Deno.serve(async (req: Request) => {
  // Privileged endpoint: pin responses to configured origins when ALLOWED_ORIGINS is set.
  const cors = restrictedCorsHeaders(req);
  const jsonResponse = (body: unknown, status = 200) => baseJsonResponse(body, status, cors);
  const bad = (message: string, status = 400) => baseJsonResponse({ error: message }, status, cors);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return bad("Method not allowed.", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return bad("Staff admin function is not configured.", 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let payload: StaffAdminPayload;
  try {
    payload = await req.json();
  } catch (_error) {
    return bad("Invalid JSON body.");
  }

  const storeId = cleanText(payload.storeId || payload.staff?.storeId || Deno.env.get("STORE_ID") || DEFAULT_STORE_ID, 80);
  const action = cleanText(payload.action, 40);
  const now = new Date().toISOString();

  // Every staff-management action requires an authenticated owner/developer.
  const owner = await requireOwner({ serviceClient, token: bearerToken(req), storeId });
  if ("error" in owner) return bad(owner.error || "Unknown error", owner.status);

  try {
    if (action === "upsert-staff") {
      const input = payload.staff;
      if (!input) return bad("staff payload is required.");

      const name = cleanText(input.name, 100);
      const role = normalizeRole(input.role);
      const isActive = input.isActive !== false;
      const staffId = Number(input.id) || await getNextStaffId(serviceClient);
      const cloudUserId = cleanText(input.cloudUserId, 80) || null;

      if (!name) return bad("Staff name is required.");
      if (!role) return bad("Invalid staff role.");

      const { data: existing, error: existingError } = await serviceClient
        .from("staff")
        .select("created_at, role, is_active")
        .eq("store_id", storeId)
        .eq("id", staffId)
        .maybeSingle();
      if (existingError) throw existingError;

      // SECURITY: Only active developers can create or modify owner or developer roles/accounts.
      const isOwnerOrDevRole = role === "owner" || role === "developer";
      const isExistingOwnerOrDev = existing?.role === "owner" || existing?.role === "developer";
      if ((isOwnerOrDevRole || isExistingOwnerOrDev) && owner.membership.role !== "developer") {
        return bad("Only developers can create, modify, or assign owner/developer roles.", 403);
      }

      if (existing?.role === "owner" && existing.is_active && (!isActive || role !== "owner")) {
        const owners = await activeRoleCount(serviceClient, storeId, "owner");
        if (owners <= 1) return bad("Cannot remove or demote the last active owner.", 409);
      }

      // The developer role is the only one that can manage owner/developer accounts,
      // so losing the last active developer would permanently lock this store out of
      // staff administration. Recovery would require direct database access.
      if (existing?.role === "developer" && existing.is_active && (!isActive || role !== "developer")) {
        const developers = await activeRoleCount(serviceClient, storeId, "developer");
        if (developers <= 1) return bad("Cannot remove or demote the last active developer.", 409);
      }

      const staffRow = {
        id: staffId,
        store_id: storeId,
        auth_user_id: cloudUserId,
        name,
        role,
        allow_express: Boolean(input.allowExpress),
        is_active: isActive,
        created_at: existing?.created_at || input.createdAt || now,
        updated_at: now
      };

      const { error: staffError } = await serviceClient.from("staff").upsert(staffRow);
      if (staffError) throw staffError;

      if (cloudUserId) {
        const { error: membershipError } = await serviceClient
          .from("staff_memberships")
          .upsert({
            store_id: storeId,
            staff_id: staffId,
            auth_user_id: cloudUserId,
            role,
            is_active: isActive,
            updated_at: now
          }, { onConflict: "store_id,auth_user_id" });
        if (membershipError) throw membershipError;
      }

      await audit(serviceClient, storeId, "staff_admin_upsert", { staffId, role, isActive, by: owner.user.id });
      return jsonResponse({ ok: true, staffId });
    }

    if (action === "set-active") {
      const staffId = Number(payload.staffId);
      if (!staffId) return bad("staffId is required.");

      const isActive = Boolean(payload.isActive);
      const { data: existing, error: existingError } = await serviceClient
        .from("staff")
        .select("role, is_active")
        .eq("store_id", storeId)
        .eq("id", staffId)
        .maybeSingle();
      if (existingError) throw existingError;

      // SECURITY: Only active developers can activate or deactivate owner or developer accounts.
      const isExistingOwnerOrDev = existing?.role === "owner" || existing?.role === "developer";
      if (isExistingOwnerOrDev && owner.membership.role !== "developer") {
        return bad("Only developers can activate or deactivate owner/developer accounts.", 403);
      }

      if (existing?.role === "owner" && existing.is_active && !isActive) {
        const owners = await activeRoleCount(serviceClient, storeId, "owner");
        if (owners <= 1) return bad("Cannot deactivate the last active owner.", 409);
      }

      if (existing?.role === "developer" && existing.is_active && !isActive) {
        const developers = await activeRoleCount(serviceClient, storeId, "developer");
        if (developers <= 1) return bad("Cannot deactivate the last active developer.", 409);
      }

      const { error: staffError } = await serviceClient
        .from("staff")
        .update({ is_active: isActive, updated_at: now })
        .eq("store_id", storeId)
        .eq("id", staffId);
      if (staffError) throw staffError;

      const { error: membershipError } = await serviceClient
        .from("staff_memberships")
        .update({ is_active: isActive, updated_at: now })
        .eq("store_id", storeId)
        .eq("staff_id", staffId);
      if (membershipError) throw membershipError;

      await audit(serviceClient, storeId, "staff_admin_set_active", { staffId, isActive, by: owner.user.id });
      return jsonResponse({ ok: true, staffId, isActive });
    }

    if (action === "set-role") {
      const staffId = Number(payload.staffId);
      const role = normalizeRole(payload.role);
      if (!staffId) return bad("staffId is required.");
      if (!role) return bad("Invalid staff role.");

      const { data: existing, error: existingError } = await serviceClient
        .from("staff")
        .select("role, is_active")
        .eq("store_id", storeId)
        .eq("id", staffId)
        .maybeSingle();
      if (existingError) throw existingError;

      // SECURITY: Only active developers can assign or modify owner or developer roles.
      const isOwnerOrDevRole = role === "owner" || role === "developer";
      const isExistingOwnerOrDev = existing?.role === "owner" || existing?.role === "developer";
      if ((isOwnerOrDevRole || isExistingOwnerOrDev) && owner.membership.role !== "developer") {
        return bad("Only developers can assign or modify owner/developer roles.", 403);
      }

      if (existing?.role === "owner" && existing.is_active && role !== "owner") {
        const owners = await activeRoleCount(serviceClient, storeId, "owner");
        if (owners <= 1) return bad("Cannot demote the last active owner.", 409);
      }

      if (existing?.role === "developer" && existing.is_active && role !== "developer") {
        const developers = await activeRoleCount(serviceClient, storeId, "developer");
        if (developers <= 1) return bad("Cannot demote the last active developer.", 409);
      }

      const { error: staffError } = await serviceClient
        .from("staff")
        .update({ role, updated_at: now })
        .eq("store_id", storeId)
        .eq("id", staffId);
      if (staffError) throw staffError;

      const { error: membershipError } = await serviceClient
        .from("staff_memberships")
        .update({ role, updated_at: now })
        .eq("store_id", storeId)
        .eq("staff_id", staffId);
      if (membershipError) throw membershipError;

      await audit(serviceClient, storeId, "staff_admin_set_role", { staffId, role, by: owner.user.id });
      return jsonResponse({ ok: true, staffId, role });
    }

    if (action === "invite-staff") {
      // Create the Supabase Auth login for a new staff member and link it to a
      // staff row in one call.
      //
      // Before this, `upsert-staff` could only attach a staff record to an auth
      // user that already existed, so onboarding an owner meant running
      // scripts/provision-admin.js with the service-role key from a terminal.
      // A developer setting up a client store could assign the owner *role*
      // from the panel but not create the owner's *login*.
      const email = cleanText(payload.email, 320).toLowerCase();
      const name = cleanText(payload.staff?.name ?? payload.name, 100);
      const role = normalizeRole(payload.staff?.role ?? payload.role);
      const password = String(payload.password || "");

      if (!email || !email.includes("@")) return bad("A valid email address is required.");
      if (!name) return bad("Staff name is required.");
      if (!role) return bad("Invalid staff role.");

      // Same rule as upsert-staff: only developers may mint owner/developer
      // accounts. Without this an owner could create a second owner and
      // escalate around the developer-only boundary.
      if ((role === "owner" || role === "developer") && owner.membership.role !== "developer") {
        return bad("Only developers can create owner or developer accounts.", 403);
      }

      // Refuse rather than silently adopt an existing login: the caller may be
      // about to grant this store's access to someone else's account.
      let alreadyThere: any = null;
      try {
        alreadyThere = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
      } catch (lookupError) {
        return bad(lookupError instanceof Error ? lookupError.message : String(lookupError), 500);
      }
      if (alreadyThere) {
        return bad(
          "An auth account already exists for this email. Use lookup-auth-user, then upsert-staff with its cloudUserId to link it.",
          409
        );
      }

      // Two ways in. inviteUserByEmail needs SMTP configured on the project and
      // never creates a password; createUser is the fallback for projects
      // without mail, and requires the caller to supply the initial one.
      let authUser: any = null;
      let invited = false;

      if (password) {
        if (password.length < 12) {
          return bad("Initial password must be at least 12 characters.", 422);
        }
        const { data, error } = await serviceClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true
        });
        if (error) return bad(`Could not create the login: ${error.message}`, 500);
        authUser = data?.user;
      } else {
        const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
          data: { name, store_id: storeId }
        });
        if (error) {
          return bad(
            `Could not send the invite: ${error.message}. If this project has no SMTP configured, send a password with the request instead.`,
            500
          );
        }
        authUser = data?.user;
        invited = true;
      }

      if (!authUser?.id) return bad("Auth account creation returned no user.", 500);

      // app_metadata is server-only — the account holder cannot alter it — and
      // is what appMetadataToStaffAccess reads as its fallback hint when the
      // membership row cannot be reached.
      const { error: metaError } = await serviceClient.auth.admin.updateUserById(authUser.id, {
        app_metadata: { role, store_id: storeId, is_active: true }
      });
      if (metaError) console.warn(`staff-admin: app_metadata not set: ${metaError.message}`);

      const staffId = Number(payload.staff?.id) || await getNextStaffId(serviceClient);
      const now = new Date().toISOString();

      const { error: staffError } = await serviceClient.from("staff").upsert({
        id: staffId,
        store_id: storeId,
        auth_user_id: authUser.id,
        name,
        role,
        allow_express: Boolean(payload.staff?.allowExpress),
        is_active: true,
        created_at: now,
        updated_at: now
      });
      if (staffError) throw staffError;

      const { error: membershipError } = await serviceClient
        .from("staff_memberships")
        .upsert({
          store_id: storeId,
          staff_id: staffId,
          auth_user_id: authUser.id,
          role,
          is_active: true,
          updated_at: now
        }, { onConflict: "store_id,auth_user_id" });
      if (membershipError) throw membershipError;

      await audit(serviceClient, storeId, "staff_admin_invite", {
        staffId, role, email, invited, by: owner.user.id
      });

      // Never echo the password back, not even the one the caller sent.
      return jsonResponse({ ok: true, staffId, authUserId: authUser.id, invited });
    }

    if (action === "lookup-auth-user") {
      // Look up a Supabase Auth user by email to verify they have real credentials.
      // Only returns minimal info — never exposes passwords, tokens, etc.
      // `payload.staff.name` is a legacy shape kept so an older deployed client
      // keeps working; current callers send `email`.
      const email = cleanText(payload.email || payload.staff?.name, 320).toLowerCase();
      if (!email || !email.includes("@")) {
        return bad("A valid email address is required.");
      }

      let matchedUser: any = null;
      try {
        matchedUser = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
      } catch (lookupError) {
        return bad(lookupError instanceof Error ? lookupError.message : String(lookupError), 500);
      }

      if (!matchedUser) {
        return jsonResponse({
          ok: true,
          found: false,
          message: "No Supabase Auth account found with this email.",
        });
      }

      // Check if they already have a staff_membership for this store
      const { data: existingMembership } = await serviceClient
        .from("staff_memberships")
        .select("staff_id, role, is_active")
        .eq("store_id", storeId)
        .eq("auth_user_id", matchedUser.id)
        .maybeSingle();

      return jsonResponse({
        ok: true,
        found: true,
        authUserId: matchedUser.id,
        email: matchedUser.email,
        confirmed: !!matchedUser.email_confirmed_at,
        existingMembership: existingMembership
          ? {
              staffId: existingMembership.staff_id,
              role: existingMembership.role,
              isActive: existingMembership.is_active,
            }
          : null,
      });
    }

    return bad("Unsupported staff admin action.");
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error), 500);
  }
});

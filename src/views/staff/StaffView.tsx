// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Staff Management
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../../db/database';
import { escapeHtml, showToast, playSound, vibrateDevice } from '../../utils/helpers';
import { logShiftStarted, logShiftEnded } from '../../utils/activityLogger';
import { inviteStaffLogin, lookupAuthUser } from '../../services/staffAdmin';
import { authService } from '../../services/auth';

// Roles that require a verified Supabase Auth account (operational backend access)
const CLOUD_REQUIRED_ROLES = ['owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery', 'temporary_staff'];

const ROLES = {
  developer: { label: 'Developer', color: 'var(--nextgenos-purple-on-surface)' },
  owner: { label: 'Owner', color: 'var(--color-primary-on-surface)' },
  manager: { label: 'Manager', color: 'var(--nextgenos-purple-on-surface)' },
  cashier: { label: 'Cashier', color: 'var(--color-success-on-surface)' },
  kitchen: { label: 'Kitchen', color: 'var(--color-warning-on-surface)' },
  waiter: { label: 'Waiter', color: 'var(--color-info)' },
  delivery: { label: 'Delivery', color: '#06B6D4' },
  temporary_staff: { label: 'Temporary Staff', color: '#E11D48' },
};

export class StaffView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.tab = 'directory';
    this.editingStaffId = null;
    // Tracks the verified cloud user for the current modal session
    this.verifiedCloudUser = null; // { authUserId, email, confirmed, existingMembership }
    // Staff id the edge function assigned when it created a login in this modal
    // session, so Save writes that row instead of minting a second one.
    this.createdCloudStaffId = null;
  }

  async mount(container) {
    this.container = container;
    this.render();
    this.bindEvents();
    await this.loadData();
  }

  render() {
    const currentStaff = authService.getCurrentStaff();
    const isDeveloper = currentStaff?.role === 'developer';

    this.container.innerHTML = `
      <div class="main-area">
        <div class="header-bar">
          <div class="header-bar-title">
            <span aria-hidden="true" class="material-symbols-rounded">groups</span>
            <h2>Staff & Roles</h2>
          </div>
          <button id="add-staff-btn" class="btn btn-primary btn-sm">
            <span aria-hidden="true" class="material-symbols-rounded" style="font-size:16px;">person_add</span> Add Staff
          </button>
        </div>
        <div class="tab-container" id="staff-tabs">
          <button class="tab staff-tab active" data-tab="directory">Directory</button>
          <button class="tab staff-tab" data-tab="shifts">Shifts</button>
          <button class="tab staff-tab" data-tab="activity">Activity Log</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:24px;" id="staff-content"></div>
      </div>
      <div id="staff-modal" class="modal-overlay" style="display:none;">
        <div class="modal" style="max-width:420px;">
          <div class="modal-header">
            <h3 id="staff-modal-title">Add Staff</h3>
            <button class="btn-icon" id="staff-close-icon"><span aria-hidden="true" class="material-symbols-rounded">close</span></button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
            <div class="input-group">
              <label for="staff-role">Role</label>
              <select id="staff-role" class="input">
                <option value="cashier">Cashier</option>
                <option value="kitchen">Kitchen Staff</option>
                <option value="waiter">Waiter</option>
                <option value="delivery">Delivery Staff</option>
                <option value="temporary_staff">Temporary Staff</option>
                <option value="manager">Manager</option>
                ${isDeveloper ? '<option value="owner">Owner</option>' : ''}
              </select>
            </div>

            <!-- Cloud Account Verification (shown for owner/manager roles) -->
            <div id="staff-cloud-section" style="display:none;">
              <div style="background:rgba(108,92,231,0.06);border:1px solid rgba(108,92,231,0.15);border-radius:var(--radius-md);padding:12px;margin-bottom:4px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                  <span aria-hidden="true" class="material-symbols-rounded" style="font-size:16px;color:var(--nextgenos-purple-on-surface);">verified_user</span>
                  <span style="font-size:0.72rem;font-weight:700;color:var(--nextgenos-purple-on-surface);text-transform:uppercase;letter-spacing:0.05em;">Cloud Account Verification Required</span>
                </div>
                <p style="font-size:0.7rem;color:var(--text-secondary);margin:0 0 10px;line-height:1.4;">All staff roles require a verified Supabase Auth account. Enter the staff member's login email to verify.</p>
                <div style="display:flex;gap:8px;align-items:stretch;">
                  <input type="email" id="staff-cloud-email" class="input" placeholder="staff@example.com" style="flex:1;font-size:0.8rem;">
                  <button id="staff-verify-btn" class="btn btn-secondary btn-sm" style="white-space:nowrap;padding:6px 14px;font-size:0.72rem;font-weight:700;">
                    <span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;">search</span> Verify
                  </button>
                </div>
                <div id="staff-cloud-status" style="margin-top:8px;min-height:24px;"></div>
              </div>
            </div>

            <div class="input-group">
              <label for="staff-name">Staff Name</label>
              <input type="text" id="staff-name" class="input" placeholder="e.g. Rahul Sharma">
            </div>
            <div class="input-group">
              <label for="staff-phone">Phone Number</label>
              <input type="tel" id="staff-phone" class="input" placeholder="e.g. 9876543210">
            </div>
            <div class="input-group" style="flex-direction:row; align-items:center; gap:8px; margin-top:8px;">
              <input type="checkbox" id="staff-allow-express" style="width:auto; cursor:pointer; height: 18px; margin: 0;">
              <label for="staff-allow-express" style="margin:0; cursor:pointer; font-weight: 500;">Allow access to Express Panel</label>
            </div>
          </div>
          <div class="modal-footer">
            <button id="staff-cancel" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="staff-save" class="btn btn-primary btn-sm">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  /** Show/hide the cloud verification section based on selected role */
  updateCloudSectionVisibility() {
    const role = document.getElementById('staff-role')?.value;
    const cloudSection = document.getElementById('staff-cloud-section');
    if (cloudSection) {
      cloudSection.style.display = CLOUD_REQUIRED_ROLES.includes(role) ? 'block' : 'none';
    }
  }

  /** Reset the cloud verification state */
  resetCloudVerification() {
    this.verifiedCloudUser = null;
    this.createdCloudStaffId = null;
    const emailEl = document.getElementById('staff-cloud-email');
    const statusEl = document.getElementById('staff-cloud-status');
    if (emailEl) emailEl.value = '';
    if (statusEl) statusEl.innerHTML = '';
  }

  /** Display the cloud verification result */
  /**
   * Create the Supabase Auth login for the email in the modal, then link it to
   * a staff row. Developer-only; the edge function enforces that independently.
   */
  async createCloudLogin() {
    const email = document.getElementById('staff-cloud-email')?.value?.trim();
    const name = document.getElementById('staff-name')?.value?.trim()
      || (email ? email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '');
    const role = document.getElementById('staff-role')?.value;

    if (!email || !name || !role) {
      showToast('Name, role and email are all required to create a login.', 'warning');
      return;
    }

    const btn = document.getElementById('staff-create-login');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;animation:spin 1s linear infinite;">progress_activity</span> Creating…';
    }

    const allowExpress = document.getElementById('staff-allow-express')?.checked || false;

    let result = await inviteStaffLogin({ email, name, role, allowExpress });

    // Projects without SMTP cannot send an invite. Fall back to setting an
    // initial password rather than leaving the caller stuck.
    if (!result.success && /smtp|invite/i.test(result.message || '')) {
      const password = window.prompt(
        'This project cannot send invite emails.\n\nEnter an initial password for ' + email + ' (minimum 12 characters).\nShare it with them over a trusted channel and have them change it after first sign-in.'
      );
      if (password) {
        result = await inviteStaffLogin({ email, name, role, password, allowExpress });
      } else {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;">person_add</span> Create login'; }
        return;
      }
    }

    if (!result.success) {
      showToast(result.message || 'Could not create the login.', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;">person_add</span> Create login'; }
      return;
    }

    showToast(
      result.data?.invited ? `Invite sent to ${email}.` : `Login created for ${email}.`,
      'success'
    );
    playSound('success');

    // The edge function already inserted the staff row and membership under an
    // id it picked. Remember that id: without it, Save fell through to
    // db.staff.add(), Dexie handed out an unrelated local autoincrement id, and
    // the sync pushed *that* id back up as a second staff row for one person.
    this.createdCloudStaffId = Number(result.data?.staffId) || null;

    // Re-verify so the modal picks up the new account and Save unblocks.
    this.showCloudStatus(await lookupAuthUser(email));
    await this.loadData();
  }

  showCloudStatus(result) {
    const statusEl = document.getElementById('staff-cloud-status');
    if (!statusEl) return;

    if (!result || !result.success) {
      statusEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:var(--radius-sm);background:rgba(var(--color-danger-rgb),0.08);border:1px solid rgba(var(--color-danger-rgb),0.2);">
          <span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;color: var(--color-danger-on-surface);">error</span>
          <span style="font-size:0.7rem;color: var(--color-danger-on-surface);font-weight:600;">${escapeHtml(result?.message || 'Verification failed. Check your connection.')}</span>
        </div>`;
      return;
    }

    const data = result.data;
    if (!data?.found) {
      // "This person must sign up first" was a dead end: there is no public
      // sign-up for staff. The login can now be created here instead of running
      // scripts/provision-admin.js from a terminal.
      //
      // Owners belong here too. This was gated on `role === 'developer'`, which
      // left an owner — the person who actually hires the cashiers, waiters and
      // kitchen staff — staring at "Ask a developer to create this login" for
      // every single hire, even though the edge function has always accepted
      // owners for exactly these roles. Only owner/developer logins are
      // reserved for developers, so mirror that rule and nothing broader.
      const currentRole = authService.getCurrentStaff()?.role;
      const selectedRole = document.getElementById('staff-role')?.value;
      const reservedRole = selectedRole === 'owner' || selectedRole === 'developer';
      const canInvite = currentRole === 'developer' || (currentRole === 'owner' && !reservedRole);
      statusEl.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;padding:8px 10px;border-radius:var(--radius-sm);background:rgba(var(--color-warning-rgb),0.10);border:1px solid rgba(var(--color-warning-rgb),0.24);">
          <div style="display:flex;align-items:center;gap:6px;">
            <span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;color:var(--color-warning-on-surface);">person_off</span>
            <span style="font-size:0.7rem;color:var(--color-warning-on-surface);font-weight:600;">No login exists for this email yet.</span>
          </div>
          ${canInvite ? `
            <button type="button" class="btn btn-primary btn-sm" id="staff-create-login" style="align-self:flex-start;">
              <span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;">person_add</span>
              Create login
            </button>
            <div style="font-size:0.62rem;color:var(--text-muted);line-height:1.4;">
              Sends a Supabase invite email. If the project has no SMTP configured you will be asked for an initial password instead.
            </div>
          ` : `
            <div style="font-size:0.62rem;color:var(--text-muted);">
              ${reservedRole
                ? 'Only a developer can create an owner or developer login.'
                : 'Ask an owner or developer to create this login.'}
            </div>
          `}
        </div>`;
      this.verifiedCloudUser = null;

      document.getElementById('staff-create-login')?.addEventListener('click', () => {
        this.createCloudLogin();
      });
      return;
    }

    // Auto-fill name field if empty
    const nameEl = document.getElementById('staff-name');
    if (nameEl && !nameEl.value.trim() && data.email) {
      const emailName = data.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      nameEl.value = emailName;
    }

    this.verifiedCloudUser = {
      authUserId: data.authUserId,
      email: data.email,
      confirmed: data.confirmed,
      existingMembership: data.existingMembership
    };

    let membershipNote = '';
    if (data.existingMembership) {
      const m = data.existingMembership;
      membershipNote = `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;">Already linked as <strong>${escapeHtml(m.role)}</strong> (${m.isActive ? 'active' : 'inactive'})</div>`;
    }

    statusEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:var(--radius-sm);background:rgba(var(--color-success-rgb),0.08);border:1px solid rgba(var(--color-success-rgb),0.2);">
        <span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;color:var(--color-success-on-surface);">verified</span>
        <div>
          <span style="font-size:0.7rem;color:var(--color-success-on-surface);font-weight:600;">Verified: ${escapeHtml(data.email)}</span>
          ${data.confirmed ? '' : '<span style="font-size:0.6rem;color:var(--text-muted);margin-left:4px;">(email not confirmed)</span>'}
          ${membershipNote}
        </div>
      </div>`;
  }

  bindEvents() {
    const modal = document.getElementById('staff-modal');
    const resetModal = () => {
      this.editingStaffId = null;
      this.resetCloudVerification();
      document.getElementById('staff-modal-title').textContent = 'Add Staff';
      ['staff-name', 'staff-phone'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('staff-role').value = 'cashier';
      document.getElementById('staff-allow-express').checked = false;
      this.updateCloudSectionVisibility();
    };

    document.getElementById('add-staff-btn').addEventListener('click', () => {
      playSound(700, 80);
      resetModal();
      modal.style.display = 'flex';
    });

    const closeModal = () => {
      resetModal();
      modal.style.display = 'none';
    };
    document.getElementById('staff-cancel').addEventListener('click', closeModal);
    document.getElementById('staff-close-icon')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Toggle cloud section visibility when role changes
    document.getElementById('staff-role')?.addEventListener('change', () => {
      this.updateCloudSectionVisibility();
      // Reset verification when role changes
      if (!CLOUD_REQUIRED_ROLES.includes(document.getElementById('staff-role').value)) {
        this.resetCloudVerification();
      } else if (!this.verifiedCloudUser) {
        // The "no login exists" panel gates its Create login button on the role
        // that was selected when it rendered. Drop it so the new role is judged
        // by a fresh Verify rather than by a stale button.
        const statusEl = document.getElementById('staff-cloud-status');
        if (statusEl) statusEl.innerHTML = '';
      }
    });

    // Verify cloud account button
    document.getElementById('staff-verify-btn')?.addEventListener('click', async () => {
      const email = document.getElementById('staff-cloud-email')?.value?.trim();
      if (!email || !email.includes('@')) {
        showToast('Enter a valid email address to verify', 'warning');
        return;
      }

      const verifyBtn = document.getElementById('staff-verify-btn');
      const statusEl = document.getElementById('staff-cloud-status');
      verifyBtn.disabled = true;
      verifyBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;animation:spin 1s linear infinite;">progress_activity</span> Checking…';
      statusEl.innerHTML = '';

      try {
        const result = await lookupAuthUser(email);
        this.showCloudStatus(result);
      } catch (err) {
        this.showCloudStatus({ success: false, message: 'Network error: ' + err.message });
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;">search</span> Verify';
      }
    });

    // Save staff member
    document.getElementById('staff-save').addEventListener('click', async () => {
      const name = document.getElementById('staff-name').value.trim();
      const role = document.getElementById('staff-role').value;
      const phone = document.getElementById('staff-phone').value.trim();
      const allowExpress = document.getElementById('staff-allow-express').checked ? 1 : 0;
      
      if (!name) { showToast('Name is required', 'error'); return; }
      
      const isEdit = !!this.editingStaffId;

      // SECURITY: Only active developers can create or modify owner or developer roles/accounts.
      const currentStaff = authService.getCurrentStaff();
      const isDeveloper = currentStaff?.role === 'developer';
      const isOwnerOrDevRole = role === 'owner' || role === 'developer';
      
      let isExistingOwnerOrDev = false;
      if (isEdit) {
        const existing = await db.staff.get(this.editingStaffId);
        isExistingOwnerOrDev = existing?.role === 'owner' || existing?.role === 'developer';
      }

      if ((isOwnerOrDevRole || isExistingOwnerOrDev) && !isDeveloper) {
        showToast('Only developers can create, modify, or assign owner/developer roles.', 'error');
        return;
      }

      // ── Enforce cloud verification for operational backend roles ──
      if (CLOUD_REQUIRED_ROLES.includes(role)) {
        if (!this.verifiedCloudUser || !this.verifiedCloudUser.authUserId) {
          showToast(`${role.charAt(0).toUpperCase() + role.slice(1)} role requires a verified Supabase Auth account. Please verify the email first.`, 'error');
          return;
        }
      }
      
      // Build staff data with optional cloud user link
      const cloudUserId = this.verifiedCloudUser?.authUserId || null;

      if (isEdit) {
        const updateData = { name, role, phone, allowExpress, isSynced: 0 };
        if (cloudUserId) updateData.cloudUserId = cloudUserId;
        await db.staff.update(this.editingStaffId, updateData);
        showToast('Staff member updated!', 'success');
      } else {
        const newStaff = {
          name, role, phone, allowExpress,
          cloudUserId,
          isActive: true,
          createdAt: new Date().toISOString(),
          isSynced: 0,
          _platform: 'nextgenos'
        };

        if (this.createdCloudStaffId) {
          // A login was created in this modal session, so the cloud already has
          // a staff row under an id it chose. Write the local row at that id so
          // the two are one staff member rather than two.
          const occupant = await db.staff.get(this.createdCloudStaffId);
          if (occupant && occupant.cloudUserId !== cloudUserId) {
            showToast(
              `Local staff #${this.createdCloudStaffId} is already ${occupant.name}. Sync this device, then try again.`,
              'error'
            );
            return;
          }
          await db.staff.put({ ...newStaff, id: this.createdCloudStaffId });
        } else {
          await db.staff.add(newStaff);
        }
        showToast('Staff member added!', 'success');
      }

      resetModal();
      modal.style.display = 'none';
      playSound(900, 100);
      vibrateDevice([40]);
      await this.loadData();
    });

    this.container.querySelectorAll('.staff-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.tab = btn.dataset.tab;
        playSound(700, 80);
        this.container.querySelectorAll('.staff-tab').forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        await this.loadData();
      });
    });
  }

  async loadData() {
    const content = document.getElementById('staff-content');
    if (!content) return;
    if (this.tab === 'directory') {
      const currentStaff = authService.getCurrentStaff();
      const isDeveloper = currentStaff?.role === 'developer';
      // Developer accounts are only visible to developers. The cloud roster is filtered
      // by RLS as well; this also hides rows already cached locally from before that.
      const staffList = (await db.staff.toArray()).filter(s => isDeveloper || s.role !== 'developer');
      const owners = staffList.filter(s => s.role === 'owner' && s.isActive);

      content.innerHTML = staffList.length === 0 ? '<div class="empty-state"><span aria-hidden="true" class="material-symbols-rounded">person_off</span><p>No staff members yet.</p></div>' :
        `<div class="content-grid">${staffList.map(s => {
          const role = ROLES[s.role] || ROLES.cashier;
          const isOwnerOrDev = s.role === 'owner' || s.role === 'developer';
          const canManageThis = !isOwnerOrDev || isDeveloper;
          const isDeletable = canManageThis && !(s.role === 'owner' && owners.length <= 1);
          const hasExpress = s.allowExpress === 1 || s.allowExpress === true || s.role === 'owner';
          const expressBadge = hasExpress ? `<span style="font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color:var(--nextgenos-purple-on-surface);background:var(--nextgenos-purple-bg);border:1px solid var(--nextgenos-purple-border);">Express Panel</span>` : '';
          return `
            <div class="premium-card" style="position:relative; padding-right:120px;">
              <div class="premium-card-avatar" style="background:rgba(${s.role === 'owner' ? '255,107,53' : '108,92,231'},0.1); color:${role.color};">
                ${escapeHtml((s.name || '?')[0].toUpperCase())}
              </div>
              <div class="premium-card-body">
                <span class="premium-card-title">${escapeHtml(s.name)}</span>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px;">
                  <span style="font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color:${role.color};background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">${role.label}</span>
                  ${expressBadge}
                  ${s.cloudUserId ? `<span style="font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color:var(--color-success-on-surface);background:rgba(var(--color-success-rgb),0.08);border:1px solid rgba(var(--color-success-rgb),0.15);"><span aria-hidden="true" class="material-symbols-rounded" style="font-size:10px;vertical-align:middle;">verified</span> Cloud</span>` : ''}
                  <span style="font-size:0.6rem;color:${s.isActive ? 'var(--color-success-on-surface)' : 'var(--color-danger-on-surface)'};font-weight:700;">${s.isActive ? '● Active' : '● Inactive'}</span>
                </div>
              </div>
              <div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:6px;">
                ${canManageThis ? `
                <button class="btn-icon edit-staff-btn" data-id="${escapeHtml(String(s.id ?? ''))}" style="width:30px;height:30px;min-width:30px;border-radius:6px;">
                  <span aria-hidden="true" class="material-symbols-rounded" style="font-size:16px;">edit</span>
                </button>
                ` : ''}
                ${isDeletable ? `
                  <button class="btn-icon delete-staff-btn" data-id="${escapeHtml(String(s.id ?? ''))}" style="color: var(--color-danger-on-surface);width:30px;height:30px;min-width:30px;border-radius:6px;">
                    <span aria-hidden="true" class="material-symbols-rounded" style="font-size:16px;">delete</span>
                  </button>
                ` : ''}
              </div>
            </div>`;
        }).join('')}</div>`;

      content.querySelectorAll('.edit-staff-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = parseInt(btn.dataset.id);
          const staffMember = await db.staff.get(id);
          if (!staffMember) return;

          playSound(700, 80);
          this.editingStaffId = id;
          this.resetCloudVerification();
          document.getElementById('staff-modal-title').textContent = 'Edit Staff Member';
          document.getElementById('staff-name').value = staffMember.name || '';
          document.getElementById('staff-role').value = staffMember.role || 'cashier';
          document.getElementById('staff-phone').value = staffMember.phone || '';
          document.getElementById('staff-allow-express').checked = staffMember.allowExpress === 1 || staffMember.allowExpress === true;

          // If already linked to a cloud user, pre-populate the verification
          if (staffMember.cloudUserId) {
            this.verifiedCloudUser = {
              authUserId: staffMember.cloudUserId,
              email: null,
              confirmed: true,
              existingMembership: null
            };
            const statusEl = document.getElementById('staff-cloud-status');
            if (statusEl) {
              statusEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:var(--radius-sm);background:rgba(var(--color-success-rgb),0.08);border:1px solid rgba(var(--color-success-rgb),0.2);">
                  <span aria-hidden="true" class="material-symbols-rounded" style="font-size:14px;color:var(--color-success-on-surface);">verified</span>
                  <span style="font-size:0.7rem;color:var(--color-success-on-surface);font-weight:600;">Already linked to cloud account</span>
                </div>`;
            }
          }

          this.updateCloudSectionVisibility();
          document.getElementById('staff-modal').style.display = 'flex';
        });
      });

      content.querySelectorAll('.delete-staff-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = parseInt(btn.dataset.id);
          const staffMember = await db.staff.get(id);
          if (!staffMember) return;

          if (confirm(`Are you sure you want to remove ${staffMember.name}?`)) {
            await db.staff.delete(id);
            playSound(900, 100);
            vibrateDevice([40]);
            showToast('Staff member removed successfully!', 'success');
            await this.loadData();
          }
        });
      });

    } else if (this.tab === 'shifts') {
      const shifts = await db.shifts.reverse().sortBy('clockIn');
      const recent = shifts.slice(0, 20);
      content.innerHTML = recent.length === 0 ?
        '<div class="empty-state"><span aria-hidden="true" class="material-symbols-rounded">schedule</span><p>No shift records yet.</p></div>' :
        `<div class="content-grid">${recent.map(s => `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-direction:row;">
            <div>
              <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">Staff #${escapeHtml(String(s.staffId ?? '—'))}</div>
              <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(s.date || '—')}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:var(--text-xs);color:var(--color-success-on-surface);font-weight:600;">${escapeHtml(s.clockIn || '—')} → ${escapeHtml(s.clockOut || 'Active')}</div>
            </div>
          </div>
        `).join('')}</div>`;
    } else {
      const logs = await db.activityLog.reverse().sortBy('timestamp');
      const recent = logs.slice(0, 30);
      content.innerHTML = recent.length === 0 ?
        '<div class="empty-state"><span aria-hidden="true" class="material-symbols-rounded">history</span><p>No activity logged yet.</p></div>' :
        `<div class="content-grid">${recent.map(l => `
          <div class="card" style="display:flex; gap:12px; align-items:center; flex-direction:row;">
            <span aria-hidden="true" class="material-symbols-rounded" style="font-size:18px;color: var(--color-primary-on-surface); flex-shrink:0;">history</span>
            <div style="flex:1; min-width:0;">
              <div style="font-size:var(--text-xs);color:var(--text-primary);font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(l.action || 'Action')}</div>
              <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(l.staffName || 'System')} · ${new Date(l.timestamp).toLocaleString('en-IN')}</div>
            </div>
          </div>
        `).join('')}</div>`;
    }
  }

  unmount() { this.container = null; }
}

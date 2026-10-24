/* ============================================================
   dev_console6.js — CareLink Development Console, Production
   First-Run SMS Credential Provisioning, DPA First-Login Privacy
   Password Enforcement & Audited Chief Admin Silent Override (v6.4)
   ============================================================ */

/* ---------------- 1. Production Setup & DPA Password Policy ---------------- */
const PROD_SETUP = {
  lastPack: null, /* One-time in-memory credential pack for immediate SMS/WhatsApp export; never stored in DB */
  lastWhatsappSheet: '',

  isGloballyActivated() {
    if (DB.db && DB.db.settings && DB.db.settings.globallyActivated) return true;
    if (DB.db && DB.db.meta && DB.db.meta.globallyActivated) return true;
    if (typeof APPX !== 'undefined' && APPX.host && APPX.host.globallyActivated) return true;
    return false;
  },

  isAwaitingGlobalActivation() {
    if (this.isGloballyActivated()) return false;
    return Boolean(DB.db && DB.db.settings && DB.db.settings.awaitingGlobalActivation);
  },

  defaultPortalUrl() {
    try {
      if (DB.db && DB.db.settings && DB.db.settings.org && DB.db.settings.org.loginUrl) return DB.db.settings.org.loginUrl;
      if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') return location.origin;
    } catch (_e) {}
    return 'https://carelink.lomamo.org';
  },

  defaultEmailDomain() {
    const cfg = DB.db && DB.db.settings && DB.db.settings.org && DB.db.settings.org.emailDomain;
    return String(cfg || 'lomamo.example').replace(/^@+/, '').trim().toLowerCase() || 'lomamo.example';
  },

  /* Step 4 completion of 4-Step Live Host Setup:
     Establishes system & global organogram structures, configures Chief System Admin
     with mandatory password change on Official Sign-In, and enables "Activate System Globally". */
  async completeFourStepHostSetup({ orgNameVal, orgName, shortNameVal, shortName, emailDomain, loginUrl, portalUrl, primaryCounty, chiefName, chiefUsername, chiefPassword, chiefTempPassword, seedMode }) {
    const domain = String(emailDomain || 'lomamo.example').replace(/^@+/, '').trim().toLowerCase() || 'lomamo.example';
    const portal = String(loginUrl || portalUrl || this.defaultPortalUrl()).trim();
    const chiefUser = String(chiefUsername || 'chief.admin').trim().toLowerCase();
    const chiefFull = String(chiefName || 'Chief System Administrator').trim();
    const effectivePw = chiefPassword || chiefTempPassword || 'TempSetup#2026!';
    const effectiveOrg = orgNameVal || orgName || 'LOMAMO Foundation Kenya';
    const effectiveShort = shortNameVal || shortName || 'LOMAMO';

    DB.reset();
    const now = new Date();
    seedOfficial(DB.db, now, { patients: seedMode === 'empty' ? 0 : 3333, mustChange: true });

    let admin = (DB.db.users || []).find(u => u.username === chiefUser || u.roleId === 'chief');
    const cSalt = newSalt();
    const cHash = strongHash(effectivePw, cSalt);
    if (!admin) {
      admin = {
        id: 'u-chief', username: chiefUser, name: chiefFull, roleId: 'chief',
        departmentId: 'exec', countyId: primaryCounty || 'kisumu', areaIds: []
      };
      DB.db.users.unshift(admin);
    }
    admin.name = chiefFull;
    admin.username = chiefUser;
    admin.email = `${chiefUser}@${domain}`;
    admin.salt = cSalt;
    admin.hash = cHash;
    admin.status = 'pending_activation';
    admin.active = true;
    /* Chief System Administrator MUST change password right after signing in on Official Sign-In */
    admin.mustChange = true;
    admin.mustChangePassword = true;
    admin.dpaFirstLoginRequired = true;
    admin.demo = false;
    admin.execTeam = true;

    DB.db.settings = DB.db.settings || {};
    DB.db.settings.security = Object.assign({ loginAttempts: 6, passwordMinLength: 12, sessionLock: true }, DB.db.settings.security || {});
    DB.db.settings.idleMinutes = DB.db.settings.idleMinutes || 30;
    DB.db.settings.org = {
      name: effectiveOrg,
      shortName: effectiveShort,
      county: primaryCounty || 'kisumu',
      primaryCounty: primaryCounty || 'kisumu',
      emailDomain: domain,
      loginUrl: portal
    };
    DB.db.settings.onboarding = { complete: true, step: 4 };
    DB.db.settings.hostSetupComplete = true;
    DB.db.settings.awaitingGlobalActivation = true;
    DB.db.settings.globallyActivated = false;
    DB.db.meta = Object.assign({}, DB.db.meta || {}, {
      setupComplete: true,
      hostCommissionedAt: todayISO(),
      globallyActivated: false,
      label: 'Host Commissioned · Awaiting Global Activation'
    });
    AUDIT.append({
      actor: admin.id,
      action: 'system.host_setup_completed',
      entity: 'system',
      entityId: 'four-step-host-setup',
      detail: `4-Step Live Host Setup completed for ${DB.db.settings.org.name}. Returning to Official Sign-In for Chief Admin (${chiefUser}) password change & Global System Activation.`
    });
    DB.save();

    /* Synchronize live host setup state to Unified Online Site Database if reachable */
    try {
      await fetch('api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin: { name: chiefFull, username: chiefUser, email: admin.email, password: effectivePw, countyId: primaryCounty || 'kisumu', mustChange: true },
          org: DB.db.settings.org,
          awaitingGlobalActivation: true,
          globallyActivated: false,
          db: DB.db
        })
      });
    } catch (_e) {}

    if (typeof AUTH !== 'undefined' && AUTH.logout) AUTH.logout();
    return { ok: true, chiefUsername: chiefUser, chiefEmail: admin.email, loginUrl: portal };
  },

  /* Chief System Administrator clicks "Activate System Globally":
     Generates ALL organogram user accounts, official emails, usernames, login URL &
     one-time temporary passwords formatted for the Team WhatsApp Platform, and
     permanently removes all Demo / Setup elements from Landing and Sign-In. */
  async activateSystemGlobally(opts = {}) {
    const actor = (typeof SILENT_OVERRIDE !== 'undefined' && SILENT_OVERRIDE.realActor()) || AUTH.user;
    if (!actor || actor.roleId !== 'chief') {
      toast('Chief System Administrator Only', 'Only the Chief System Administrator can Activate System Globally.', 'err');
      return null;
    }
    const domain = String(opts.emailDomain || this.defaultEmailDomain()).replace(/^@+/, '').trim().toLowerCase() || 'lomamo.example';
    const portalUrl = String(opts.loginUrl || opts.portalUrl || this.defaultPortalUrl()).trim();
    const roster = (typeof OFFICIAL_ROSTER !== 'undefined' && Array.isArray(OFFICIAL_ROSTER)) ? OFFICIAL_ROSTER : [];

    DB.db.users = DB.db.users || [];
    const packRows = [];

    /* Ensure Chief Admin account is active, non-demo, and carries official email */
    actor.demo = false;
    actor.status = 'active';
    actor.active = true;
    actor.email = actor.email && actor.email.includes('@') ? actor.email.replace(/@.+$/, '@' + domain) : `${actor.username}@${domain}`;

    /* Provision / finalize every single organogram account (including applicable Secretaries, Deputies & Clerks) */
    for (let i = 0; i < roster.length; i++) {
      const r = roster[i];
      const uname = String(r.username || '').trim().toLowerCase();
      if (!uname || uname === String(actor.username || '').toLowerCase()) continue;

      let u = DB.db.users.find(x => String(x.username || '').toLowerCase() === uname);
      const cId = r.countyId !== undefined ? r.countyId : (r.county !== undefined ? r.county : 'kisumu');
      const deptId = r.dept || (roleObj(r.roleId) || {}).dept || 'admin';
      const jobTitle = r.job || r.title || (roleObj(r.roleId) || {}).name || r.roleId;
      const cleanName = String(r.name || (u && u.name) || uname).replace(/^Demo - /, '');
      const officialEmail = `${uname}@${domain}`;
      const tempPassword = this.generateStrongPassword(12);
      const salt = newSalt();
      const hash = strongHash(tempPassword, salt);

      if (!u) {
        u = {
          id: 'u-' + uname.replace(/[.]/g, '-'),
          username: uname,
          createdAt: todayISO()
        };
        DB.db.users.push(u);
      }
      u.name = cleanName;
      u.username = uname;
      u.email = officialEmail;
      u.roleId = r.roleId;
      u.departmentId = deptId;
      u.countyId = cId;
      u.areaIds = r.areas || u.areaIds || [];
      u.jobTitle = jobTitle;
      u.seatTier = r.seatTier || u.seatTier || 'staff';
      u.unconfirmed = Boolean(r.unconfirmed);
      if (r.permOverrides) u.permOverrides = r.permOverrides;
      u.demo = false;
      u.active = true;
      u.status = 'pending_activation';
      u.mustChange = true;
      u.mustChangePassword = true;
      u.dpaFirstLoginRequired = true;
      u.provisionedAt = todayISO();
      u.loginUrl = portalUrl;
      u.salt = salt;
      u.hash = hash;

      const deptLabel = (typeof deptName === 'function' ? deptName(deptId) : deptId) || 'Foundation';
      const countyLabel = cId ? countyName(cId) : 'Head Office (All Counties)';
      const roleLabel = (roleObj(u.roleId) || {}).name || u.roleId;

      packRows.push({
        name: cleanName,
        username: uname,
        email: officialEmail,
        loginUrl: portalUrl,
        tempPassword,
        role: roleLabel,
        department: deptLabel,
        seatTier: u.seatTier,
        county: countyLabel,
        whatsappBlock:
          `*${cleanName}*\n` +
          `• Seat / Role: ${jobTitle} (${countyLabel})\n` +
          `• Portal URL: ${portalUrl}\n` +
          `• Username: \`${uname}\`  |  Official Email: \`${officialEmail}\`\n` +
          `• Temporary Password: \`${tempPassword}\`\n` +
          `• Activation: Sign in at the Portal URL and set your private 12+ character password to activate your account.`,
        smsText: `CareLink C-DIMS (${portalUrl}): ${cleanName} | Username: ${uname} | Email: ${officialEmail} | Temp Password: ${tempPassword} — Sign in & change password to activate your account.`
      });
    }

    /* Strip any leftover demo flags on non-roster accounts */
    (DB.db.users || []).forEach(u => { u.demo = false; });

    DB.db.settings = DB.db.settings || {};
    DB.db.settings.org = Object.assign({}, DB.db.settings.org || {}, {
      emailDomain: domain,
      loginUrl: portalUrl
    });
    DB.db.settings.globallyActivated = true;
    DB.db.settings.globallyActivatedAt = todayISO();
    DB.db.settings.globallyActivatedBy = actor.username;
    DB.db.settings.awaitingGlobalActivation = false;
    DB.db.meta = Object.assign({}, DB.db.meta || {}, {
      globallyActivated: true,
      globallyActivatedAt: todayISO(),
      demoDisabled: true,
      productionMode: true,
      label: 'Globally Activated Official Production System'
    });
    if (typeof APPX !== 'undefined' && APPX.host) {
      APPX.host.globallyActivated = true;
    }

    AUDIT.append({
      actor: actor.id,
      action: 'system.activated_globally',
      entity: 'system',
      entityId: 'global-activation',
      detail: `Chief System Admin (${actor.username}) activated CareLink globally across ${packRows.length + 1} organogram accounts (@${domain}); demo & host-setup screens permanently removed.`
    });
    DB.save();

    /* Push global activation + salted user vault to Unified Online Site Database if online */
    try {
      const tok = (typeof SYNC !== 'undefined' && (SYNC.sessionToken || SYNC.token)) ? (SYNC.sessionToken || SYNC.token) : '';
      await fetch('api/setup/activate-global', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { 'X-CareLink-Session': tok } : {}),
        body: JSON.stringify({
          emailDomain: domain,
          loginUrl: portalUrl,
          activatedBy: actor.username,
          users: DB.db.users,
          settings: DB.db.settings,
          meta: DB.db.meta
        })
      });
    } catch (_e) {}

    /* Build formatted Team WhatsApp Broadcast Sheet grouped by Department */
    const byDept = {};
    packRows.forEach(r => {
      (byDept[r.department] = byDept[r.department] || []).push(r);
    });
    const orgTitle = (DB.db.settings.org && DB.db.settings.org.name) || 'LOMAMO Foundation Kenya';
    const waLines = [
      `*==================================================*`,
      `*CARELINK C-DIMS — OFFICIAL GLOBAL ACTIVATION SHEET*`,
      `*${orgTitle}*`,
      `*==================================================*`,
      `Portal Login URL: ${portalUrl}`,
      `Activated By: ${actor.name} (${actor.username})`,
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      ``,
      `*HOW EACH STAFF MEMBER ACTIVATES THEIR ACCOUNT:*`,
      `1. Open ${portalUrl} and sign in on the Official Sign-In screen using your *Username* (or *Official Email*) and *Temporary Password* below.`,
      `2. CareLink immediately prompts you to set your own private 12+ character password known ONLY to you.`,
      `3. Once saved, your individual account status becomes *Activated* automatically.`,
      `4. Forgot password or new county staff? Use *Request / Recover* on Sign-In (routed urgently to your County Office Admin).`,
      ``
    ];
    Object.keys(byDept).forEach(dept => {
      waLines.push(`*--------------------------------------------------*`);
      waLines.push(`*DEPARTMENT: ${dept.toUpperCase()} (${byDept[dept].length} accounts)*`);
      waLines.push(`*--------------------------------------------------*`);
      byDept[dept].forEach((r, idx) => {
        waLines.push(`${idx + 1}. ${r.whatsappBlock}`);
        waLines.push(``);
      });
    });

    this.lastWhatsappSheet = waLines.join('\n');
    this.lastPack = {
      ok: true,
      generatedAt: todayISO(),
      chiefUsername: actor.username,
      emailDomain: domain,
      siteUrl: portalUrl,
      count: packRows.length,
      rows: packRows,
      pack: packRows,
      whatsappText: this.lastWhatsappSheet
    };
    return this.lastPack;
  },

  downloadWhatsappTxt() {
    const p = this.lastPack;
    if (!p || !p.rows.length) return toast('Activate System Globally first', 'Generate the organogram WhatsApp credential sheet first.', 'warn');
    download('CareLink-Official-WhatsApp-Activation-Sheet-' + todayISO().slice(0, 10) + '.txt', p.whatsappText || this.lastWhatsappSheet, 'text/plain;charset=utf-8');
  },

  async copyWhatsappSheet() {
    const txt = (this.lastPack && this.lastPack.whatsappText) || this.lastWhatsappSheet;
    if (!txt) return toast('No WhatsApp sheet in memory', 'Click Activate System Globally first.', 'warn');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(txt);
        toast('Copied for Team WhatsApp Platform', `${this.lastPack.count} organogram accounts copied — paste directly into official LOMAMO WhatsApp dispatches.`, 'ok');
        return;
      }
    } catch (_e) {}
    this.downloadWhatsappTxt();
  },

  globalActivationBannerHTML(user) {
    if (!user || user.roleId !== 'chief') return '';
    if (this.isGloballyActivated()) {
      return `<div class="card" style="margin-bottom:14px;padding:12px 16px;border-left:4px solid var(--ok);background:var(--surface)">
        <div class="spread" style="gap:12px;flex-wrap:wrap">
          <div class="row" style="gap:10px">
            ${badge('System Globally Activated', 'b-ok')}
            <span class="small">Official mode locked — all Demo &amp; Live Host Setup options have been permanently removed from Landing &amp; Sign-In. Individual staff activate their accounts on first login.</span>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${this.lastPack ? `<button class="btn btn-xs btn-primary" data-act="copy-whatsapp-pack">${ic('send',12)} Copy WhatsApp Sheet (${this.lastPack.count})</button>
              <button class="btn btn-xs btn-ghost" data-act="dl-whatsapp-txt">${ic('download',12)} WhatsApp .TXT</button>
              <button class="btn btn-xs btn-ghost" data-act="dev-dl-sms-csv">${ic('download',12)} Master .CSV</button>` : `<button class="btn btn-xs btn-ghost" data-act="open-global-activate">${ic('key',12)} Re-issue Unclaimed WhatsApp Sheet</button>`}
          </div>
        </div>
      </div>`;
    }
    return `<div class="card" style="margin-bottom:16px;padding:16px 20px;border:2px solid #D97706;background:linear-gradient(135deg, rgba(245,158,11,.12), rgba(15,118,110,.08))">
      <div class="spread" style="gap:16px;flex-wrap:wrap;align-items:center">
        <div style="flex:1;min-width:260px">
          <div class="xs bold" style="text-transform:uppercase;letter-spacing:.09em;color:#B45309;margin-bottom:4px">${ic('sparkles',13)} Final Commissioning Step · Chief System Administrator Authority</div>
          <div style="font-size:16.5px;font-weight:800;margin-bottom:4px">Ready to Activate CareLink C-DIMS Globally Across All LOMAMO Departments</div>
          <div class="small muted">Generates every organogram account name, official email, username, login URL &amp; one-time password formatted for your <b>Team WhatsApp Platform</b>, requires each user to self-activate by changing their password on first login, and <b>permanently removes all Demo &amp; Host Setup UI</b> from Landing and Sign-In.</div>
        </div>
        <button class="btn btn-primary" style="padding:11px 20px;font-weight:800" data-act="open-global-activate">${ic('shieldcheck',16)} Activate System Globally</button>
      </div>
    </div>`;
  },

  openGlobalActivateModal() {
    const actor = (typeof SILENT_OVERRIDE !== 'undefined' && SILENT_OVERRIDE.realActor()) || AUTH.user;
    if (!actor || actor.roleId !== 'chief') return toast('Chief System Administrator Only', '', 'err');
    const pack = this.lastPack;
    const rosterCount = (typeof OFFICIAL_ROSTER !== 'undefined' ? OFFICIAL_ROSTER.length : 0);
    openModal({
      title: this.isGloballyActivated() ? 'Official Team WhatsApp Activation Sheet' : 'Activate CareLink System Globally',
      sub: `${orgName()} · Complete Organogram Provisioning & Permanent Demo Removal`,
      wide: true,
      body: `<form id="globalActivateForm">
        <div class="grid g2" style="gap:12px;margin-bottom:12px">
          <div class="field"><label>Official Staff Email Domain *</label>
            <input class="input mono" name="emailDomain" value="${esc(this.defaultEmailDomain())}" placeholder="e.g. lomamofoundation.org" required>
            <div class="hint">Every organogram seat receives <code>username@domain</code> alongside their username.</div>
          </div>
          <div class="field"><label>Official System Login URL *</label>
            <input class="input mono" name="loginUrl" value="${esc(this.defaultPortalUrl())}" required>
            <div class="hint">Included on every staff member's WhatsApp dispatch block.</div>
          </div>
        </div>
        <div class="alert info" style="margin-bottom:12px">${ic('shield',16)}<div>
          <b>What happens when you click Activate System Globally:</b>
          <div class="small" style="margin-top:4px">1. All <b>${num(rosterCount)} organogram accounts</b> (Leadership, County Admins, Area Coordinators, Caregivers, Clinicians, Hospital Desk, Finance, Procurement, Media, HR, Audit, ICT, plus applicable Secretaries, Deputies &amp; Clerks) receive official emails &amp; unique temporary passwords.<br>
          2. Each staff member activates their own account upon logging in and setting their private password.<br>
          3. All Demo tabs, "Explore demo accounts", and "Live host setup" links are <b>permanently removed</b> from Landing &amp; Sign-In.</div>
        </div></div>
        ${pack && pack.whatsappText ? `<div class="field">
          <label>Ready-to-Share Team WhatsApp Credential Sheet (${num(pack.count)} staff accounts)</label>
          <textarea class="input mono" rows="10" readonly style="font-size:11.5px;line-height:1.45">${esc(pack.whatsappText)}</textarea>
        </div>` : ''}
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="close-modal">Close</button>
        ${pack ? `<button class="btn btn-ghost" data-act="dl-whatsapp-txt">${ic('download',14)} Download WhatsApp (.txt)</button>
          <button class="btn btn-ghost" data-act="dev-dl-sms-csv">${ic('download',14)} Download Master (.csv)</button>
          <button class="btn btn-primary" data-act="copy-whatsapp-pack">${ic('send',14)} Copy for Team WhatsApp</button>`
        : `<button class="btn btn-primary" data-act="exec-global-activate">${ic('shieldcheck',15)} Confirm &amp; Activate System Globally</button>`}`
    });
  },

  generateStrongPassword(len = 14) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const syms = '@#%&*+=?';
    const all = upper + lower + digits + syms;
    const rnd = (max) => {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0] % max;
      }
      return Math.floor(Math.random() * max);
    };
    const chars = [
      upper[rnd(upper.length)],
      upper[rnd(upper.length)],
      lower[rnd(lower.length)],
      lower[rnd(lower.length)],
      digits[rnd(digits.length)],
      digits[rnd(digits.length)],
      syms[rnd(syms.length)],
      syms[rnd(syms.length)]
    ];
    while (chars.length < len) chars.push(all[rnd(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      const t = chars[i]; chars[i] = chars[j]; chars[j] = t;
    }
    return chars.join('');
  },

  validatePrivacyPassword(pw, user, currentPw = '') {
    const s = String(pw || '');
    if (s.length < 12) return 'Password must be at least 12 characters long under CareLink Data Protection standards.';
    if (!/[A-Z]/.test(s)) return 'Include at least one uppercase letter (A–Z).';
    if (!/[a-z]/.test(s)) return 'Include at least one lowercase letter (a–z).';
    if (!/[0-9]/.test(s)) return 'Include at least one number (0–9).';
    if (!/[^A-Za-z0-9]/.test(s)) return 'Include at least one special symbol (e.g. @ # % & * ! ?).';
    if (/lomamo2026|password|123456|qwerty|carelink/i.test(s)) return 'Do not use a known default, organisation name or common sequence.';
    if (currentPw && s === currentPw) return 'Your personal password must be completely different from the temporary SMS password.';
    if (user) {
      const uname = String(user.username || '').toLowerCase();
      if (uname && uname.length >= 3 && s.toLowerCase().includes(uname)) {
        return 'Password must not contain your username.';
      }
      const parts = String(user.name || '').toLowerCase().split(/\s+/).filter(p => p.length >= 4);
      for (const p of parts) {
        if (s.toLowerCase().includes(p)) return 'Password must not contain parts of your personal name.';
      }
    }
    return '';
  },

  async provisionProductionPack({ adminName, adminUsername, adminPassword, orgNameVal, shortNameVal, primaryCounty, seedMode }) {
    const roster = (typeof OFFICIAL_ROSTER !== 'undefined' && Array.isArray(OFFICIAL_ROSTER)) ? OFFICIAL_ROSTER : [];
    const chiefUser = String(adminUsername || 'chief.admin').trim().toLowerCase();
    const chiefName = String(adminName || 'Chief System Administrator').trim();

    /* Build fresh or reference DB */
    const db = DB.blank();
    if (seedMode === 'reference' && typeof seedOfficial === 'function') {
      seedOfficial(db, new Date(), { patients: 3333, mustChange: true });
    }
    db.meta = Object.assign({}, db.meta || {}, {
      setupComplete: true,
      commissionedAt: todayISO(),
      productionMode: true,
      demoSeeded: seedMode === 'reference',
      label: seedMode === 'reference' ? 'Production Commissioned + Reference Dataset' : 'Production Live Register',
      onlineDatabase: true
    });
    db.settings = db.settings || {};
    db.settings.org = {
      name: orgNameVal || 'Loving Hands Management & Medical Organization',
      shortName: shortNameVal || 'LOMAMO',
      county: primaryCounty || 'kisumu',
      primaryCounty: primaryCounty || 'kisumu'
    };
    db.settings.onboarding = { complete: true, step: 9 };
    db.settings.ai = Object.assign({}, db.settings.ai || {}, { enabled: true, provider: 'online' });

    const packRows = [];
    const provisionedUsers = [];

    /* 1. Chief System Administrator (personal password set during setup) */
    const chiefSalt = newSalt();
    const chiefHash = strongHash(adminPassword, chiefSalt);
    const chiefRec = {
      id: 'u-chief',
      username: chiefUser,
      name: chiefName,
      roleId: 'chief',
      departmentId: 'exec',
      countyId: primaryCounty || 'kisumu',
      areaIds: [],
      jobTitle: 'Chief System Administrator',
      status: 'active',
      active: true,
      mustChange: false,
      mustChangePassword: false,
      passwordSetAt: todayISO(),
      salt: chiefSalt,
      hash: chiefHash,
      createdAt: todayISO()
    };
    provisionedUsers.push(chiefRec);

    /* 2. Generate unique strong SMS temporary passwords for every roster account */
    for (let i = 0; i < roster.length; i++) {
      const r = roster[i];
      if (String(r.username || '').toLowerCase() === chiefUser) continue;
      const tempPassword = this.generateStrongPassword(14);
      const salt = newSalt();
      const hash = strongHash(tempPassword, salt);
      const cId = r.countyId !== undefined ? r.countyId : (r.county !== undefined ? r.county : 'kisumu');
      const uRec = {
        id: 'u-' + String(r.username).replace(/[.]/g, '-'),
        username: String(r.username).toLowerCase(),
        name: r.name,
        roleId: r.roleId,
        departmentId: r.dept || (roleObj(r.roleId) || {}).dept || 'admin',
        countyId: cId,
        areaIds: r.areas || [],
        jobTitle: r.job || r.title || (roleObj(r.roleId) || {}).name || r.roleId,
        status: 'active',
        active: true,
        mustChange: true,
        mustChangePassword: true,
        dpaFirstLoginRequired: true,
        provisionedAt: todayISO(),
        salt,
        hash,
        createdAt: todayISO()
      };
      provisionedUsers.push(uRec);
      packRows.push({
        name: uRec.name,
        username: uRec.username,
        tempPassword,
        role: (roleObj(uRec.roleId) || {}).name || uRec.roleId,
        county: uRec.countyId ? countyName(uRec.countyId) : 'Head Office (All Counties)',
        smsText: `CareLink C-DIMS (${db.settings.org.shortName}): Hello ${uRec.name}, your account is ready at ${location.origin}. Username: ${uRec.username} | One-Time Password: ${tempPassword} . On first sign-in you will set your private password known only to you.`
      });
    }

    db.users = provisionedUsers;
    DB.db = db;
    AUDIT.append({
      actor: chiefRec.id,
      action: 'system.production_commissioned',
      entity: 'system',
      entityId: 'first-run',
      detail: `Commissioned Chief System Admin (${chiefUser}) and generated ${packRows.length} unique SMS staff credentials with mandatory first-login privacy password change.`
    });
    DB.save();

    /* Also push credentials & state to the Unified Online Site Database if reachable */
    try {
      const resp = await fetch('api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin: { name: chiefName, username: chiefUser, password: adminPassword, countyId: primaryCounty || 'kisumu' },
          org: db.settings.org,
          roster: roster.filter(r => String(r.username || '').toLowerCase() !== chiefUser),
          state: db,
          db
        })
      });
      if (resp.ok) {
        const j = await resp.json().catch(() => ({}));
        if (Array.isArray(j.credentialsPack) && j.credentialsPack.length) {
          packRows.length = 0;
          j.credentialsPack.forEach(cp => {
            const match = db.users.find(u => u.username === String(cp.username).toLowerCase());
            if (match && cp.tempPassword) {
              match.salt = newSalt();
              match.hash = strongHash(cp.tempPassword, match.salt);
            }
            packRows.push({
              name: cp.name,
              username: cp.username,
              tempPassword: cp.tempPassword,
              role: (roleObj(cp.roleId) || {}).name || cp.role || cp.roleId,
              county: cp.countyId ? countyName(cp.countyId) : 'Head Office (All Counties)',
              smsText: cp.smsText || `CareLink C-DIMS: Hello ${cp.name}, sign in at ${location.origin} | Username: ${cp.username} | One-Time Password: ${cp.tempPassword} . Set your own private password on first login.`
            });
          });
          DB.save();
        }
      }
    } catch (_e) { /* Offline/static fallback keeps local salted vault */ }

    this.lastPack = {
      generatedAt: todayISO(),
      chiefUsername: chiefUser,
      siteUrl: location.origin,
      count: packRows.length,
      rows: packRows
    };
    return { chiefRec, pack: this.lastPack };
  },

  async regeneratePackForMustChangeUsers() {
    const actor = SILENT_OVERRIDE.realActor() || AUTH.user;
    if (!actor || actor.roleId !== 'chief') {
      toast('Chief System Administrator Only', 'Only the Chief System Administrator may generate an initial SMS credential pack.', 'err');
      return null;
    }
    const targets = (DB.db.users || []).filter(u => u.id !== actor.id && (u.mustChange || u.mustChangePassword || u.demo || !u.lastLogin));
    if (!targets.length) {
      toast('All accounts already personalised', 'Every active user has already set their private password. Use per-user reset in Users & Accounts if an individual forgot theirs.', 'info');
      return null;
    }
    const packRows = [];
    for (const u of targets) {
      const tempPassword = this.generateStrongPassword(14);
      const salt = newSalt();
      u.salt = salt;
      u.hash = strongHash(tempPassword, salt);
      u.demo = false;
      u.mustChange = true;
      u.mustChangePassword = true;
      u.dpaFirstLoginRequired = true;
      const cleanName = u.name.replace(/^Demo - /, '');
      packRows.push({
        name: cleanName,
        username: u.username,
        tempPassword,
        role: (roleObj(u.roleId) || {}).name || u.roleId,
        county: u.countyId ? countyName(u.countyId) : 'Head Office (All Counties)',
        smsText: `CareLink C-DIMS: Hello ${cleanName}, sign in at ${location.origin} | Username: ${u.username} | One-Time Password: ${tempPassword} . You will set your own private password on first login.`
      });
    }
    /* Sync new temporary passwords to online cloud vault if online */
    try {
      const tok = (typeof SYNC !== 'undefined' && (SYNC.sessionToken || SYNC.token)) ? (SYNC.sessionToken || SYNC.token) : '';
      const resp = await fetch('api/credentials/provision', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { 'X-CareLink-Session': tok } : {}),
        body: JSON.stringify({ roster: targets.map(u => ({ id: u.id, username: u.username, name: u.name.replace(/^Demo - /, ''), roleId: u.roleId, departmentId: u.departmentId, countyId: u.countyId, areaIds: u.areaIds, jobTitle: u.jobTitle })) })
      });
      if (resp.ok) {
        const j = await resp.json().catch(() => ({}));
        const srvList = j.credentialsPack || j.issued || [];
        if (srvList.length) {
          packRows.length = 0;
          srvList.forEach(cp => {
            const pw = cp.tempPassword || cp.password;
            const match = targets.find(t => t.username === String(cp.username).toLowerCase());
            if (match && pw) {
              match.salt = newSalt();
              match.hash = strongHash(pw, match.salt);
            }
            packRows.push({
              name: cp.name,
              username: cp.username,
              tempPassword: pw,
              role: cp.roleName || (roleObj(cp.roleId) || {}).name || cp.roleId || '',
              county: cp.county || (cp.countyId ? countyName(cp.countyId) : 'Head Office'),
              smsText: cp.smsText || `CareLink C-DIMS: Hello ${cp.name}, sign in at ${location.origin} | Username: ${cp.username} | One-Time Password: ${pw} . Set your own private password on first login.`
            });
          });
        }
      }
    } catch (_e) {}

    AUDIT.append({
      actor: actor.id,
      action: 'system.sms_credential_pack_generated',
      entity: 'users',
      entityId: String(packRows.length),
      detail: `Generated one-time SMS credential pack for ${packRows.length} account(s); first-login private password enforced.`
    });
    DB.save();
    this.lastPack = { generatedAt: todayISO(), chiefUsername: actor.username, siteUrl: location.origin, count: packRows.length, rows: packRows };
    return this.lastPack;
  },

  downloadCSV() {
    const p = this.lastPack;
    if (!p || !p.rows.length) return toast('No active pack in memory', 'Generate a credential sheet first.', 'warn');
    const escCsv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Full Name / Organogram Seat', 'Username', 'Official Email', 'Portal Login URL', 'One-Time Temporary Password', 'Assigned Role', 'Department', 'Office / County', 'WhatsApp / SMS Dispatch'].map(escCsv).join(','),
      ...p.rows.map(r => [r.name, r.username, r.email || `${r.username}@${this.defaultEmailDomain()}`, r.loginUrl || p.siteUrl || this.defaultPortalUrl(), r.tempPassword, r.role, r.department || '', r.county, r.whatsappBlock || r.smsText].map(escCsv).join(','))
    ];
    download('CareLink-Official-Organogram-Credentials-' + todayISO().slice(0, 10) + '.csv', lines.join('\r\n'), 'text/csv;charset=utf-8');
  },

  downloadSMSText() {
    const p = this.lastPack;
    if (!p || !p.rows.length) return toast('No active pack in memory', 'Generate a one-time SMS credential pack first.', 'warn');
    const body = [
      '====================================================================',
      'CARELINK C-DIMS — CONFIDENTIAL ONE-TIME SMS CREDENTIAL DISPATCH PACK',
      'Generated: ' + p.generatedAt + ' | Portal: ' + p.siteUrl,
      'PRIVACY NOTICE (DPA 2019): Every user is forced on first login to',
      'replace this temporary password with a private password known ONLY',
      'to themselves. Delete this file after sending individual SMS texts.',
      '====================================================================',
      '',
      ...p.rows.map((r, i) => `[${i + 1}] ${r.name} (${r.role} · ${r.county})\nSMS -> ${r.smsText}\n`)
    ].join('\r\n');
    download('CareLink-SMS-Dispatch-' + todayISO().slice(0, 10) + '.txt', body, 'text/plain;charset=utf-8');
  }
};

/* ---------------- 2. Chief Admin Audited Silent Override ---------------- */
const SILENT_OVERRIDE = {
  state: null, /* { active:true, realAdmin, targetId, targetUsername, targetRole, startedAt, reason, viewsVisited:[] } */

  isActive() {
    return Boolean(this.state && this.state.active && this.state.realAdmin);
  },

  realActor() {
    return this.isActive() ? this.state.realAdmin : AUTH.user;
  },

  canOverride(user) {
    const real = this.isActive() ? this.state.realAdmin : user;
    return Boolean(real && real.roleId === 'chief' && RBAC.has(real, 'system.override.silent'));
  },

  async enter(targetUserId, reasonInput = '') {
    const real = this.realActor();
    if (!this.canOverride(real)) {
      toast('Chief System Administrator Only', 'Silent workspace override is restricted to the Chief System Administrator.', 'err');
      return false;
    }
    const target = (DB.db.users || []).find(u => u.id === targetUserId);
    if (!target) {
      toast('Account not found', 'Could not locate target user account.', 'err');
      return false;
    }
    if (target.id === real.id) {
      toast('Already in Chief Admin account', 'Select a different staff account to inspect.', 'info');
      return false;
    }
    const reason = String(reasonInput || 'Workspace & role-navigation verification by Chief System Administrator').trim();

    this.state = {
      active: true,
      realAdmin: real,
      targetId: target.id,
      targetName: target.name,
      targetUsername: target.username,
      targetRole: (roleObj(target.roleId) || {}).name || target.roleId,
      startedAt: todayISO(),
      reason,
      viewsVisited: ['home']
    };

    /* Switch active session lens to target user WITHOUT notifying or alerting target user */
    AUTH.user = target;
    APPX.view = 'home';
    APPX.params = {};

    /* Record complete, tamper-evident system audit entry (local + online server) */
    AUDIT.append({
      actor: real.id,
      action: 'system.silent_override.start',
      entity: 'user',
      entityId: target.id,
      detail: `Chief System Admin (${real.username}) entered silent workspace & left-nav override for ${target.username} (${this.state.targetRole}). Target user not notified. Reason: ${reason}`
    });
    DB.save();

    try {
      const tok = (typeof SYNC !== 'undefined' && SYNC.token) ? SYNC.token : '';
      fetch('api/admin/silent-override', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { 'X-CareLink-Session': tok } : {}),
        body: JSON.stringify({ phase: 'start', targetUserId: target.id, targetUsername: target.username, targetRole: target.roleId, reason })
      }).catch(() => {});
    } catch (_e) {}

    render();
    return true;
  },

  recordView(viewId) {
    if (!this.isActive() || !viewId) return;
    if (!this.state.viewsVisited.includes(viewId)) {
      this.state.viewsVisited.push(viewId);
      AUDIT.append({
        actor: this.state.realAdmin.id,
        action: 'system.silent_override.view',
        entity: 'view',
        entityId: viewId,
        detail: `Silent override as ${this.state.targetUsername}: inspected view '${viewId}'`
      });
    }
  },

  exit() {
    if (!this.isActive()) return;
    const st = this.state;
    const real = st.realAdmin;
    this.state = null;
    AUTH.user = real;
    AUDIT.append({
      actor: real.id,
      action: 'system.silent_override.end',
      entity: 'user',
      entityId: st.targetId,
      detail: `Chief System Admin (${real.username}) exited silent override of ${st.targetUsername}. Views inspected: ${st.viewsVisited.join(', ')}`
    });
    DB.save();

    try {
      const tok = (typeof SYNC !== 'undefined' && SYNC.token) ? SYNC.token : '';
      fetch('api/admin/silent-override', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { 'X-CareLink-Session': tok } : {}),
        body: JSON.stringify({ phase: 'end', targetUserId: st.targetId, targetUsername: st.targetUsername, reason: 'Visited: ' + st.viewsVisited.join(', ') })
      }).catch(() => {});
    } catch (_e) {}

    APPX.view = 'devconsole';
    APPX.params = { tab: 'override' };
    render();
  },

  bannerHTML() {
    if (!this.isActive()) return '';
    const st = this.state;
    return `<div class="override-bar no-print" role="region" aria-label="Silent Administrator Override Active">
      <span class="ovb-badge">${ic('shield', 14)} SILENT OVERRIDE · AUDITED</span>
      <span class="ovb-text">Viewing customized workspace &amp; left navigation as <b>${esc(st.targetName.replace(/^Demo - /, ''))}</b> (${esc(st.targetRole)} · <code style="color:inherit">${esc(st.targetUsername)}</code>) — <i>User is not notified; session logged to System Audit Trail.</i></span>
      <div class="ovb-actions">
        <button class="btn btn-xs ovb-btn-primary" data-act="silent-override-exit">${ic('lock', 12)} Return to Chief System Admin</button>
      </div>
    </div>`;
  }
};

/* ---------------- 2b. System Administrator Version Control Engine ---------------- */
const VERSION_CONTROL = {
  RELEASES: [
    { tag:'v6.6.0', date:'2026-10-24', channel:'Production Stable', schema:63, author:'CareLink OS Core Engineering',
      summary:'Official CareLink C-DIMS PDCA 120-Day & Discharge Engine, AI Monday Meeting Processor & Secretary Desk, Baseline-Anchored Charts, Dominant Dept Banners, Installable Font/Theme Packs, Tablet Foundation Default & System Admin Version Control.' },
    { tag:'v6.5.0', date:'2026-10-23', channel:'Production', schema:63, author:'CareLink OS Core Engineering',
      summary:'Global System Activation & WhatsApp Credential Sheet, Urgent County Sign-In Routing, CareLink AI Workflow Engine, Executive Sitting Console, C-DIMS Coins & Expenditure-vs-Budget Boards.' },
    { tag:'v6.4.0', date:'2026-10-22', channel:'Production', schema:63, author:'CareLink OS Core Engineering',
      summary:'County Admin Daily PAYG, Weekly Suppliers, 9th Statutory Deductions, Operational Expenses, Kisumu HQ Kenya Reports, Dedicated Dev Console & Audited Silent Override.' },
    { tag:'v6.3.0', date:'2026-10-21', channel:'Production', schema:63, author:'CareLink OS Core Engineering',
      summary:'3,333 Complete Beneficiary Longitudinal Records (12+ visits), Child Growth Curves, MCM SOAP Console, Hard-Copy Intake Scans, Monday Meeting & 4-Tier Procurement.' },
    { tag:'v6.0.0', date:'2026-10-15', channel:'Foundation Baseline', schema:60, author:'LOMAMO Foundation ICT',
      summary:'Unified CareLink C-DIMS Operating System across 10 Ministry Areas, Kisumu & Homa Bay County Offices, and PBKDF2-SHA256 Zero-Knowledge Vault.' }
  ],

  ensureStore(){
    if(!DB.db) return;
    DB.db.versionControl = DB.db.versionControl || { snapshots: [] };
    if(!Array.isArray(DB.db.versionControl.snapshots)) DB.db.versionControl.snapshots = [];
    if(!DB.db.versionControl.snapshots.length){
      DB.db.versionControl.snapshots.push({
        id: 'vcs-init-660',
        tag: `v${APP.version}-baseline`,
        category: 'System Release Baseline',
        message: 'Initial CareLink v6.6.0 verified configuration & RBAC baseline checkpoint.',
        author: 'Chief System Administrator',
        createdAt: todayISO(),
        checksum: this.computeChecksum(),
        counts: this.captureCounts(),
        configSnapshot: this.captureConfig()
      });
    }
  },

  captureConfig(){
    const s = (DB.db && DB.db.settings) || {};
    return JSON.parse(JSON.stringify({
      consoleTheme: s.consoleTheme || 'foundation',
      consoleThemeExplicit: Boolean(s.consoleThemeExplicit),
      density: s.density || 'comfortable',
      accentMode: s.accentMode || 'department',
      programme: s.programme || { defaultDays: 90, maxDays: 120, reviewCadence: 30 },
      security: s.security || { loginAttempts: 6, passwordMinLength: 12, sessionLock: true },
      installedVisualPacks: s.installedVisualPacks || [],
      customRoles: (DB.db && DB.db.customRoles) || []
    }));
  },

  captureCounts(){
    const db = DB.db || {};
    return {
      users: (db.users||[]).length,
      patients: (db.patients||[]).length,
      visits: (db.visits||[]).length,
      customRoles: (db.customRoles||[]).length,
      visualPacks: (db.settings && db.settings.installedVisualPacks || []).length,
      auditEntries: (db.audit||[]).length
    };
  },

  computeChecksum(){
    const raw = JSON.stringify(this.captureConfig());
    let h = 2166136261;
    for(let i=0;i<raw.length;i++){
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'sha-' + (h >>> 0).toString(16).padStart(8,'0');
  },

  commitSnapshot({ tag, category, message }, actor){
    this.ensureStore();
    const cleanTag = String(tag || `v${APP.version}-cp${DB.db.versionControl.snapshots.length+1}`).trim();
    const snap = {
      id: uid('vcs'),
      tag: cleanTag,
      category: category || 'Configuration Checkpoint',
      message: String(message || 'System Administrator configuration checkpoint').trim(),
      author: (actor && actor.name ? actor.name.replace(/^Demo - /,'') : 'Chief System Administrator'),
      createdAt: new Date().toISOString(),
      checksum: this.computeChecksum(),
      counts: this.captureCounts(),
      configSnapshot: this.captureConfig()
    };
    DB.db.versionControl.snapshots.unshift(snap);
    AUDIT.append({
      actor: (actor && actor.id) || 'system',
      action: 'system.vcs.checkpoint_created',
      entity: 'version_control',
      entityId: snap.tag,
      detail: `[${snap.category}] ${snap.message} (checksum ${snap.checksum})`
    });
    DB.save();
    return snap;
  },

  diffAgainstLive(snapId){
    this.ensureStore();
    const snap = DB.db.versionControl.snapshots.find(s=>s.id===snapId);
    if(!snap) return [];
    const live = this.captureConfig();
    const old = snap.configSnapshot || {};
    const keys = ['consoleTheme','density','accentMode','programme','security','customRoles','installedVisualPacks'];
    return keys.map(k=>{
      const a = JSON.stringify(old[k]);
      const b = JSON.stringify(live[k]);
      return { key:k, changed: a !== b, snapshotVal: a, liveVal: b };
    });
  },

  rollbackConfig(snapId, actor){
    this.ensureStore();
    const snap = DB.db.versionControl.snapshots.find(s=>s.id===snapId);
    if(!snap || !snap.configSnapshot) return { ok:false, msg:'Checkpoint snapshot not found.' };
    const cfg = JSON.parse(JSON.stringify(snap.configSnapshot));
    DB.db.settings = DB.db.settings || {};
    DB.db.settings.consoleTheme = cfg.consoleTheme || 'foundation';
    DB.db.settings.consoleThemeExplicit = Boolean(cfg.consoleThemeExplicit);
    DB.db.settings.density = cfg.density || 'comfortable';
    DB.db.settings.accentMode = cfg.accentMode || 'department';
    if(cfg.programme) DB.db.settings.programme = cfg.programme;
    if(cfg.security) DB.db.settings.security = cfg.security;
    DB.db.settings.installedVisualPacks = cfg.installedVisualPacks || [];
    DB.db.customRoles = cfg.customRoles || [];
    AUDIT.append({
      actor: (actor && actor.id) || 'system',
      action: 'system.vcs.rollback_executed',
      entity: 'version_control',
      entityId: snap.tag,
      detail: `Restored configuration & role state from checkpoint ${snap.tag} (${snap.checksum}). Patient clinical data preserved untouched.`
    });
    DB.save();
    if(typeof applyTheme === 'function') applyTheme();
    return { ok:true, snap };
  }
};

/* ---------------- 3. Dedicated Development Console ---------------- */
const DEV_CONSOLE_STATE = {
  tab: 'telemetry',
  cloudStatus: null,
  probing: false,
  searchUser: '',
  overrideReason: 'Routine workspace & role-navigation audit verification'
};

const DEV_CONSOLE = {
  canAccess(user) {
    const real = SILENT_OVERRIDE.realActor() || user;
    return Boolean(real && RBAC.has(real, 'dev.console'));
  },

  async probeCloud() {
    DEV_CONSOLE_STATE.probing = true;
    render();
    const out = { checkedAt: todayISO(), bootstrapOk: false, storageMode: 'browser-indexeddb', rev: DB.db?.meta?.rev || 1, aiOk: false, aiProvider: 'offline-fallback', aiModel: '-' };
    try {
      const r = await fetch('api/bootstrap', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        out.bootstrapOk = true;
        out.storageMode = j.storageMode || (j.onlineDatabase ? 'online-site-db' : 'lan-sqlite-wal');
        out.rev = j.rev ?? out.rev;
        out.accounts = j.accounts ?? (DB.db.users || []).length;
        out.setup = Boolean(j.setup);
      }
    } catch (_e) {}
    try {
      const a = await AI.probe();
      out.aiOk = Boolean(a.ok);
      out.aiProvider = a.provider || (a.ok ? 'online-cloud' : 'deterministic-summary');
      out.aiModel = a.pick || (a.models && a.models[0]) || '-';
    } catch (_e) {}
    DEV_CONSOLE_STATE.cloudStatus = out;
    DEV_CONSOLE_STATE.probing = false;
    render();
  },

  render(user, params = {}) {
    if (!this.canAccess(user)) return deniedPanel('dev.console');
    if (params.tab) DEV_CONSOLE_STATE.tab = params.tab;
    const tab = DEV_CONSOLE_STATE.tab;
    const real = SILENT_OVERRIDE.realActor() || user;
    const isChief = real.roleId === 'chief';
    const cs = DEV_CONSOLE_STATE.cloudStatus;
    const users = DB.db.users || [];
    const personalised = users.filter(u => !u.mustChangePassword && !u.demo).length;
    const awaitingFirstLogin = users.filter(u => u.mustChangePassword).length;
    const overrideLogs = (DB.db.audit || []).filter(a => String(a.action || '').startsWith('system.silent_override')).slice(-30).reverse();

    VERSION_CONTROL.ensureStore();
    const vcsSnaps = DB.db.versionControl.snapshots || [];
    const liveChecksum = VERSION_CONTROL.computeChecksum();

    const tabs = [
      ['vcs', `Version Control (${vcsSnaps.length})`],
      ['telemetry', 'Online Site Database & Shared AI'],
      ['provisioning', 'First-Run Setup & SMS Credential Pack'],
      ...(isChief ? [['override', 'Chief Admin Silent Override']] : []),
      ['diagnostics', 'RBAC Matrix, Schema & Layout Diagnostics']
    ];

    const devUtil = (typeof utilMenu === 'function') ? utilMenu('Admin Utilities', [
      { label:'Commit Version Checkpoint', icon:'save', act:'dev-vcs-commit-modal' },
      { label:'Export Release & VCS Ledger (.json)', icon:'download', act:'dev-vcs-export' },
      { divider:true },
      { label:'Probe Online DB & AI', icon:'refresh', act:'dev-probe-cloud' },
      ...(isChief ? [{ label:'Launch First-Run Setup Wizard', icon:'sparkles', act:'goto-onboard' }] : [])
    ], { icon:'settings' }) : '';

    const head = pageHead(
      'CareLink Development Console · Version Control & Cloud Governance',
      `CareLink C-DIMS v${APP.version} (Build ${window.BUILD_STAMP || APP.build}) · System Administrator Version Control, Unified Online Site Database, Shared Intelligence & Audited Silent Override.`,
      `<div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" data-act="dev-vcs-commit-modal">${ic('save', 14)} Commit Checkpoint</button>
        <button class="btn btn-sm btn-ghost" data-act="dev-probe-cloud">${ic('refresh', 14)} ${DEV_CONSOLE_STATE.probing ? 'Probing...' : 'Probe Cloud'}</button>
        ${devUtil}
      </div>`
    );

    const kpis = `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Active System Release', `v${APP.version}`, `Schema v${APP.schema} · Checksum ${liveChecksum}`, 'ok', 'flow')}
      ${kpi('Site Database Engine', cs ? cs.storageMode : ((typeof SYNC !== 'undefined' && SYNC.online) ? 'Online Synced DB' : 'Unified Site DB Ready'), `${num(users.length)} accounts · ${num((DB.db.patients||[]).length)} patients`, 'info', 'database')}
      ${kpi('DPA Password Privacy', `${num(personalised)} private`, `${num(awaitingFirstLogin)} awaiting 1st-login change`, 'ok', 'lock')}
      ${kpi('VCS Checkpoints & Audit', `${num(vcsSnaps.length)} tags`, `${num(overrideLogs.length)} override audit logs`, 'info', 'shieldcheck')}
    </div>`;

    const tabBar = `<div class="tabs" role="tablist" style="margin-bottom:16px">
      ${tabs.map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" role="tab" data-act="dev-tab" data-tab="${id}">${esc(label)}</button>`).join('')}
    </div>`;

    let body = '';

    if (tab === 'vcs') {
      body = `<div class="grid g2" style="margin-bottom:16px">
        ${card('Active Release Build & Configuration Integrity', `
          <div class="dl">
            <dt>Release Tag</dt><dd><b class="mono">CareLink C-DIMS v${esc(APP.version)}</b> ${badge('Production Active','b-ok',false)}</dd>
            <dt>Database Schema</dt><dd class="mono">Schema v${esc(String(APP.schema))} (backward-compatible LWW merge)</dd>
            <dt>Build Timestamp</dt><dd class="mono">${esc(window.BUILD_STAMP || APP.build || todayISO())}</dd>
            <dt>Live Config Checksum</dt><dd class="mono bold">${esc(liveChecksum)}</dd>
            <dt>Custom Roles &amp; Visual Packs</dt><dd>${num((DB.db.customRoles||[]).length)} custom role(s) &middot; ${num((DB.db.settings?.installedVisualPacks||[]).length)} custom pack(s)</dd>
          </div>
          <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-xs btn-primary" data-act="dev-vcs-commit-modal">${ic('plus',12)} Create Checkpoint Tag</button>
            <button class="btn btn-xs btn-ghost" data-act="dev-vcs-export">${ic('download',12)} Export VCS Manifest (.json)</button>
          </div>
        `)}
        ${card('System Administrator Checkpoint Snapshots', table([
          { label:'Tag & Checksum', render:s=>`<b class="mono">${esc(s.tag)}</b><div class="xs mono muted">${esc(s.checksum)}</div>` },
          { label:'Commit Summary', render:s=>`<b>${esc(s.category)}</b><div class="xs muted">${esc(s.message)}</div><div class="xs muted">By ${esc(s.author)} &middot; ${esc(fmtDateTime(s.createdAt))}</div>` },
          { label:'Actions', cls:'right', render:s=>`<div class="row" style="gap:6px;justify-content:flex-end">
            <button class="btn btn-xs btn-ghost" data-act="dev-vcs-diff" data-id="${esc(s.id)}">Diff</button>
            ${isChief ? `<button class="btn btn-xs btn-soft" data-act="dev-vcs-rollback" data-id="${esc(s.id)}">Restore</button>` : ''}
          </div>` }
        ], vcsSnaps), { sub:'Snapshots preserve configuration, roles, security thresholds & visual packs while never overwriting clinical patient charts.' })}
      </div>`
      + card('Institutional Release History & Changelog Ledger', table([
        { label:'Release', cls:'mono', render:r=>`<b>${esc(r.tag)}</b><div class="xs muted">${esc(r.date)}</div>` },
        { label:'Channel', render:r=>badge(r.channel, r.tag==='v'+APP.version?'b-ok':'b-neutral', false) },
        { label:'Schema', cls:'mono', render:r=>`v${r.schema}` },
        { label:'Engineering & Governance Deliverables', render:r=>`<span class="small">${esc(r.summary)}</span>` }
      ], VERSION_CONTROL.RELEASES));
    }

    if (tab === 'telemetry') {
      const colCounts = Object.keys(DB.db || {}).filter(k => Array.isArray(DB.db[k])).map(k => ({ name: k, count: DB.db[k].length }));
      body = `<div class="grid g2" style="margin-bottom:16px">
        ${card('Unified Online Site Database (`/api/*`)', `<div class="dl">
          <dt>Architecture</dt><dd><b>Single Shared Online Site Database</b> (replaces local Wi-Fi-only storage)</dd>
          <dt>Active Endpoint</dt><dd class="mono">${esc(location.origin)}/api/state</dd>
          <dt>Storage Backend</dt><dd class="mono">${esc(cs?.storageMode || ((typeof SYNC !== 'undefined' && SYNC.online) ? 'Connected Online Host' : 'Serverless KV / Persistent Vault'))}</dd>
          <dt>Password Vault Protection</dt><dd>${badge('PBKDF2-SHA256 · 160,000 rounds · Hashes stripped from client sync', 'b-ok', 'nodot')}</dd>
          <dt>Field-Level Merge</dt><dd>Concurrent multi-account edits merged by record timestamp + append-only audit log</dd>
        </div>
        <div style="margin-top:12px" class="row">
          <button class="btn btn-xs btn-primary" data-act="dev-probe-cloud">${ic('refresh', 12)} Run Live Endpoint Probe</button>
          ${typeof SYNC !== 'undefined' ? `<button class="btn btn-xs btn-ghost" data-act="open-sync">${ic('database', 12)} Online Sync Status</button>` : ''}
        </div>`)}
        ${card('Shared Online Intelligence (`/api/ai/chat`)', `<div class="dl">
          <dt>Routing Mode</dt><dd><b>Server-Mediated Shared Online Intelligence</b> (all signed-in accounts share one online AI service)</dd>
          <dt>Zero-Localhost Guarantee</dt><dd>${badge('No browser localhost calls · Relative /api/ai/* proxy', 'b-ok', 'nodot')}</dd>
          <dt>Active Provider</dt><dd class="mono">${esc(cs?.aiProvider || AI.status.provider || 'online')}</dd>
          <dt>Active Model</dt><dd class="mono">${esc(cs?.aiModel || AI.status.model || 'Cloud / Deterministic CareLink Summary')}</dd>
          <dt>Role-Scoped Redaction</dt><dd>Prompts are scoped to each user's RBAC lens; HR &amp; Media never receive clinical identifiers</dd>
        </div>
        <div style="margin-top:12px" class="row">
          <button class="btn btn-xs btn-primary" data-act="toggle-ai">${ic('sparkles', 12)} Open Shared Intelligence Drawer</button>
        </div>`)}
      </div>`
      + card('Live Database Collections Inventory', table([
        { label: 'Collection Key', render: r => `<span class="mono bold">${esc(r.name)}</span>` },
        { label: 'Records in Shared Store', cls: 'num', render: r => `<b class="mono">${num(r.count)}</b>` },
        { label: 'Sync Policy', render: r => badge(r.name === 'audit' ? 'Append-only hash chain' : 'Field-level LWW merge', 'b-neutral', 'nodot') }
      ], colCounts));
    }

    if (tab === 'provisioning') {
      const pack = PROD_SETUP.lastPack;
      body = `<div class="alert info" style="margin-bottom:16px">${ic('shield', 18)}<div>
        <b>Production First-Run &amp; Strict Privacy Password Architecture (Kenya Data Protection Act, 2019)</b>
        <span class="small">1) Commissioning configures the <b>Chief System Administrator</b> and auto-generates unique 14-character strong passwords for every staff account as a downloadable <b>SMS Dispatch Pack</b>. 2) On <b>first login</b>, every user is forced to create a private 12+ character complex password stored only as a salted one-way hash — so <b>not even the Chief System Administrator knows any user's personal password</b>.</span>
      </div></div>`
      + `<div class="grid g2" style="margin-bottom:16px">
        ${card('SMS Credential Pack Generator', `<p class="small muted" style="margin-top:0">Generate one-time strong SMS credentials for all accounts currently awaiting first-login activation, or launch the full 4-step First-Run Commissioning Wizard.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
            ${isChief ? `<button class="btn btn-sm btn-primary" data-act="dev-gen-sms-pack">${ic('key', 14)} Generate One-Time SMS Pack (${num(awaitingFirstLogin || users.length - 1)} accounts)</button>` : ''}
            <button class="btn btn-sm btn-ghost" data-act="goto-onboard">${ic('sparkles', 14)} Open First-Run Setup Wizard</button>
          </div>
          ${pack ? `<div class="divider"></div>
            <div class="alert ok" style="margin-top:10px">${ic('check', 16)}<div>
              <b>One-Time SMS Credential Pack Ready (${num(pack.count)} staff accounts)</b>
              <span class="small">Generated ${fmtDateTime(pack.generatedAt)}. Download now for SMS dispatch; temporary passwords are never persisted in cleartext.</span>
            </div></div>
            <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
              <button class="btn btn-sm btn-primary" data-act="dev-dl-sms-csv">${ic('download', 14)} Download CSV Spreadsheet</button>
              <button class="btn btn-sm btn-ghost" data-act="dev-dl-sms-txt">${ic('download', 14)} Download SMS Copy-Paste Sheet (.txt)</button>
            </div>` : ''}`)}
        ${card('First-Login Privacy Password Standard', `<div class="dl">
          <dt>Minimum Length</dt><dd><b>12 characters</b> (enforced on first sign-in)</dd>
          <dt>Character Classes</dt><dd>Uppercase + Lowercase + Digit + Special Symbol</dd>
          <dt>Identity Check</dt><dd>Rejects username, personal name parts &amp; previous temporary password</dd>
          <dt>Zero-Knowledge Storage</dt><dd>Salted PBKDF2-HMAC-SHA256; server strips <code>hash</code> &amp; <code>salt</code> from all API responses</dd>
        </div>`)}
      </div>`
      + (pack ? card('Preview of Current One-Time SMS Credential Pack (In-Memory Only)', table([
          { label: 'Staff Name', render: r => `<b>${esc(r.name)}</b>` },
          { label: 'Username', render: r => `<code class="mono">${esc(r.username)}</code>` },
          { label: 'One-Time SMS Password', render: r => `<code class="mono bold">${esc(r.tempPassword)}</code>` },
          { label: 'Role & County', render: r => `<span class="small">${esc(r.role)} · ${esc(r.county)}</span>` }
        ], pack.rows.slice(0, 25)), { sub: `Showing first ${Math.min(25, pack.rows.length)} of ${pack.rows.length} generated SMS credentials.` }) : '');
    }

    if (tab === 'override' && isChief) {
      const q = (DEV_CONSOLE_STATE.searchUser || '').toLowerCase().trim();
      const candidates = users.filter(u => u.id !== real.id && (!q || `${u.name} ${u.username} ${u.roleId} ${u.countyId || ''}`.toLowerCase().includes(q)));
      body = `<div class="alert warn" style="margin-bottom:16px">${ic('shield', 18)}<div>
        <b>Chief System Administrator — Silent Workspace &amp; Left-Navigation Override</b>
        <span class="small">Inspect any account's live role-scoped workspace and customized left-panel navigation <b>silently without notifying or interrupting the user</b>. Every override start, view visited, and exit is permanently recorded in the hash-chained System Audit Log.</span>
      </div></div>`
      + card('Launch Audited Silent Override', `
        <div class="grid g2" style="margin-bottom:12px">
          <div class="field"><label>Filter Staff / Role / County</label>
            <input class="input" placeholder="Search name, username, role (e.g. homabay, media, clinician)..." value="${esc(DEV_CONSOLE_STATE.searchUser)}" oninput="DEV_CONSOLE_STATE.searchUser=this.value;render()">
          </div>
          <div class="field"><label>Mandatory Audit Log Reason</label>
            <input class="input" id="silentOverrideReason" value="${esc(DEV_CONSOLE_STATE.overrideReason)}" oninput="DEV_CONSOLE_STATE.overrideReason=this.value" placeholder="Reason recorded in System Audit Log">
          </div>
        </div>`
        + table([
          { label: 'Account', render: u => `<div class="cellname">${esc(u.name.replace(/^Demo - /, ''))}<span class="sm mono">${esc(u.username)}</span></div>` },
          { label: 'Role', render: u => badge((roleObj(u.roleId) || {}).name || u.roleId, 'b-neutral', 'nodot') },
          { label: 'Department & Office', render: u => `<span class="small">${esc(deptName(u.departmentId))} · ${esc(u.countyId ? countyName(u.countyId) : 'Head Office')}</span>` },
          { label: 'Password State', render: u => badge(u.mustChangePassword ? 'Awaiting 1st Login' : 'Private Set', u.mustChangePassword ? 'b-warn' : 'b-ok', 'nodot') },
          { label: '', cls: 'act', render: u => `<button class="btn btn-xs btn-primary" data-act="silent-override-start" data-id="${esc(u.id)}">${ic('eye', 12)} Silent Override</button>` }
        ], candidates.slice(0, 30)))
      + `<div style="margin-top:16px">${card('Silent Override Audit Log (`system.silent_override.*`)', table([
          { label: 'Seq', cls: 'num', render: a => `<span class="mono xs">${a.seq}</span>` },
          { label: 'Timestamp', render: a => `<span class="xs">${fmtDateTime(a.ts)}</span>` },
          { label: 'Event', render: a => badge(a.action, 'b-info', 'nodot') },
          { label: 'Target', render: a => `<span class="mono xs">${esc(a.entity)}:${esc(a.entityId)}</span>` },
          { label: 'Audit Detail', render: a => `<span class="small">${esc(a.detail)}</span>` },
          { label: 'Chain Hash', render: a => `<span class="mono xs muted">${esc(a.hash)}</span>` }
        ], overrideLogs, { emptyMsg: 'No silent override sessions have been initiated yet.' }))}</div>`;
    }

    if (tab === 'diagnostics') {
      const checks = [
        { name: 'Returning Patient Checker hidden from Media Department', pass: !RBAC.has({ roleId: 'media', status: 'active' }, 'patient.view.basic') && !RBAC.has({ roleId: 'media', status: 'active' }, 'intake.create') },
        { name: 'Clinical Assessment & Discharge hidden from HR Department', pass: !RBAC.has({ roleId: 'hr', status: 'active' }, 'patient.view.clinical') && !RBAC.has({ roleId: 'hr', status: 'active' }, 'clinical.assess') },
        { name: 'Homa Bay Kenya Reports restricted to Kisumu Head Office Admin', pass: ADMIN_OPS.canPrepareKenyaReport({ roleId: 'countyadmin', countyId: 'kisumu', status: 'active' }) && !ADMIN_OPS.canPrepareKenyaReport({ roleId: 'countyadmin', countyId: 'homabay', status: 'active' }) },
        { name: 'Silent Override restricted exclusively to Chief System Administrator', pass: SILENT_OVERRIDE.canOverride({ roleId: 'chief', status: 'active' }) && !SILENT_OVERRIDE.canOverride({ roleId: 'director', status: 'active' }) && !SILENT_OVERRIDE.canOverride({ roleId: 'it', status: 'active' }) },
        { name: 'Workspace Non-Zoom Fixed Shell (`--zoom: 1`)', pass: typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue('--zoom').trim() !== '0.9' : true },
        { name: 'Audit Trail Hash-Chain Integrity', pass: AUDIT.verify().ok }
      ];
      body = card('Live Architecture, Privacy & UI Invariant Checks', table([
        { label: 'Invariant Check', render: c => `<b>${esc(c.name)}</b>` },
        { label: 'Verification', render: c => badge(c.pass ? 'PASS' : 'FAIL', c.pass ? 'b-ok' : 'b-crit') }
      ], checks), {
        actions: `<button class="btn btn-xs btn-ghost" data-act="run-security-test">${ic('play', 12)} Run Full RBAC Self-Test</button>`
      });
    }

    return head + kpis + tabBar + body;
  }
};

Object.assign(ACTIONS, {
  'dev-tab': d => { DEV_CONSOLE_STATE.tab = d.tab || 'telemetry'; render(); },
  'dev-probe-cloud': () => DEV_CONSOLE.probeCloud(),
  'dev-gen-sms-pack': async () => {
    const pack = await PROD_SETUP.regeneratePackForMustChangeUsers();
    if (pack) { toast('SMS Credential Pack Generated', `${pack.count} unique strong passwords ready for SMS export.`, 'ok'); render(); }
  },
  'dev-dl-sms-csv': () => PROD_SETUP.downloadCSV(),
  'dev-dl-sms-txt': () => PROD_SETUP.downloadSMSText(),
  'dl-whatsapp-txt': () => PROD_SETUP.downloadWhatsappTxt(),
  'copy-whatsapp-pack': () => PROD_SETUP.copyWhatsappSheet(),
  'open-global-activate': () => PROD_SETUP.openGlobalActivateModal(),
  'exec-global-activate': async () => {
    const f = document.querySelector('#globalActivateForm');
    const fd = f ? new FormData(f) : null;
    const emailDomain = fd ? fd.get('emailDomain') : PROD_SETUP.defaultEmailDomain();
    const loginUrl = fd ? fd.get('loginUrl') : PROD_SETUP.defaultPortalUrl();
    const pack = await PROD_SETUP.activateSystemGlobally({ emailDomain, loginUrl });
    if (pack) {
      toast('CareLink System Activated Globally', `${pack.count} organogram accounts generated for WhatsApp dispatch. Demo & setup prompts permanently removed.`, 'ok');
      PROD_SETUP.openGlobalActivateModal();
      render();
    }
  },
  'silent-override-start': d => {
    const reasonEl = $('#silentOverrideReason');
    const reason = reasonEl ? reasonEl.value : DEV_CONSOLE_STATE.overrideReason;
    SILENT_OVERRIDE.enter(d.id, reason);
  },
  'silent-override-exit': () => SILENT_OVERRIDE.exit(),

  'dev-vcs-commit-modal': () => {
    VERSION_CONTROL.ensureStore();
    const nextNum = (DB.db.versionControl.snapshots || []).length + 1;
    openModal({
      title: 'Commit System Version Control Checkpoint',
      sub: 'Records a tagged configuration, custom-role & visual-pack snapshot with deterministic checksum.',
      wide: false,
      body: `<form id="vcsCommitForm">
        <div class="grid g2">
          <div class="field"><label>Version / Checkpoint Tag *</label>
            <input class="input mono" name="tag" value="v${esc(APP.version)}-cp${nextNum}" required>
          </div>
          <div class="field"><label>Change Category</label>
            <select class="input" name="category">
              <option>Configuration Checkpoint</option>
              <option>Roles &amp; Permissions Update</option>
              <option>Theme &amp; Font Pack Release</option>
              <option>Pre-Maintenance Safety Tag</option>
            </select>
          </div>
        </div>
        <div class="field"><label>Commit message / change notes *</label>
          <textarea class="input" name="message" rows="3" required placeholder="Describe the system configuration, role customisation or policy adjustment captured in this checkpoint..."></textarea>
        </div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="dev-vcs-commit-save">${ic('save',14)} Commit Tag &amp; Snapshot</button>`
    });
  },

  'dev-vcs-commit-save': () => {
    const f = document.querySelector('#vcsCommitForm');
    if(!f) return;
    const fd = new FormData(f);
    const msg = String(fd.get('message')||'').trim();
    if(!msg) return toast('Commit message required','Describe what this checkpoint captures.','err');
    const actor = SILENT_OVERRIDE.realActor() || AUTH.user;
    const snap = VERSION_CONTROL.commitSnapshot({
      tag: fd.get('tag'),
      category: fd.get('category'),
      message: msg
    }, actor);
    closeModal(true);
    DEV_CONSOLE_STATE.tab = 'vcs';
    toast('Version Checkpoint Committed', `Tag ${snap.tag} (${snap.checksum}) saved to Version Control.`, 'ok');
    render();
  },

  'dev-vcs-diff': (d={}) => {
    const diffs = VERSION_CONTROL.diffAgainstLive(d.id);
    const snap = (DB.db.versionControl?.snapshots||[]).find(x=>x.id===d.id);
    if(!snap) return;
    openModal({
      title: `Compare Checkpoint ${snap.tag} vs Live System`,
      sub: `Snapshot taken ${fmtDateTime(snap.createdAt)} · Checksum ${snap.checksum}`,
      wide: true,
      body: table([
        { label:'Configuration Domain', cls:'mono', render:r=>`<b>${esc(r.key)}</b>` },
        { label:'Status', render:r=>badge(r.changed?'Modified Since Tag':'Identical', r.changed?'b-warn':'b-ok', false) },
        { label:'Checkpoint Value', render:r=>`<code class="xs mono" style="word-break:break-all">${esc(String(r.snapshotVal||'').slice(0,120))}</code>` },
        { label:'Live Value', render:r=>`<code class="xs mono" style="word-break:break-all">${esc(String(r.liveVal||'').slice(0,120))}</code>` }
      ], diffs),
      footer: `<button class="btn btn-ghost" data-act="close-modal">Close</button>`
    });
  },

  'dev-vcs-rollback': (d={}) => {
    const actor = SILENT_OVERRIDE.realActor() || AUTH.user;
    if(!actor || actor.roleId !== 'chief') return toast('Chief System Administrator Only','Only the Chief System Administrator may restore a configuration checkpoint.','err');
    const r = VERSION_CONTROL.rollbackConfig(d.id, actor);
    if(!r.ok) return toast('Restore failed', r.msg, 'err');
    toast('Checkpoint Restored', `Configuration restored to ${r.snap.tag} (${r.snap.checksum}) and logged in System Audit.`, 'ok');
    render();
  },

  'dev-vcs-export': () => {
    VERSION_CONTROL.ensureStore();
    const payload = {
      exportedAt: new Date().toISOString(),
      activeVersion: APP.version,
      schema: APP.schema,
      liveChecksum: VERSION_CONTROL.computeChecksum(),
      releases: VERSION_CONTROL.RELEASES,
      snapshots: DB.db.versionControl.snapshots
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CareLink-VCS-Manifest-v${APP.version}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    toast('VCS Manifest Exported', `Downloaded ${a.download}.`, 'ok');
  }
});

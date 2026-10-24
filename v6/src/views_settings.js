/* ============================================================
   views_settings.js - Settings workspace (v4.1)

   Two kinds of setting, kept apart on purpose:
     Global configuration  changes how the installation behaves for
                           everyone. Visible only to roles holding the
                           relevant capability, always audited.
     Personal preferences  belong to one person on one device. Never
                           audited as a system change, never seen by
                           anybody else.

   Sections are shown only when the signed-in person may use them.
   ============================================================ */

const SETTINGS = {
  sections(user){
    const s = [];
    s.push({ id:'system',       label:'System information',      icon:'info',   show:true });
    s.push({ id:'preferences',  label:'My preferences',          icon:'user',   show:true });
    if(RBAC.has(user,'user.view')) s.push({ id:'access', label:'Users, roles & permissions', icon:'key' });
    if(RBAC.has(user,'org.manage')) s.push({ id:'organisation', label:'Organisation', icon:'building' });
    if(RBAC.has(user,'system.config')) s.push({ id:'programme', label:'Patient programme', icon:'heart' });
    if(RBAC.has(user,'system.config')) s.push({ id:'pdca', label:'PDCA & follow-up', icon:'repeat' });
    s.push({ id:'notifications', label:'Notifications', icon:'bell' });
    if(RBAC.has(user,'report.patient_figures')||RBAC.has(user,'report.departmental'))
      s.push({ id:'reports', label:'Reports & indicators', icon:'file' });
    if(RBAC.has(user,'ai.use')) s.push({ id:'ai', label:'Local AI assistant', icon:'sparkles' });
    if(RBAC.has(user,'system.config')||RBAC.has(user,'audit.view'))
      s.push({ id:'security', label:'Data protection & security', icon:'shield' });
    if(RBAC.has(user,'system.backup')||RBAC.has(user,'system.audit'))
      s.push({ id:'backup', label:'Backup & integrity', icon:'database' });
    s.push({ id:'network', label:'Network & devices', icon:'wifi' });
    if(RBAC.has(user,'system.config')||RBAC.has(user,'org.manage'))
      s.push({ id:'landing', label:'Landing page & public portal', icon:'image' });
    s.push({ id:'appearance', label:'Appearance & accessibility', icon:'eye' });
    return s;
  },

  get(path, fallback=null){
    const parts = path.split('.');
    let o = DB.db.settings;
    for(const p of parts){ if(o===null||o===undefined) return fallback; o = o[p]; }
    return o===undefined? fallback : o;
  },

  /* Organisation defaults that look personal but apply to everyone. The check
     lives here, in the data layer, so it holds even if a control is shown by mistake. */
  ORG_ONLY: ['density','accentMode','consoleTheme'],

  set(path, value){
    if(SETTINGS.ORG_ONLY.indexOf(path)>=0 && !(AUTH.user && RBAC.has(AUTH.user,'system.config'))){
      toast('Not changed','Only a system administrator may change an organisation default. Use My workspace for your own choice.','err');
      return;
    }
    const parts = path.split('.');
    let o = DB.db.settings;
    for(let i=0;i<parts.length-1;i++){ o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    const key = parts[parts.length-1];
    const before = o[key];
    o[key] = value;
    AUDIT.append({actor:AUTH.user.id, action:'settings.changed', entity:'setting', entityId:path,
      detail:`${JSON.stringify(before)} → ${JSON.stringify(value)}`});
    DB.save(); applyTheme();
    if(path.startsWith('sync.') && typeof LIVE!=='undefined' && typeof SESSION!=='undefined'){
      LIVE.start();   /* picks up the new interval, or stops when switched off */
    }
    toast('Setting saved', SETTINGS.describe(path), 'ok');
    render();
  },

  describe(path){
    const map = {
      'programme.defaultDays':'Expected programme duration updated.',
      'programme.maxDays':'Extended-case threshold updated.',
      'programme.reviewCadence':'Care-plan review cadence updated. Existing due dates are preserved.',
      'pdca.overdueGraceDays':'Overdue grace period updated.',
      'pdca.requireExtensionReview':'Extension review requirement updated.',
      'security.passwordMinLength':'Password policy updated for new and changed passwords.',
      'security.sessionLock':'Session locking updated.',
      'idleMinutes':'Idle timeout updated.',
      'reportCutoff':'Reporting cut-off updated for future reports.',
      'care.capacity':'Care centre capacity updated.',
      'sync.live':'Automatic refresh updated for this device.',
      'sync.liveMs':'Refresh interval updated for this device.'
    };
    return map[path] || 'Recorded in the audit trail.';
  },

  pref(key, value){
    const uid = AUTH.user.id;
    DB.db.personalPrefs[uid] = DB.db.personalPrefs[uid] || {};
    DB.db.personalPrefs[uid][key] = value;
    DB.save();
    if(key==='reducedMotion'){ document.documentElement.setAttribute('data-calm', value?'on':'off'); }
    if((key==='live' || key==='liveMs') && typeof LIVE!=='undefined') LIVE.start();
    render();
  },

  getPref(key, fallback=null){
    const uid = AUTH.user?.id;
    const v = uid? (DB.db.personalPrefs?.[uid]||{})[key] : undefined;
    return v===undefined? fallback : v;
  }
};

function settingRow(label, help, control){
  return `<div class="setting-row"><div class="lbl"><b>${esc(label)}</b><span>${help}</span></div><div class="ctl">${control}</div></div>`;
}

function segControl(path, options, current){
  return `<div class="seg">${options.map(o=>
    `<button data-act="set-setting" data-path="${path}" data-value="${o.v}" class="${String(current)===String(o.v)?'on':''}">${esc(o.l)}</button>`).join('')}</div>`;
}

function toggleControl(path, checked){
  return `<label class="switch"><input type="checkbox" data-setting="${path}" ${checked?'checked':''}><span class="track"></span></label>`;
}

function segPref(key, options, current){
  return `<div class="seg">${options.map(o=>
    `<button data-act="set-pref" data-key="${key}" data-value="${o.v}" class="${String(current)===String(o.v)?'on':''}">${esc(o.l)}</button>`).join('')}</div>`;
}

function personalToggle(key, checked){
  return `<label class="switch"><input type="checkbox" data-pref="${key}" ${checked?'checked':''}><span class="track"></span></label>`;
}

function renderSettings(user){
  const sections = SETTINGS.sections(user);
  let current = APPX.params?.section || (RBAC.has(user,'system.config') ? 'system' : 'preferences');
  if(!sections.find(s=>s.id===current)) current = sections[0].id;
  const mayConfigure = RBAC.has(user,'system.config');

  const nav = `<aside class="settings-nav">
    <div class="g">This installation</div>
    ${sections.slice(0, sections.findIndex(s=>['notifications','preferences','appearance','network'].includes(s.id))>0? sections.findIndex(s=>['notifications','preferences','appearance','network'].includes(s.id)) : sections.length)
      .map(s=>`<button data-act="go" data-v="settings" data-section="${s.id}" class="${current===s.id?'on':''}">${ic(s.icon,15)} ${esc(s.label)}</button>`).join('')}
    <div class="g">Your workspace</div>
    ${sections.filter(s=>['notifications','preferences','appearance','network'].includes(s.id))
      .map(s=>`<button data-act="go" data-v="settings" data-section="${s.id}" class="${current===s.id?'on':''}">${ic(s.icon,15)} ${esc(s.label)}</button>`).join('')}
  </aside>`;

  const body = ({
    system: settingsSystem, preferences: settingsPreferences, access: settingsAccess,
    organisation: settingsOrganisation, programme: settingsProgramme, pdca: settingsPdca,
    notifications: settingsNotifications, reports: settingsReports, ai: settingsAI,
    security: settingsSecurity, backup: settingsBackup, network: settingsNetwork,
    appearance: settingsAppearance, landing: settingsLanding
  })[current] || settingsSystem;

  const roleTitle = (typeof ROLE_CTX!=='undefined' && ROLE_CTX.navLabel)? ROLE_CTX.navLabel(user,'settings','Settings') : 'Settings';
  const rObj = roleObj(user.roleId)||{};
  return `${pageHead(roleTitle, `Configured for ${rObj.name||'your role'} (${deptName(user.departmentId)}) · personal workspace preferences are isolated from global system settings.`)}
    <div class="settings-grid">${nav}<div class="settings-section">${body(user, mayConfigure)}${PAGER.tabs(sections.map(x=>[x.id,x.label]), current, 'go', 'data-v="settings"', 'section')}</div></div>`;
}

/* ---------------- 1. System information ---------------- */
function settingsSystem(user){
  const meta = DB.db.meta||{};
  const ver = REPORTS.versionInfo? REPORTS.versionInfo() : null;
  const counts = [
    ['Patients', DB.db.patients.length], ['Visits', DB.db.visits.length],
    ['Hospital requests', DB.db.requests.length], ['Reports issued', DB.db.reports.length],
    ['Accounts', DB.db.users.length], ['Audit entries', DB.db.audit.length]
  ];
  return `${card('Application', `
    <div class="sync-row"><span>Product</span><b>LOMAMO C-DIMS</b></div>
    <div class="sync-row"><span>Version</span><b class="mono">${esc(APP.version)}</b></div>
    <div class="sync-row"><span>Data schema</span><b class="mono">${esc(String(APP.schema))}</b></div>
    <div class="sync-row"><span>Build</span><b class="mono">${esc(window.BUILD_STAMP||'development')}</b></div>
    <div class="sync-row"><span>Installation</span><b class="mono">${esc(meta.installationId||'-')}</b></div>
    <div class="sync-row"><span>Dataset</span><b>${esc(meta.label||'-')}${meta.demoSeeded?' · synthetic':''}</b></div>`)}
    ${card('What this installation holds', `<div class="grid g3">${counts.map(([l,v])=>
      `<div><div class="xs muted" style="letter-spacing:.1em;text-transform:uppercase">${esc(l)}</div>
      <div style="font-size:24px;font-weight:700">${num(v)}</div></div>`).join('')}</div>
      <div class="note" style="margin-top:14px">${ic('info',14)}<span>Demonstration data is synthetic and prefixed DEMO. It is never mixed with real records and can be replaced in full from the sign-in page.</span></div>`)}
    ${card('Data handling statement', `
      <p class="small">LOMAMO C-DIMS runs on this computer. It makes no request to any internet service. The only optional external connection is to a local model endpoint that an administrator configures, and the server refuses any endpoint outside the organisation's private network.</p>
      <div class="row" style="margin-top:8px">${badge('Offline by design','b-ok')}${badge('No cloud AI','b-ok')}${badge('Audit trail append-only','b-ok')}</div>`)}
    ${card('About LOMAMO Foundation', `
      <p class="small">Love Matters Most Inc, known in Kenya as LOMAMO Foundation, is an orphan prevention programme. It finds seriously ill adults and children, most of them living with HIV, who have been abandoned in urban slums or remote villages, and brings them home-based care and hospital care when they need it.</p>
      <p class="small">Each person is assessed for physical, spiritual and emotional need. Food, encouragement and practical support arrive every week. The Foundation was approved by the Kenya Government as a non-profit on 19 October 2018, and its Kenya office is in Kisumu.</p>
      <p class="small muted">This system exists so that every one of those visits, referrals and decisions is recorded carefully and kept confidential. These links open the Foundation's public website, so they need an internet connection.</p>
      <div class="row" style="margin-top:8px;flex-wrap:wrap"><a class="btn btn-sm btn-ghost" href="https://lovemattersmost.org/about-us/" target="_blank" rel="noopener noreferrer">About us</a>
        <a class="btn btn-sm btn-ghost" href="https://lovemattersmost.org/" target="_blank" rel="noopener noreferrer">lovemattersmost.org</a></div>`)}`;
}

/* ---------------- 2. My preferences ---------------- */
function settingsPreferences(user){
  const p = DB.db.personalPrefs[user.id]||{};
  const roleSpecific = (typeof ROLE_CTX!=='undefined' && ROLE_CTX.roleSpecificSettingsHTML)
    ? ROLE_CTX.roleSpecificSettingsHTML(user) : '';
  return `${roleSpecific}${card('My workspace', `
    ${settingRow('Landing page on sign-out','Where you are returned when you sign out or your session expires.',
      segControl('pref:landing', [{v:'on',l:'Front page'},{v:'off',l:'Sign-in page'}], p.landing===false?'off':'on'))}
    ${settingRow('Default console','The screen this account opens on after sign-in.',
      `<select class="input" data-pref="home">${['home','attention','patients','reports','care','finance','media'].map(v=>
        `<option value="${v}" ${(p.home||'home')===v?'selected':''}>${esc(titleCase(v))}</option>`).join('')}</select>`)}
    ${settingRow('Rows per page','How many records to show in long registers.',
      `<select class="input" data-pref="rows">${[25,50,100,200].map(v=>
        `<option value="${v}" ${(p.rows||50)==v?'selected':''}>${v}</option>`).join('')}</select>`)}
    ${settingRow('Show demonstration badges','Keeps synthetic records visibly labelled. Recommended.',
      personalToggle('demoBadges', p.demoBadges!==false))}`)}
    ${card('Account', `
      <div class="sync-row"><span>Signed in as</span><b>${esc(user.username)}</b></div>
      <div class="sync-row"><span>Role</span><b>${esc((roleObj(user.roleId)||{}).name||'')}</b></div>
      <div class="sync-row"><span>Scope</span><b>${esc(countyName(user.countyId))}${(user.areaIds||[]).length?' · '+(user.areaIds||[]).map(areaName).join(', '):''}</b></div>
      <div class="sync-row"><span>Last sign-in</span><b>${esc(user.lastLogin?String(user.lastLogin).replace('T',' ').slice(0,16):'this session')}</b></div>
      <div class="row" style="margin-top:12px"><button class="btn btn-sm btn-ghost" data-act="change-password">${ic('lock',14)} Change my password</button></div>`)}`;
}

/* ---------------- 3. Access ---------------- */
function settingsAccess(user){
  return `${card('Accounts and permissions', `
    <p class="small">Accounts are created through a controlled request and approval process. No account is created with a shared credential, and no password is ever displayed or recoverable.</p>
    <div class="row" style="margin-top:12px">
      ${RBAC.has(user,'user.view')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="users">${ic('userplus',14)} Users & accounts</button>`:''}
      ${RBAC.has(user,'role.manage')||RBAC.has(user,'user.approve')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="roles">${ic('key',14)} Roles & permissions</button>`:''}
      ${RBAC.has(user,'delegation.manage')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="delegation">${ic('route',14)} Delegation</button>`:''}
    </div>`)}
    ${card('Permission principles in force', `
      <div class="grid" style="gap:11px">
        ${[['Least privilege','A role receives the smallest set of capabilities that lets it do its work. Capabilities are listed in Roles & permissions.'],
           ['Data scope','County, ministry area and assignment boundaries are applied to every query, not to the menu.'],
           ['Separation of duties','Clinical authority, financial authority and platform administration are held by different roles.'],
           ['Delegation','Time-bound authority can be granted to a named colleague. It never transfers a password and expires automatically.']]
          .map(([h,t])=>`<div><b class="small">${esc(h)}</b><div class="small muted">${esc(t)}</div></div>`).join('')}
      </div>`)}`;
}

/* ---------------- 4. Organisation ---------------- */
function settingsOrganisation(user){
  return `${card('Counties, ministry areas and departments', `
    <p class="small">Structural records are seeded from the supplied organogram and county documents. Changes here affect every console.</p>
    <div class="row" style="margin-top:12px"><button class="btn btn-sm btn-ghost" data-act="go" data-v="org">${ic('building',14)} Open organisation configuration</button></div>`)}
    ${card('Counties', table([{label:'County',render:c=>`<b>${esc(c.name)}</b>`},{label:'Code',render:c=>esc(c.code)},
      {label:'Ministry areas',render:c=>String(c.areas.length)},{label:'Areas',render:c=>`<span class="small muted">${esc(c.areas.map(a=>a.name).join(', '))}</span>`}], COUNTIES))}`;
}

/* ---------------- 5. Programme ---------------- */
function settingsProgramme(user, may){
  const p = DB.db.settings.programme;
  if(!may) return card('Patient programme', note('Only the Chief System Administrator may change programme settings.'));
  return `${card('Programme duration', `
    ${settingRow('Expected duration at enrolment','The default the caregiver confirms or replaces at assessment. It is an estimate, never a discharge date.',
      `<input class="input" type="number" min="30" max="240" data-setting="programme.defaultDays" value="${p.defaultDays}">`)}
    ${settingRow('Extended case threshold','Beyond this many days the case needs a documented extension review before it can be closed.',
      `<input class="input" type="number" min="90" max="365" data-setting="programme.maxDays" value="${p.maxDays}">`)}
    ${settingRow('Care-plan review cadence','Reviews fall every 30 days from the programme start date.',
      `<input class="input" type="number" min="30" max="90" step="30" data-setting="programme.reviewCadence" value="${p.reviewCadence}">`)}`,
    {sub:'Changes affect future calculations. Existing due dates are never recalculated silently.'})}
    ${card('Discharge safeguards', `
      <div class="alert warn">${ic('alert',16)}<div><b>A patient is never discharged to meet a target</b>
        <span class="small">The system blocks closure without a clinical report and an unreconciled hospital account. Reaching an expected duration does not trigger discharge.</span></div></div>`)}`;
}

/* ---------------- 6. PDCA ---------------- */
function settingsPdca(user, may){
  const p = DB.db.settings.pdca;
  if(!may) return card('PDCA and follow-up', note('Only the Chief System Administrator may change these rules.'));
  return `${card('Review discipline', `
    ${settingRow('Grace period before a review is overdue','A review due today is not marked overdue until this many days have passed.',
      `<input class="input" type="number" min="0" max="30" data-setting="pdca.overdueGraceDays" value="${p.overdueGraceDays}">`)}
    ${settingRow('Require an extension review for extended cases','A case beyond the programme threshold cannot be closed without one.',
      toggleControl('pdca.requireExtensionReview', p.requireExtensionReview))}`)}
    ${card('How reviews are recorded', `
      <p class="small">Each review keeps the date it was due. When a review is completed late, both dates are stored and the delay is shown. Editing a patient record never resets an overdue review.</p>`)}`;
}

/* ---------------- 7. Notifications ---------------- */
function settingsNotifications(user){
  const n = DB.db.settings.notifications;
  return `${card('Operational reminders', `
    ${settingRow('Monday management report reminder','A reminder at 08:00 East Africa Time when the scheduled set is ready.',
      toggleControl('notifications.mondayReport', n.mondayReport))}
    ${settingRow('Overdue care-plan reviews','A daily summary of reviews that have passed their due date.',
      toggleControl('notifications.overdueReviews', n.overdueReviews))}
    ${settingRow('Approvals waiting for you','When a request is waiting on your decision.',
      toggleControl('notifications.pendingApprovals', n.pendingApprovals))}
    ${settingRow('Care centre incidents','When a safeguarding incident is recorded or closed.',
      toggleControl('notifications.incidents', n.incidents))}
    ${settingRow('Weekly digest','A single summary at the end of the week instead of individual reminders.',
      toggleControl('notifications.weeklyDigest', n.weeklyDigest))}`,
    {sub:'Reminders appear in the notification tray. Nothing is sent by e-mail or text message from this build.'})}`;
}

/* ---------------- 8. Reports ---------------- */
function settingsReports(user){
  return `${card('Reporting rules', `
    ${settingRow('Reporting cut-off','The time of day at which a Monday report stops counting records.',
      `<input class="input" data-setting="reportCutoff" value="${esc(DB.db.settings.reportCutoff||'23:59')}">`)}
    ${settingRow('Monday set at 08:00 EAT','Generate the Patient-Days, Patient Figures and Expenditure set automatically.',
      toggleControl('mondayReport.enabled', DB.db.settings.mondayReport.enabled))}
    <div class="sync-row"><span>Last scheduled run</span><b>${esc(DB.db.settings.mondayReport.lastRun||'Never')}</b></div>
    <div class="row" style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-act="monday-now">${ic('refresh',14)} Run the set now</button></div>`)}
    ${card('Indicator definitions', `<p class="small">Every reported figure carries a written definition, a source, a calculation and an owning department. The catalogue is in the Report centre.</p>
      <div class="row" style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-act="go" data-v="reports">${ic('file',14)} Report centre</button>
      ${RBAC.has(user,'report.targets.manage')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="targets">${ic('target',14)} Targets & baselines</button>`:''}</div>`)}`;
}

/* ---------------- 9. AI ---------------- */
function settingsAI(user){
  const ai = DB.db.settings.ai;
  const probe = APPX.aiProbe;
  const serverMode = typeof SYNC!=='undefined' && SYNC.state==='connected';
  return `${card('Assistant mode', `
    ${settingRow('Enable the assistant','The assistant answers from records you are already allowed to see. It never widens access.',
      toggleControl('ai.enabled', ai.enabled))}
    ${settingRow('Reasoning source','The rule-based engine always works offline. A local model adds written summaries, never decisions.',
      segControl('ai.provider', [{v:'local',l:'Offline + local model'},{v:'disabled',l:'Offline only'}], ai.provider==='disabled'?'disabled':'local'))}
    ${settingRow('Model endpoint','A local Ollama address. The server refuses anything outside the private network.',
      `<input class="input" data-setting="ai.ollama" value="${esc(ai.ollama)}">`)}
    ${settingRow('Model name','For example llama3.1, qwen2.5 or mistral.',
      `<input class="input" data-setting="ai.model" value="${esc(ai.model)}">`)}
    ${settingRow('Allow cloud providers','Locked off. Patient context must not leave the organisation.',
      `<span class="badge b-neutral">Not permitted</span>`)}
    <div class="row" style="margin-top:10px"><button class="btn btn-sm btn-primary" data-act="ai-probe">${ic('pulse',14)} Test the endpoint</button></div>
    ${probe? `<div class="alert ${probe.ok?'ok':'warn'}" style="margin-top:12px">${ic(probe.ok?'check':'alert',16)}<div>
      <b>${probe.ok?'Endpoint answered':'Endpoint did not answer'}</b>
      <span class="small">${esc(probe.ok? `${probe.models.length} model${probe.models.length===1?'':'s'} available${probe.modelPresent?'':' · the configured model is not in the list'} · ${probe.ms} ms` : probe.error)}</span>
      ${probe.ok?`<div class="xs muted" style="margin-top:4px">${esc((probe.models||[]).slice(0,8).join(', '))}</div>`:''}</div></div>`:''}
    ${!serverMode? `<div class="note" style="margin-top:12px">${ic('info',14)}<span>This page cannot reach the model endpoint directly when the application is opened as a file. Start the server on the host computer and open the application from its address to test from here.</span></div>`:''}`,
    {sub:'The connection test runs on the host computer, so a tablet never needs direct access to the model service.'})}
    ${card('What the assistant may and may not do', `
      <div class="grid g2" style="gap:10px">
        <div><b class="small">It may</b><ul class="small muted" style="margin:6px 0 0 18px;padding:0">
          <li>summarise records you may already read, with typed evidence</li>
          <li>point to the next permitted step and who owns it</li>
          <li>draft text that a person must review and sign</li></ul></div>
        <div><b class="small">It may not</b><ul class="small muted" style="margin:6px 0 0 18px;padding:0">
          <li>diagnose, prescribe or confirm a condition</li>
          <li>approve enrolment, discharge or expenditure</li>
          <li>publish a story or change a permission</li></ul></div>
      </div>`)}`;
}

/* ---------------- 10. Security ---------------- */
function settingsSecurity(user, may){
  const s = DB.db.settings.security;
  return `${card('Sessions and passwords', may? `
    ${settingRow('Minimum password length','Applies to new accounts and password changes.',
      `<input class="input" type="number" min="10" max="32" data-setting="security.passwordMinLength" value="${s.passwordMinLength}">`)}
    ${settingRow('Idle lock','Minutes of inactivity before the console locks.',
      `<input class="input" type="number" min="5" max="60" data-setting="idleMinutes" value="${DB.db.settings.idleMinutes}">`)}
    ${settingRow('Lock the session after inactivity','The person must enter their own password to continue.',
      toggleControl('security.sessionLock', s.sessionLock))}
    ${settingRow('Failed attempts before lockout','A lockout is recorded and shown to the auditor.',
      `<input class="input" type="number" min="3" max="10" data-setting="security.loginAttempts" value="${s.loginAttempts}">`)}`
    : note('Only the Chief System Administrator may change security policy.'))}
    ${card('Controls verified in this build', `
      <div class="row" style="flex-wrap:wrap;gap:8px">
        ${['Hash-only passwords','Append-only audit chain','Deny by default','Consent before publication','Dual approval','Local-only AI','County and area scoping','Redacted external reports']
          .map(c=>badge(c,'b-ok')).join('')}
      </div>
      <div class="row" style="margin-top:12px"><button class="btn btn-sm btn-ghost" data-act="go" data-v="security">${ic('lock',14)} Run the security self-test</button></div>`)}`;
}

/* ---------------- 11. Backup ---------------- */
function settingsBackup(user){
  const b = DB.db.settings.backup;
  return `${card('Backup and restore', `
    <div class="sync-row"><span>Schedule</span><b>${esc(titleCase(b.schedule))}</b></div>
    <div class="sync-row"><span>Last backup</span><b>${esc(b.lastBackup||'Never')}</b></div>
    <div class="sync-row"><span>Last verified</span><b>${esc(b.lastVerified||'Never')}</b></div>
    <div class="sync-row"><span>Restore</span><b>Requires two independent approvals</b></div>
    <div class="row" style="margin-top:12px"><button class="btn btn-sm btn-ghost" data-act="go" data-v="backup">${ic('database',14)} Open backup & restore</button></div>`)}
    ${card('Integrity of the audit trail', `
      <p class="small">The audit trail is a hash chain. Removing or altering an entry breaks every later link and is detected by verification.</p>
      <div class="row" style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-act="verify-chain">${ic('shieldcheck',14)} Verify the chain</button></div>`)}`;
}

/* ---------------- 12. Network ---------------- */
function settingsNetwork(user){
  const s = typeof SYNC!=='undefined'? SYNC : null;
  const st = s? s.state : 'device';
  const live = typeof LIVE!=='undefined'? LIVE : null;
  const lp = DB.db.personalPrefs?.[user.id] || {};
  const liveOn = lp.live!==false;
  const liveMs = Number(lp.liveMs || DB.db.settings.sync?.liveMs || 500);
  return `${card('This device and the central database', `
    <div class="sync-row"><span>Connection</span><b>${esc(s? s.label():'Unknown')}</b></div>
    <div class="sync-row"><span>Detail</span><b class="small">${esc(s? s.detail():'')}</b></div>
    <div class="sync-row"><span>Central revision</span><b class="mono">${s? s.rev : '-'}</b></div>
    <div class="sync-row"><span>Host</span><b>${s&&s.server? esc(s.server.host||'the host computer') : 'not connected'}</b></div>
    <div class="sync-row"><span>Data directory</span><b class="mono small">${s&&s.server? esc(s.server.dataDir||'-') : '-'}</b></div>
    <div class="row" style="margin-top:12px"><button class="btn btn-sm btn-primary" data-act="open-sync">${ic('refresh',14)} Open status and conflicts</button></div>`)}
    ${card('Live update', `
      ${settingRow('Refresh this device automatically','Every connected device asks the host for changes twice a second. Nothing has to be tapped.', personalToggle('live', liveOn))}
      ${settingRow('How often to ask','Half a second is what the organisation asked for. A slower rate saves battery on a device left open all day, and applies to your devices only.', segPref('liveMs',[{v:'500',l:'0.5 s'},{v:'1000',l:'1 s'},{v:'2000',l:'2 s'}], String(liveMs)))}
      <div class="sync-row"><span>This device</span><b>${esc(live? live.label() : 'Not running')}</b></div>
      <div class="sync-row"><span>Updates taken this session</span><b class="mono">${live? num(live.applied) : '0'}</b></div>
      <div class="sync-row"><span>Host revision</span><b class="mono">${esc(String(s? s.rev : 0))}</b></div>
      <div class="note" style="margin-top:12px">${ic('info',14)}<span>A refresh never counts as activity, never interrupts typing or a form, and never writes back. It only reads the host copy.</span></div>`)}
    ${card('Running on the office Wi-Fi', `
      <ol class="small" style="margin:0 0 0 18px;padding:0;line-height:1.75">
        <li>On the host computer, start <span class="mono">server.py</span> or <span class="mono">start.bat</span> and choose option 2.</li>
        <li>Note the address printed, for example <span class="mono">http://192.168.1.24:8000/</span>.</li>
        <li>On the tablet, open that address in Chrome.</li>
        <li>Every accepted change is written to the host computer, not to the tablet.</li>
      </ol>
      <div class="note" style="margin-top:12px">${ic('info',14)}<span>The application never calls <span class="mono">localhost</span> from a tablet. It uses the address it was opened from, which is the host computer.</span></div>`)}`;
}

/* ---------------- 13. Appearance ---------------- */
/* A faithful miniature of the console in each theme: pane, bar, two cards and
   the action colour, drawn from the theme's own tokens. */
function wtPreview(t){
  const k = t.t;
  return `<div class="wt-prev" style="background:${k.bg}">
    <i class="wt-pane" style="background:${k.chrome}"><b style="background:${k.chromeMuted}"></b><b style="background:${k.chromeMuted}"></b><b style="background:${k.chromeInk}"></b></i>
    <div class="wt-main">
      <i class="wt-bar" style="background:${k.bar};border-color:${k.line}"></i>
      <div class="wt-cards"><i style="background:${k.surface};border-color:${k.line}"><u style="background:${k.ink}"></u><u style="background:${k.muted}"></u></i>
        <i style="background:${k.surface};border-color:${k.line}"><u style="background:${k.ink}"></u><u style="background:${k.muted}"></u></i></div>
      <div class="wt-chips"><span style="background:${k.action}"></span><span style="background:${k.okBg};border-color:${k.ok}"></span><span style="background:${k.warnBg};border-color:${k.warn}"></span><span style="background:${k.critBg};border-color:${k.crit}"></span></div>
    </div></div>`;
}
function wtCard(t, current, act, extra){
  const on = t.id===current;
  return `<button class="wt-card ${on?'on':''}" data-act="${act}" data-id="${esc(t.id)}" aria-pressed="${on}" ${extra||''}>
    ${wtPreview(t)}
    <span class="wt-meta"><b>${esc(t.name)}</b><span>${esc(t.blurb)}</span>
      <em class="wt-tag">${t.mode==='dark'?'Dark':'Light'}${on?' · In use':''}</em></span></button>`;
}
function wtAutoCard(current, act){
  const on = current===WT_AUTO;
  return `<button class="wt-card ${on?'on':''}" data-act="${act}" data-id="${WT_AUTO}" aria-pressed="${on}">
    <div class="wt-prev wt-auto"><div class="wt-half">${wtPreview(WTHEME.byId('classic'))}</div><div class="wt-half wt-half2">${wtPreview(WTHEME.byId('night'))}</div></div>
    <span class="wt-meta"><b>Match this tablet</b><span>Daylight by day, Night ward when the tablet is in dark mode.</span>
      <em class="wt-tag">Automatic${on?' · In use':''}</em></span></button>`;
}
function wtGridHtml(user, act){
  const cur = WTHEME.choice(user) || WTHEME.orgDefault();
  return `<div class="wt-grid">${wtAutoCard(cur, act)}${WTHEMES.map(t=>wtCard(t, cur, act)).join('')}</div>`;
}
function visualPacksHtml(user){
  const activePack = WTHEME.activePackId(user);
  const packs = WTHEME.packs();
  return `<div class="col" style="gap:12px">
    <p class="small muted" style="margin:0">Install a complete Font Style + Workspace Theme + Banner Visual Pack in one click, or paste / upload a custom CareLink Visual Pack (.json) below.</p>
    <div class="grid g2" style="gap:10px">
      ${packs.map(pk=>{
        const on = activePack === pk.id;
        return `<div class="card" style="margin:0;border:${on?'2px solid var(--accent)':'1px solid var(--line)'}">
          <div class="card-b" style="padding:12px 14px">
            <div class="spread" style="gap:8px;margin-bottom:4px">
              <b style="font-size:13.5px">${esc(pk.name)}</b>
              ${badge(on?'Installed & Active':('v'+pk.version), on?'b-ok':'b-neutral', false)}
            </div>
            <div class="xs muted" style="margin-bottom:5px">${esc(pk.category||'Visual Pack')} · Font: <b>${esc((pk.config&&pk.config.font)||'standard')}</b> · Theme: <b>${esc((pk.config&&pk.config.wtheme)||'foundation')}</b></div>
            <div class="xs" style="margin-bottom:10px">${esc(pk.blurb||'')}</div>
            <button class="btn btn-xs ${on?'btn-ghost':'btn-primary'}" data-act="install-visual-pack" data-id="${esc(pk.id)}">${ic(on?'check':'download',13)} ${on?'Re-apply Pack':'Install & Activate Pack'}</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="divider"></div>
    <div class="card" style="margin:0;background:var(--surface-2)">
      <div class="card-b" style="padding:12px 14px">
        <div class="spread" style="gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <b class="small">${ic('upload',14)} Install Custom Font & Theme Pack (.json)</b>
          <button class="btn btn-xs btn-ghost" data-act="export-visual-pack">${ic('download',13)} Export My Current Pack (.json)</button>
        </div>
        <textarea class="input mono" id="customVisualPackJson" rows="3" placeholder='{"name":"Kisumu Clinical Serif Pack","version":"1.0","config":{"wtheme":"lake","font":"editorial","corners":"soft","cards":"lifted"}}' style="font-size:11.5px"></textarea>
        <div class="row" style="margin-top:8px;gap:8px">
          <button class="btn btn-xs btn-primary" data-act="import-visual-pack-json">${ic('plus',13)} Install Custom Pack</button>
        </div>
      </div>
    </div>
  </div>`;
}

function openThemePicker(tab='themes'){
  const user = AUTH.user; if(!user) return;
  const st = WTHEME.studio(user);
  const scale = Number((DB.db.personalPrefs[user.id]||{}).textScale)||100;
  const tabsBar = `<div class="tabs" style="margin-bottom:14px">
    <button class="tab ${tab==='themes'?'active':''}" data-act="wtheme-tab" data-tab="themes">${ic('palette',14)} Colour Themes (${WTHEMES.length})</button>
    <button class="tab ${tab==='fonts'?'active':''}" data-act="wtheme-tab" data-tab="fonts">${ic('file',14)} Font Styles & Scale (${STUDIO.font.opts.length})</button>
    <button class="tab ${tab==='packs'?'active':''}" data-act="wtheme-tab" data-tab="packs">${ic('package',14)} Installable Visual Packs (${WTHEME.packs().length})</button>
  </div>`;
  const fontsPane = `<div class="col" style="gap:12px">
    <p class="small muted" style="margin:0">Choose an offline-ready institutional font family for your console headings, banners and tables. Changes apply immediately to your workspace.</p>
    <div class="grid g2" style="gap:10px">
      ${STUDIO.font.opts.map(o=>{
        const on = st.font===o.v;
        const hStack = (STUDIO.font.headStacks && STUDIO.font.headStacks[o.v]) || 'inherit';
        return `<button class="st-pre" style="text-align:left;border:${on?'2px solid var(--accent)':'1px solid var(--line)'}" data-act="studio-font-pick" data-value="${esc(o.v)}">
          <div class="spread" style="width:100%"><b style="font-family:${esc(hStack)};font-size:15px">${esc(o.l)}</b>${on?badge('Active','b-ok',false):''}</div>
          <span style="font-family:${esc(STUDIO.font.stacks[o.v]||'inherit')}">CareLink OS · Serving our Neighbours in Love · 3,333 Records</span>
        </button>`;
      }).join('')}
    </div>
    <div class="divider"></div>
    ${settingRow('Text size scale','Scales console typography cleanly inside your fixed workspace.',
      `<div class="seg">${[100,110,125].map(n=>`<button class="${scale===n?'on':''}" data-act="pref-scale" data-scale="${n}">${n}%</button>`).join('')}</div>`)}
  </div>`;
  const content = tab==='fonts' ? fontsPane : (tab==='packs' ? visualPacksHtml(user) : wtGridHtml(user,'set-wtheme'));
  openModal({ title:'Workspace Theme, Font Styles & Visual Packs', sub:'Personalise your console typography, colour palette and visual pack without affecting permissions or records.', wide:true,
    body: tabsBar + content,
    footer:`<button class="btn btn-ghost" data-act="wtheme-more">Full appearance settings</button><button class="btn btn-ghost" data-act="close-modal">Close</button>`});
}

function studioHtml(user){
  const st = WTHEME.studio(user);
  const seg = (key) => `<div class="seg" role="group" aria-label="${esc(STUDIO[key].label)}">${STUDIO[key].opts.map(o=>
    `<button class="${st[key]===o.v?'on':''}" data-act="studio-set" data-key="${key}" data-value="${esc(o.v)}" aria-pressed="${st[key]===o.v}">${esc(o.l)}</button>`).join('')}</div>`;
  const dots = `<div class="st-sw" role="group" aria-label="Accent colour">${STUDIO.accentPick.opts.map(o=>
    `<button class="st-dot ${o.v===''?'none':''} ${st.accentPick===o.v?'on':''}" ${o.v?`style="background:${o.v}"`:''} data-act="studio-set" data-key="accentPick" data-value="${esc(o.v)}" aria-pressed="${st.accentPick===o.v}" aria-label="${esc(o.l)}" title="${esc(o.l)}">${st.accentPick===o.v?'\u2713':''}</button>`).join('')}</div>`;
  return `<p class="small muted" style="margin:0 0 12px">Mix your own look. Presets set several choices at once. Every colour is checked for readability, so no combination can make text hard to read.</p>
    <div class="st-grid">${STUDIO_PRESETS.map(p=>`<button class="st-pre" data-act="studio-preset" data-id="${p.id}"><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span></button>`).join('')}
      <button class="st-pre" data-act="studio-preset" data-id="random"><b>${ic('sparkle',14)} Surprise me</b><span>A random theme and combination. Try it, then reset if you do not like it.</span></button></div>
    <div style="margin-top:14px">
    ${settingRow('Accent colour','Overrides the theme and department colour. It is adjusted automatically if it would be hard to read.', dots)}
    ${settingRow('Corners','', seg('corners'))}
    ${settingRow('Typeface','Easy to read uses wider spacing. All fonts are already on the device, so nothing is downloaded.', seg('font'))}
    ${settingRow('Backdrop','A very faint pattern behind the page. Cards stay plain, and the pattern is kept light enough that text on it stays readable.', seg('backdrop'))}
    ${settingRow('Hero panel','', seg('hero'))}
    ${settingRow('Cards','', seg('cards'))}
    ${STUDIO.kpiStyle ? settingRow('KPI stat cards','Vivid fills stat boxes with rich jewel gradients; Tinted uses soft washes with crisp coloured numbers.', seg('kpiStyle')) : ''}
    </div>
    <div class="row" style="margin-top:12px"><button class="btn btn-ghost" data-act="studio-reset">Reset the studio</button></div>
    <div class="divider"></div>
    <h4 style="margin:0 0 8px">Installable Font & Theme Visual Packs</h4>
    ${visualPacksHtml(user)}`;
}

function settingsAppearance(user){
  const s = DB.db.settings;
  const p = DB.db.personalPrefs[user.id]||{};
  const mayConfigure = RBAC.has(user,'system.config');
  const pr = NAVP.prefs(user);
  const density = p.density || s.density || 'comfortable';
  const accent = p.accentMode || s.accentMode || 'department';
  const org = WTHEME.orgDefault();
  const dev = (typeof DEVICE!=='undefined')? DEVICE.profile() : null;
  const devDefault = (typeof DEVICE!=='undefined')? (WTHEME.byId(DEVICE.themeDefault())||{}).name : '';
  return `${card('Workspace theme', `
      <p class="small muted" style="margin:0 0 12px">Twenty vibrant workspace themes paired with 15 departmental colour schemes. A theme changes colour and contrast only and never changes permissions, records, or status meaning.</p>
      ${dev?`<div class="note" style="margin-bottom:12px">${ic('package',15)}<span class="small">This device is a <b>${esc(dev.kind)}</b> (${esc(dev.name)}), so it opens in the standard <b>${esc(devDefault)}</b> theme across PC and tablets until you choose another theme or visual pack here. Field teams working in low light can switch to <b>Harbour Dusk</b> or <b>Night Ward</b> in one tap, and every pair is contrast-checked in the Visual &amp; accessibility audit.</span></div>`:''}
      ${wtGridHtml(user,'set-wtheme')}`)}
    ${card('Creative studio', studioHtml(user))}
    ${card('Navigation', `
      ${settingRow('Console navigation','The pane lists every page your role may open, with your department\'s own work first. Tabs is the earlier sheet along the top.',
        segPref('navLayout',[{v:'pane',l:'Pane'},{v:'tabs',l:'Tabs'}], pr.layout))}
      ${settingRow('Fold the pane to icons','Gives the page more room on a small tablet. Tap the arrow at the foot of the pane to change it at any time.',
        personalToggle('navRail', pr.rail))}`)}
    ${card('Tablet comfort', `
      ${settingRow('Touch targets','Large makes every button and row taller, for gloves, bright light or a tablet held at arm\'s length.',
        segPref('touch',[{v:'standard',l:'Standard'},{v:'large',l:'Large'}], p.touch==='large'?'large':'standard'))}
      ${settingRow('Text size','Scales the whole console.',
        `<select class="input" data-pref="textScale">${[90,100,110,125].map(v=>
          `<option value="${v}" ${(p.textScale||100)==v?'selected':''}>${v}%</option>`).join('')}</select>`)}
      ${settingRow('Density','Comfortable gives tablet-sized rows. Compact fits more on a desktop.',
        segPref('density',[{v:'comfortable',l:'Comfortable'},{v:'compact',l:'Compact'}], density))}
      ${settingRow('Departmental colour','Each console carries the department colour. LOMAMO crimson uses one colour everywhere. A theme that fixes its own accent overrides this.',
        segPref('accentMode',[{v:'department',l:'Department'},{v:'lomamo',l:'LOMAMO crimson'}], accent))}
      ${settingRow('Reduce motion','Removes animation and smooth scrolling across the console.',
        personalToggle('reducedMotion', p.reducedMotion===true))}`)}
    ${mayConfigure? card('Organisation defaults', `
      <p class="small muted" style="margin:0 0 10px">What people see until they choose for themselves. Changes are audited.</p>
      ${settingRow('Default theme','Used for anyone who has not picked a theme.',
        `<select class="input" data-orgtheme>${[WT_AUTO].concat(WTHEMES.map(t=>t.id)).map(id=>
          `<option value="${id}" ${org===id?'selected':''}>${esc(id===WT_AUTO? 'Match the tablet' : WTHEME.byId(id).name)}</option>`).join('')}</select>`)}
      ${settingRow('Programme year starts in','The master workbook contradicts itself: each ministry area sheet offers a month dropdown running June to May, while the Tabel list and the 53-week calendar run January to December. The default is January so that no figure shifts silently; set June once Administration confirms it. The choice orders monthly cost trends, the foodbag matrix and every cumulative "up and until month" figure, and it is audited.',
        `<select class="input" data-pyear>${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${(typeof PYEAR!=='undefined'&&PYEAR.start()===m)?'selected':''}>${esc((typeof PYEAR!=='undefined'?PYEAR.monthName(m):''))}</option>`).join('')}</select>`)}
      ${settingRow('Default density','',
        segControl('density',[{v:'comfortable',l:'Comfortable'},{v:'compact',l:'Compact'}], s.density))}
      ${settingRow('Default departmental colour','',
        segControl('accentMode',[{v:'department',l:'Department'},{v:'lomamo',l:'LOMAMO crimson'}], s.accentMode))}`) : ''}
    ${card('Colour is never the only signal', `
      <p class="small">Every status carries a written label as well as a colour, and charts include a written summary and a full table. A status keeps its meaning in every theme: green is done, amber is waiting, red is critical, blue is information. In the dark themes the shade shifts so the label stays readable.</p>
      <div class="row" style="margin-top:10px;flex-wrap:wrap">${badge('Open','b-warn')}${badge('Closed','b-ok')}${badge('Overdue','b-crit')}${badge('Awaiting approval','b-info')}</div>`)}`;
}

/* ---------------- 14. Landing page theme ---------------- */
function themeSwatchCss(id){
  const map = {
    heritage:'linear-gradient(150deg,#132A4F,#1F3864,#0C1B33)',
    dawn:'linear-gradient(160deg,#2A1206,#B4430F,#1A0C05)',
    clinic:'linear-gradient(160deg,#FFFFFF,#E6F4F7)',
    editorial:'linear-gradient(160deg,#F7F3EC,#E4D8C6)',
    canopy:'linear-gradient(160deg,#06251A,#0F5237,#041A12)',
    signal:'linear-gradient(160deg,#08090B,#1B1D22)',
    sand:'linear-gradient(160deg,#FBF6EF,#E4D2B7)',
    violet:'linear-gradient(160deg,#120A24,#3B1D77,#0A0616)',
    paper:'linear-gradient(160deg,#FDFDFB,#EDEDEA)',
    spectrum:'linear-gradient(160deg,#0B0F1A,#1B2438,#070A12)'
  };
  return map[id]||map.heritage;
}
function themeCard(t, active){
  const dark = t.mode==='dark';
  return `<div class="theme-card ${active?'on':''}">
    <div class="theme-shot" style="background:${themeSwatchCss(t.id)}">
      <div class="mini">
        <div class="eyebrow" style="color:${dark?'rgba(255,255,255,.72)':'#5A4A3A'}">Serving our Neighbours in Love</div>
        <h4 style="color:${dark?'#fff':'#1B1B1B'};font-family:${t.id==='editorial'?'Georgia,serif':'inherit'}">One Foundation.<br>One Operating System.</h4>
        <div class="dots">${['#EF4444','#F59E0B','#22C55E','#06B6D4','#6366F1','#A855F7'].map(c=>`<i style="background:${c}"></i>`).join('')}</div>
        <div class="cta" style="background:${t.accent};color:${dark?'#0B0F1A':'#fff'}">Proceed to My Console</div>
      </div>
    </div>
    <div class="theme-meta"><b>${esc(t.name)}</b><span>${esc(t.blurb)}</span></div>
    <div class="theme-actions">
      <button class="btn btn-xs btn-ghost" data-act="preview-theme" data-id="${t.id}">Preview</button>
      <button class="btn btn-xs ${active?'btn-ghost':'btn-primary'}" data-act="set-landing-theme" data-id="${t.id}" ${active?'disabled':''}>${active?'In use':'Apply'}</button>
    </div>
  </div>`;
}
function settingsLanding(user, may){
  const active = DB.db.settings.landingTheme || DEFAULT_THEME;
  return `<div class="settings-block">
    <h3>Landing page identity</h3>
    <p class="small muted">Ten complete front-door designs. A theme changes the public landing page and the public portal only. It never changes permissions, patient data, workflows or the colours used inside a console.</p>
    <div class="theme-grid" style="margin-top:14px">
      ${LANDING_THEMES.map(t=>themeCard(t, t.id===active)).join('')}
    </div>
    <div class="divider"></div>
    ${settingRow('Restore the default', 'Heritage navy. Available at any time, including if a theme is ever withdrawn.', `<button class="btn btn-sm btn-ghost" data-act="set-landing-theme" data-id="${DEFAULT_THEME}" ${active===DEFAULT_THEME?'disabled':''}>Restore default</button>`)}
    ${settingRow('Preview before applying', 'A preview opens the full page in a frame without changing what anyone else sees.', `<button class="btn btn-sm btn-ghost" data-act="preview-theme" data-id="${active}">Preview current</button>`)}
    ${settingRow('Who may change this', 'System configuration authority. Every change is recorded in the audit trail with the previous and new value.', `<span class="badge b-neutral">${esc(RBAC.has(user,'system.config')?'You may change it':'View only')}</span>`)}
    <div class="divider"></div>
    <div class="alert info">${ic('info',17)}<div><b>Workspace colour is a separate setting</b>
      <span class="small">Console colours follow the department identity and your own accessibility preferences. A landing theme cannot override a status colour, a warning, or the contrast of any record.</span></div></div>
  </div>`;
}

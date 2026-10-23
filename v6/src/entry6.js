/* ============================================================
   entry6.js - Front door, Sign-In, Active Demo Hub & Host Onboarding
   LOMAMO Foundation Kenya · LOMAMO C-DIMS v6.1

   Design rules enforced here:
   - Identical front-door Landing Page on PC, Android Tablet, iPad & Mobile.
   - Sign-in screen fits strictly onto one viewport (100dvh, zero scrollbar)
     across all tabs, including interactive Cross-Departmental Teamwork
     photography directly beneath "One Foundation. One Operating System."
   - Justified typography with hyphenation strictly disabled (hyphens:none)
     so words never split awkwardly across lines.
   - Full 3,333-patient & 47-account multi-department dataset active and
     reloadable in one tap on both PC and Tablet.
   ============================================================ */

const ONB = {
  step:1, host:null, org:{ name:'LOMAMO Foundation Kenya', county:'kisumu', shortName:'LOMAMO' },
  admin:{ name:'', username:'', password:'', confirm:'' },
  mode:'host', roster:[], issued:null, seed:'reference', busy:false, error:'',
  /* Set when the host answers that it already holds an installation. The wizard
     then stops trying to commission it and offers the three honest ways forward:
     sign in, ask the administrator for an account, or continue on this device. */
  hostSetup:null, advice:''
};

const LOGIN6 = {
  tab:'signin', error:'', notice:'', busy:false, results:null,
  slide:0, demoFilter:'all'
};

const LOGIN_TEAM_SLIDES = [
  {
    key:'analytics_screen',
    tag:'Cross-Department Case Review',
    title:'Clinical, M&E & Field Caregivers Reviewing Household Progress Together',
    dept:'Medical · Field Care · M&E Data'
  },
  {
    key:'puzzle_hands',
    tag:'Interlocking Departmental Unity',
    title:'Every Department Fitting Together Around One Vulnerable Household',
    dept:'Field · Hospital · Finance · Governance'
  },
  {
    key:'united_hands',
    tag:'Orphan Prevention Covenant',
    title:'Standing Shoulder to Shoulder So Children Grow Up With Their Families',
    dept:'Kisumu & Homa Bay · 10 Ministry Areas'
  },
  {
    key:'boardroom_team',
    tag:'Coordinated County Operations',
    title:'Leadership, Finance & Hospital Focal Desks Aligned on One Shared Record',
    dept:'Executive · Finance · JOOTRH Desk'
  }
];

/* ------------------------------------------------------------ helpers */
async function hostProbe(){
  if(typeof SYNC==='undefined' || !SYNC.available()) return null;
  try{
    const r = await SYNC._json('api/health');
    return r.ok ? r.body : null;
  }catch(e){ return null; }
}
function passwordStrength(pw){
  let n = 0;
  if(pw.length>=10) n++;
  if(pw.length>=14) n++;
  if(/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
  if(/[0-9]/.test(pw)) n++;
  if(/[^A-Za-z0-9]/.test(pw)) n++;
  const label = ['Too short','Weak','Fair','Good','Strong','Very strong'][Math.min(5,n)];
  return { n, label, tone: n>=4?'ok':n===3?'warn':'crit' };
}
function orgName(){ return (DB.db && DB.db.settings && DB.db.settings.org && DB.db.settings.org.name) || 'LOMAMO Foundation Kenya'; }

function credMasterText(issued, host){
  const line = '='.repeat(78);
  const rows = issued.map((a,i)=>
    `${String(i+1).padStart(2,' ')}. ${a.name || a.username}\n` +
    `    Role       ${a.role || '-'}\n` +
    `    Username   ${a.username}\n` +
    `    Password   ${a.password}\n` +
    (a.activation ? `    Activation ${a.activation}\n` : '')
  ).join('\n');
  return `${line}\n  LOMAMO FOUNDATION · CARELINK DIMS v6.1\n  OFFICIAL ACCOUNT MASTER FILE  -  CONFIDENTIAL\n${line}\n
Generated      ${new Date().toLocaleString('en-GB')}
Organisation   ${orgName()}
Host computer  ${host || 'the computer running server.py'}
Accounts       ${issued.length}

HOW TO USE THIS FILE
  1. Print it, or copy it to a password manager, then delete it from the
     Downloads folder. It is the only copy that contains these passwords.
  2. Give each person their own line. Do not send the whole sheet.
  3. Each person signs in and is required to choose a new password before
     the console opens. Their new password is stored on the host as a
     salted PBKDF2 hash and cannot be read back by anyone.
  4. If a password must be recovered, the four senior offices (Country
     Director, Chief System Administrator, Chief Program Administrator and
     Program Administrator Assistant) must each approve in their own
     console. The system then replaces the password with a new temporary
     one; the old one is never revealed.
  5. Losing this sheet does not lock anyone out: the administrator can
     re-issue a temporary password from Users & accounts.

${line}\n  ACCOUNTS\n${line}\n
${rows}
${line}
Every password above is temporary and must be changed at first sign-in.
This file contains credentials. Store it as you would store a key.
${line}\n`;
}
function downloadText(name, text, mime='text/plain'){
  const b = new Blob([text], {type:mime});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}

/* Activate full 3,333-patient & 47-account dataset locally AND on host if reachable */
async function activateFullDemoDataset(){
  if(!DB.db) DB.load();
  const count = DB.seedOfficial({ patients:3333, mustChange:false });
  /* If a central host server is reachable, synchronize the demonstration seed cleanly */
  if(typeof SYNC !== 'undefined' && SYNC.available()){
    try{
      const r = await SYNC._json('api/public/demo-bootstrap', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ db: DB.db })
      });
      if(r && r.ok) APPX.host = await hostProbe();
    }catch(e){}
  }
  return count;
}

/* ------------------------------------------------------------ landing */
function renderLanding6(){
  const th = (typeof landingTheme==='function') ? landingTheme() : { id:'heritage', mode:'dark', accent:'#E9C765' };
  const departments = DEPARTMENTS.slice(0, 10);
  const dept = d => `<div class="ld-dept" style="--c:${d.accent}">
      <span class="dot"></span><b>${esc(d.name)}</b><span>${esc(d.short)}</span></div>`;
  const facts = [
    { n: Object.keys(CAPS||{}).length, l:'Governed Capabilities' },
    { n: (typeof COUNTIES!=='undefined'?COUNTIES.length:2), l:'County Offices' },
    { n: (typeof COUNTIES!=='undefined'?COUNTIES.reduce((a,c)=>a+c.areas.length,0):10), l:'Ministry Areas' },
    { n: DEPARTMENTS.length, l:'Department Consoles' }
  ];
  const step = (icn, badgeTxt, title, body) => `<article class="ld-step">
      <div class="ld-step-top">
        <div class="ld-step-i">${ic(icn,18)}</div>
        <span class="ld-step-tag">${badgeTxt}</span>
      </div>
      <h3>${title}</h3>
      <p>${body}</p></article>`;
  const pillar = (icn, title, body) => `<article class="ld-pillar">
      <div class="ld-pillar-head"><div class="ld-pi">${ic(icn,18)}</div><h3>${title}</h3></div>
      <p>${body}</p></article>`;

  const teamCards = [
    {
      photo:'field_table',
      tag:'Field Care & Case Management',
      title:'Household Caregivers, Coordinators & Case Managers',
      body:'Supporting caregivers walk alongside vulnerable parents across all ten ministry areas with 30-day PDCA reviews, nutrition bags, adherence support and early clinical escalation so children remain safely in family care.'
    },
    {
      photo:'roundtable_forms',
      tag:'Clinical, Pharmacy & JOOTRH Desk',
      title:'Hospital Focal Persons, Clinicians & Pharmacy',
      body:'Hospital dispatch requests flow from caregiver assessment to clinical review, SHA verification, transport facilitation and receipt reconciliation without paperwork getting lost between offices.'
    },
    {
      photo:'charts_overhead',
      tag:'M&E, Finance, HR & Leadership',
      title:'Accountable Stewardship & Verified Reporting',
      body:'Finance, procurement, human resources, media governance and executive leadership coordinate from live pivot tables, regional maps and tamper-evident audit trails.'
    }
  ];

  return `<div class="ld" data-theme="${esc(th.id)}" data-mode="${esc(th.mode||'dark')}" style="--accent:${esc(th.accent||'#E9C765')}">
    <div class="ld-aurora" aria-hidden="true"><i></i><i></i></div>
    <div class="ld-weave" aria-hidden="true"></div>

    <header class="ld-top">
      <div class="row" style="gap:12px">
        <img src="${window.LOGO||''}" alt="LOMAMO Foundation Kenya" class="ld-logo">
        <div>
          <div class="ld-org">CareLink · ${esc(orgName())}</div>
          <div class="xs ld-dim">CareLink C-DIMS · Unified Operating System for All Foundation Departments &amp; Partners · v${esc(APP.version)}</div>
        </div>
      </div>
      <nav class="row ld-nav" style="gap:10px;flex-wrap:wrap">
        <button class="btn ld-btn-secondary btn-sm" data-act="goto-public">${ic('eye',14)} Visit LOMAMO · Public Portal</button>
        <button class="btn ld-btn-secondary btn-sm" data-act="login-request">${ic('userplus',14)} Request an Account</button>
        <button class="btn btn-primary ld-btn-primary btn-sm" data-act="open-signin">${ic('lock',14)} Sign In to CareLink</button>
      </nav>
    </header>

    <div class="ld-container">
      <section class="ld-hero">
        <div class="ld-hero-copy">
          <div class="ld-eyebrow">${ic('heart',14)} CareLink OS · Saving Lives, Preventing Orphans · LOMAMO Foundation</div>
          <h1>CareLink.<br><em>One Foundation. One Operating System.</em></h1>
          <p class="ld-lede">CareLink unites every LOMAMO department, hospital referral desk, government oversight partner and international medical reviewer in one governed operating system, enforcing least-privilege access at the data layer and protecting household confidentiality by design.</p>
          <div class="row ld-cta-row">
            <button class="btn btn-primary ld-cta ld-btn-primary" data-act="goto-login">${ic('lock',17)} Proceed to My CareLink Console ${ic('chevron',16)}</button>
            <button class="btn ld-cta ld-btn-secondary" data-act="login-request">${ic('userplus',17)} Request an Account</button>
          </div>
          <div class="ld-assure">
            <span>${ic('database',15)} Real-time central Wi-Fi DB</span>
            <span>${ic('wifi',15)} Identical PC &amp; tablet experience</span>
            <span>${ic('shieldcheck',15)} SHA-256 tamper-evident audit</span>
            <span>${ic('key',15)} 4-office credential governance</span>
          </div>
        </div>

        <div class="ld-hero-art" aria-hidden="true">
          <div class="ld-canvas-card">
            <svg viewBox="0 0 460 264" class="ld-scene-svg">
              <defs>
                <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#F5C451" stop-opacity="0.34"/>
                  <stop offset="60%" stop-color="#38BDF8" stop-opacity="0.12"/>
                  <stop offset="100%" stop-color="#0B1933" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="beamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.75"/>
                  <stop offset="50%" stop-color="#F5C451" stop-opacity="0.85"/>
                  <stop offset="100%" stop-color="#34D399" stop-opacity="0.75"/>
                </linearGradient>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.38"/>
                  <stop offset="100%" stop-color="#38BDF8" stop-opacity="0.0"/>
                </linearGradient>
              </defs>
              <path d="M-10,206 C75,176 120,230 205,200 C290,170 355,210 470,172" fill="none" stroke="rgba(56,189,248,0.16)" stroke-width="1.4"/>
              <path d="M-10,230 C85,200 140,248 225,218 C310,188 370,228 470,192" fill="none" stroke="rgba(245,196,81,0.14)" stroke-width="1.2"/>
              <circle cx="230" cy="126" r="102" fill="url(#coreGlow)"/>
              <circle cx="230" cy="126" r="95" fill="none" stroke="rgba(148,197,255,0.22)" stroke-width="1.2" stroke-dasharray="5 5"/>
              <circle cx="230" cy="126" r="64" fill="none" stroke="rgba(245,196,81,0.34)" stroke-width="1.4"/>
              <g stroke="url(#beamGrad)" stroke-width="1.4" opacity="0.74">
                <line x1="230" y1="126" x2="230" y2="28"/>
                <line x1="230" y1="126" x2="328" y2="58"/>
                <line x1="230" y1="126" x2="358" y2="126"/>
                <line x1="230" y1="126" x2="326" y2="196"/>
                <line x1="230" y1="126" x2="230" y2="224"/>
                <line x1="230" y1="126" x2="134" y2="196"/>
                <line x1="230" y1="126" x2="102" y2="126"/>
                <line x1="230" y1="126" x2="132" y2="58"/>
              </g>
              ${[
                [230,28,'Field Care','#38BDF8'], [328,58,'Hospital','#2DD4BF'],
                [358,126,'M&E / DHIS','#A78BFA'], [326,196,'Finance','#FBBF24'],
                [230,224,'Homestay','#F472B6'], [134,196,'Media & IT','#FB923C'],
                [102,126,'HR & Leave','#34D399'], [132,58,'Transport','#60A5FA']
              ].map(([x,y,lbl,col])=>`<g>
                <rect x="${x-38}" y="${y-12}" width="76" height="24" rx="12" fill="#0B1933" stroke="${col}" stroke-width="1.3"/>
                <circle cx="${x-26}" cy="${y}" r="3.5" fill="${col}"/>
                <text x="${x+4}" y="${y+3.8}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#F1F5F9">${lbl}</text>
              </g>`).join('')}
              <circle cx="230" cy="126" r="38" fill="#0E2248" stroke="#F5C451" stroke-width="2"/>
              <text x="230" y="123" text-anchor="middle" font-size="13" font-weight="800" fill="#FFFFFF" letter-spacing="0.6">CareLink</text>
              <text x="230" y="137" text-anchor="middle" font-size="8.2" font-weight="600" fill="#F5C451" letter-spacing="0.5">OS · C-DIMS</text>
            </svg>

            <div class="ld-facts">
              ${facts.map(f=>`<div class="ld-fact"><b>${num(f.n)}</b><span>${esc(f.l)}</span></div>`).join('')}
            </div>
            <div class="ld-spark">
              <svg viewBox="0 0 260 40" preserveAspectRatio="none">
                <path d="M0,38 L0,30 L36,24 L72,27 L108,16 L144,19 L180,10 L216,13 L260,6 L260,38 Z" fill="url(#areaGrad)"/>
                <path d="M0,30 L36,24 L72,27 L108,16 L144,19 L180,10 L216,13 L260,6" fill="none" stroke="#38BDF8" stroke-width="2.1" stroke-linecap="round"/>
                <path d="M0,35 L36,32 L72,31 L108,25 L144,24 L180,19 L216,20 L260,14" fill="none" stroke="#F5C451" stroke-width="1.6" stroke-dasharray="4 3" stroke-linecap="round"/>
              </svg>
              <span class="xs ld-dim">Architecture overview. Live clinical, financial and donor figures are calculated strictly from verified records inside each authorised workspace.</span>
            </div>
          </div>
        </div>
      </section>

      <section class="ld-band">
        <div class="ld-band-head">
          <div>
            <span class="ld-band-kicker">01 · Platform Architecture</span>
            <h2>From Field Capture to Regional Intelligence</h2>
          </div>
          <p class="ld-band-sub">One continuous pipeline connecting household visits, clinical decisions and verified county reporting across PCs and tablets.</p>
        </div>
        <div class="ld-flow">
          ${step('clipboard','Capture','Online & Offline Field Records','Record assessments with instant National ID returning-beneficiary checks, paper form digitisations, 30-day PDCA reviews and hospital dispatches on tablets or PCs.')}
          ${step('chart','Analyse','Live Pivot Tables, Charts & Maps','Cross-tabulate active caseloads in interactive pivot matrices, inspect Kisumu and Homa Bay ministry-area maps, and generate aligned Monday reports.')}
          ${step('flow','Interoperate','KHIS / DHIS2 Drafts & Web APIs','Prepare verified Ministry of Health draft summaries, export DHIS2 dataValueSets and FHIR R4 bundles, and connect local Ollama AI models safely.')}
        </div>
      </section>

      <section class="ld-band">
        <div class="ld-band-head">
          <div>
            <span class="ld-band-kicker">02 · Departments Working Together</span>
            <h2>United Around Every Household to Prevent Orphans</h2>
          </div>
          <p class="ld-band-sub">Every LOMAMO department contributes its distinct discipline on one shared operating system across ${facts[2].n} ministry areas.</p>
        </div>
        <div class="ld-team-grid">
          ${teamCards.map(tc=>`<article class="ld-team-card">
            <div class="ld-team-img">
              <img src="${carelinkPhoto(tc.photo)}" alt="${esc(tc.title)}" loading="lazy">
              <span class="ld-team-tag">${esc(tc.tag)}</span>
            </div>
            <div class="ld-team-body">
              <h3>${esc(tc.title)}</h3>
              <p>${esc(tc.body)}</p>
            </div>
          </article>`).join('')}
        </div>
        <div class="ld-strip">${departments.map(dept).join('')}</div>
      </section>

      <section class="ld-band">
        <div class="ld-band-head">
          <div>
            <span class="ld-band-kicker">03 · Institutional Safeguards</span>
            <h2>Built on Confidentiality, Stewardship &amp; Human Authority</h2>
          </div>
          <p class="ld-band-sub">Grounded in LOMAMO Foundation governance policies and the Kenya Data Protection Act (2019).</p>
        </div>
        <div class="ld-pillars">
          ${pillar('users','Role-Pure Department Consoles','Caregivers, Hospital Focal Persons, Medical Case Managers, Finance, Fleet, Media, HR and Leadership each see exclusively the tools belonging to their office.')}
          ${pillar('shield','Confidentiality in the Data Layer','Clinical diagnoses, HIV/TB status and safeguarding notes are enforced directly in repository queries and governed by recorded consent.')}
          ${pillar('sparkles','C-DIMS Coins & Staff Recognition','Transparent usage scores, data efficiency ratings, tier badges and C-DIMS Coins celebrate timely field documentation across every county office.')}
          ${pillar('route','Home-Visit Route Intelligence','The Visit Order Learner studies completed field days to propose practical next household stops while keeping human caregivers in full command.')}
        </div>
        <div class="ld-policy">
          <div class="ld-policy-h">${ic('book',15)} Institutional Policy Foundation · Kenya Data Protection Act (2019)</div>
          <div class="ld-policy-row">
            <span>CareLink Trial Usage Report (31 Aug 2026)</span>
            <span>Patient Confidentiality &amp; Ethical Storytelling Policy</span>
            <span>Procurement Policy Framework</span>
            <span>Constitution &amp; Bylaws</span>
            <span>Homestay &amp; Care Centre Protocol</span>
            <span>Vehicle, Transport &amp; Logistics Controls</span>
          </div>
        </div>
      </section>
    </div>

    <footer class="ld-foot">
      <div class="ld-foot-inner">
        <div class="ld-foot-brand">
          <img src="${window.LOGO||''}" alt="" class="ld-logo-sm">
          <div><b>${esc(orgName())}</b> · ${esc(APP.full)}</div>
        </div>
        <div class="xs ld-dim">Love Matters Most · Serving our Neighbours in Love · Version ${esc(APP.version)} · Schema ${esc(String(APP.schema))}</div>
      </div>
    </footer>
  </div>`;
}

/* ------------------------------------------------------------ sign-in */
/* Strict single-screen, zero-scrollbar split layout on desktop & landscape tablets,
   and clean single-screen compact brand + card on portrait tablets & phones. */
function renderLogin6(){
  const t = LOGIN6.tab;
  const tabBtn = (id, label) => `<button class="lg-tab ${t===id?'on':''}" data-act="login-tab" data-tab="${id}" type="button">${label}</button>`;
  const host = APPX.host;
  const pCount = (DB.db && DB.db.patients) ? DB.db.patients.length : 0;
  const uCount = (DB.db && DB.db.users) ? DB.db.users.length : 0;
  const hostLine = host
    ? `<div class="lg-host ok">${ic('database',13)}<span>Central Wi-Fi DB active · rev ${host.rev} · ${num(pCount)} patients &amp; ${num(uCount)} accounts loaded</span></div>`
    : `<div class="lg-host ok">${ic('check',13)}<span>Active dataset ready · ${num(pCount)} patients, ${num(uCount)} staff accounts &amp; 10 ministry areas</span></div>`;

  const slideIdx = ((LOGIN6.slide % LOGIN_TEAM_SLIDES.length) + LOGIN_TEAM_SLIDES.length) % LOGIN_TEAM_SLIDES.length;
  const curSlide = LOGIN_TEAM_SLIDES[slideIdx];

  const signIn = `
    <p class="lg-note">Sign in with your assigned LOMAMO Foundation username and password to open your role-scoped workspace. Need instant evaluation access on PC or tablet? Open the <b>Demo</b> tab above or sign in with password <code class="mono">LOMAMO2026</code>.</p>
    <form data-form="login6" autocomplete="on">
      <div class="field"><label for="lg-u">Username</label>
        <input class="input" id="lg-u" name="username" autocomplete="username" placeholder="e.g. director, mcm.kisumu, caregiver.nyalenda" required></div>
      <div class="field"><label for="lg-p">Password</label>
        <input class="input" id="lg-p" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></div>
      <label class="lg-check"><input type="checkbox" name="remember" checked> Keep session active on this device while in active use</label>
      <button class="btn btn-primary btn-block" type="submit" ${LOGIN6.busy?'disabled':''}>${LOGIN6.busy?'Verifying...':'Sign In to LOMAMO C-DIMS'} ${ic('chevron',16)}</button>
    </form>
    <div class="lg-links">
      <button class="linkbtn" data-act="login-tab" data-tab="demo" type="button">Explore demo accounts (${num(uCount)})</button>
      <button class="linkbtn" data-act="login-tab" data-tab="forgot" type="button">Forgotten password?</button>
      <button class="linkbtn" data-act="goto-onboard" type="button">Live host setup</button>
    </div>`;

  const allUsers = (DB.db && DB.db.users && DB.db.users.length) ? DB.db.users : [];
  const demoGroups = [
    { id:'all', label:'Key Roles' },
    { id:'lead', label:'Leadership' },
    { id:'field', label:'10 Areas' },
    { id:'clinical', label:'Medical' },
    { id:'ops', label:'Depts' }
  ];
  const pickUsers = (() => {
    const f = LOGIN6.demoFilter || 'all';
    const byU = u => allUsers.find(x=>x.username===u);
    if(f==='lead') return ['director','president','chief.admin','program.admin','program.assistant','kisumu.admin','homabay.admin','kisumu.assistant'].map(byU).filter(Boolean);
    if(f==='field') return ['coord.nyalenda','caregiver.nyalenda','caregiver.nairobird','caregiver.manyatta','caregiver.nyahera','caregiver.chiga','caregiver.ombeyi','caregiver.ahero','caregiver.makongeni','caregiver.shauriyako','caregiver.sofia','homestay.kisumu'].map(byU).filter(Boolean);
    if(f==='clinical') return ['depthead.medical','mcm.kisumu','mcm.homabay','nurse.kisumu','focal.kisumu','focal.homabay','homestay.homabay','chw.nyalenda'].map(byU).filter(Boolean);
    if(f==='ops') return ['finance.kisumu','finance.homabay','procurement','me.kisumu','auditor','media.head','pr.officer','hr.officer','welfare.officer','vehicle.officer','ict.officer'].map(byU).filter(Boolean);
    return ['director','chief.admin','program.admin','kisumu.admin','homabay.admin','mcm.kisumu','focal.kisumu','caregiver.nyalenda','caregiver.makongeni','finance.kisumu','me.kisumu','hr.officer'].map(byU).filter(Boolean);
  })();

  const demoTab = `
    <div class="row" style="justify-content:space-between;gap:6px;margin-bottom:6px;flex-wrap:wrap">
      <div class="lg-subpills">
        ${demoGroups.map(g=>`<button type="button" class="lg-subpill ${LOGIN6.demoFilter===g.id?'on':''}" data-act="demo-filter" data-f="${g.id}">${esc(g.label)}</button>`).join('')}
      </div>
      <button type="button" class="btn btn-xs btn-soft" data-act="load-demo">${ic('refresh',12)} Reload 3,333-Patient Demo</button>
    </div>
    <div class="lg-demo-grid">
      ${pickUsers.slice(0,10).map(u=>`<button type="button" class="lg-demo-item" data-act="quick-login" data-u="${esc(u.username)}">
        <b>${esc(u.jobTitle || u.name)}</b>
        <span>${esc(u.username)} · ${esc(countyName(u.countyId))}</span>
      </button>`).join('')}
    </div>
    <div class="lg-links" style="margin-top:6px">
      <span class="xs muted">Password for all demo accounts: <b class="mono">LOMAMO2026</b></span>
      <button class="linkbtn" data-act="goto-onboard" type="button">Run 4-step host setup</button>
    </div>`;

  const activate = `
    <p class="lg-note">Enter your assigned username and the one-time activation code issued by the Chief System Administrator, then set a personal password of at least 10 characters.</p>
    <form data-form="activate6">
      <div class="grid g2" style="gap:8px">
        <div class="field"><label>Username</label><input class="input" name="username" required autocomplete="username" placeholder="e.g. caregiver.nyalenda"></div>
        <div class="field"><label>Activation code</label><input class="input mono" name="code" placeholder="ACT-XXXXXX" required style="text-transform:uppercase"></div>
        <div class="field"><label>New password</label><input class="input" name="password" type="password" minlength="10" required autocomplete="new-password" placeholder="Min. 10 chars"></div>
        <div class="field"><label>Confirm password</label><input class="input" name="password2" type="password" minlength="10" required autocomplete="new-password" placeholder="Repeat password"></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Activate My Account</button>
    </form>`;

  const request = `
    <p class="lg-note">Submit an official access request to the Chief System Administrator. Once verified, you receive an assigned username and a one-time activation code to set your password.</p>
    <form data-form="request6">
      <div class="grid g2" style="gap:8px">
        <div class="field"><label>Full name</label><input class="input" name="name" required placeholder="Full staff name"></div>
        <div class="field"><label>Phone number</label><input class="input" name="phone" placeholder="07..."></div>
        <div class="field"><label>Job title</label><input class="input" name="jobTitle" required placeholder="e.g. Supporting Caregiver"></div>
        <div class="field"><label>Department</label><select class="input" name="departmentId">${DEPARTMENTS.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
        <div class="field"><label>County office</label><select class="input" name="countyId">${COUNTIES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Reason for access</label><input class="input" name="justification" required placeholder="Assigned role & area"></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Submit Account Request</button>
    </form>`;

  const forgot = `
    <p class="lg-note">Request a 24-hour emergency login code from the System Administrator, or enter an issued emergency code below to set a replacement password immediately.</p>
    <form data-form="forgot6" class="row" style="gap:8px;align-items:flex-end;margin-bottom:8px">
      <div class="field" style="flex:1;margin:0"><label>Username</label><input class="input" name="username" required autocomplete="username" placeholder="Your username"></div>
      <button class="btn btn-ghost" type="submit" style="white-space:nowrap">Request code</button>
    </form>
    <form data-form="emergency6">
      <div class="grid g2" style="gap:8px">
        <div class="field"><label>Emergency code</label><input class="input mono" name="code" placeholder="EMG-XXXXXXXX" required style="text-transform:uppercase"></div>
        <div class="field"><label>Username</label><input class="input" name="username" required placeholder="Your username"></div>
      </div>
      <div class="field"><label>New personal password</label><input class="input" name="password" type="password" minlength="10" required placeholder="At least 10 characters"></div>
      <button class="btn btn-primary btn-block" type="submit">Verify Emergency Code &amp; Reset</button>
    </form>`;

  const body = t==='demo'?demoTab : t==='activate'?activate : t==='request'?request : t==='forgot'?forgot : signIn;

  return `<div class="lg6">
    <aside class="lg6-brand">
      <div class="lg6-brand-top">
        <div class="row" style="gap:11px;margin-bottom:10px">
          <img src="${window.LOGO||''}" alt="LOMAMO Foundation" class="lg6-logo" style="margin:0">
          <div>
            <div class="xs bold" style="letter-spacing:.11em;text-transform:uppercase;color:#F5C451">CareLink Operating System · LOMAMO Foundation</div>
            <div class="xs" style="color:#CBD6E8">Orphan Prevention, Clinical Care &amp; Partner Governance</div>
          </div>
        </div>
        <h1>CareLink.<br><em>One Foundation. One Operating System.</em></h1>

        <figure class="lg6-showcase">
          <div class="lg6-photo-frame">
            <img class="lg6-photo-bg" src="${carelinkPhoto(curSlide.key)}" alt="" aria-hidden="true">
            <img class="lg6-photo-main" src="${carelinkPhoto(curSlide.key)}" alt="${esc(curSlide.title)}">
            <div class="lg6-photo-overlay">
              <span class="lg6-photo-tag">${esc(curSlide.tag)}</span>
              <b>${esc(curSlide.title)}</b>
              <span>${esc(curSlide.dept)}</span>
            </div>
          </div>
          <div class="lg6-thumbs" role="tablist" aria-label="Department teamwork gallery">
            ${LOGIN_TEAM_SLIDES.map((s, idx)=>`<button type="button" class="lg6-thumb ${idx===slideIdx?'on':''}" data-act="login-slide" data-idx="${idx}" title="${esc(s.tag)}">
              <img src="${carelinkPhoto(s.key)}" alt="">
              <span>${esc(s.tag.split(' ')[0])}</span>
            </button>`).join('')}
          </div>
        </figure>

        <p class="lg6-copy">Every department of LOMAMO Foundation collaborates on one governed database across office Wi-Fi and offline in the field, uniting clinical care, household support and stewardship so children never become orphans.</p>
      </div>
      <div class="lg6-brand-foot">
        <div><b>${esc(APP.full)}</b> · v${esc(APP.version)}</div>
        <div class="xs">Love Matters Most · Serving our Neighbours in Love · Saving Lives, Preventing Orphans</div>
      </div>
    </aside>

    <main class="lg6-panel">
      <div class="lg6-mobile-hero">
        <img src="${carelinkPhoto(curSlide.key)}" alt="">
        <div class="lg6-mobile-hero-txt">
          <div class="xs bold" style="color:#F5C451;text-transform:uppercase;letter-spacing:.08em">LOMAMO Foundation</div>
          <b>One Foundation. <em>One Operating System.</em></b>
        </div>
      </div>
      <div class="lg6-card">
        <div class="lg6-head">
          <img src="${window.LOGO||''}" alt="" class="lg6-mark">
          <div style="flex:1">
            <div class="lg6-kicker">${esc(orgName())}</div>
            <h2>${t==='demo'?'Active Demo Accounts':t==='activate'?'Activate Account':t==='request'?'Request an Account':t==='forgot'?'Account Recovery':'Sign In to Console'}</h2>
          </div>
          <button class="btn btn-xs btn-ghost" data-act="goto-landing" type="button">Front page</button>
        </div>
        ${hostLine}
        ${LOGIN6.error?`<div class="alert crit lg6-alert">${ic('alert',15)}<span>${esc(LOGIN6.error)}</span></div>`:''}
        ${LOGIN6.notice?`<div class="alert ok lg6-alert">${ic('check',15)}<span>${esc(LOGIN6.notice)}</span></div>`:''}
        <div class="lg-tabs">
          ${tabBtn('signin','Sign in')}
          ${tabBtn('demo','Demo')}
          ${tabBtn('activate','Activate')}
          ${tabBtn('request','Request')}
          ${tabBtn('forgot','Recover')}
        </div>
        <div class="lg6-body">${body}</div>
        <div class="lg6-foot">
          <span>CareLink · CareLink C-DIMS v${esc(APP.version)} · Schema ${esc(String(APP.schema))}</span>
          <span>Data Protection Act, 2019</span>
        </div>
      </div>
    </main>
  </div>`;
}

/* ------------------------------------------------------------ forced change */
function renderMustChange(){
  const u = AUTH.user;
  return `<div class="lg6 one">
    <main class="lg6-panel">
      <div class="lg6-card">
        <div class="lg6-head"><img src="${window.LOGO||''}" alt="" class="lg6-mark">
          <div><div class="lg6-kicker">First sign-in</div><h2>Choose your own password</h2></div></div>
        <p class="lg-note">You signed in with a temporary password issued by the administrator. Choose a personal password known only to you. It is stored as a salted hash and cannot be read back by anyone.</p>
        <div class="lg6-id"><span class="avatar">${initials(u.name)}</span>
          <div><b>${esc(u.name)}</b><div class="xs muted">${esc((roleObj(u.roleId)||{}).name||'')} · ${esc(u.username)}</div></div></div>
        ${LOGIN6.error?`<div class="alert crit lg6-alert">${ic('alert',15)}<span>${esc(LOGIN6.error)}</span></div>`:''}
        <form data-form="mustchange6">
          <div class="field"><label>Current (temporary) password</label><input class="input" type="password" name="current" required autocomplete="current-password"></div>
          <div class="field"><label>New password</label><input class="input" type="password" name="password" minlength="10" required autocomplete="new-password">
            <div class="hint">At least 10 characters. A mix of letters, digits and a symbol is stronger.</div></div>
          <div class="field"><label>Repeat the new password</label><input class="input" type="password" name="password2" minlength="10" required autocomplete="new-password"></div>
          <button class="btn btn-primary btn-block" type="submit">Save and open my console</button>
        </form>
        <div class="lg6-foot"><button class="linkbtn" data-act="logout" type="button">Sign out instead</button></div>
      </div>
    </main></div>`;
}

/* ------------------------------------------------------------ first run */
function renderOnboarding6(){
  if(!ONB.host) ONB.host = APPX.host || null;
  const host = ONB.host;
  const step = ONB.step;
  const dots = [1,2,3,4].map(i=>`<span class="ob-dot ${step>=i?'on':''}"></span>`).join('');
  const head = `<div class="ob-head">
      <img src="${window.LOGO||''}" alt="" class="lg6-mark">
      <div><div class="lg6-kicker">First-run setup · LOMAMO C-DIMS v${APP.version}</div>
        <h2>Configure live host or load full demonstration dataset</h2></div>
      <div class="ob-dots">${dots}</div></div>`;

  let body = '';
  if(step===1){
    body = `<p class="lg-note">Use this wizard when commissioning a fresh office host computer, or click <b>Load Full 3,333-Patient Demo</b> below to enter immediately with all 47 staff accounts, 10 ministry areas and departmental records ready for evaluation.</p>
      <div class="field"><label>Organisation name</label><input class="input" id="ob-org" value="${esc(ONB.org.name)}"></div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Short name</label><input class="input" id="ob-short" value="${esc(ONB.org.shortName)}"></div>
        <div class="field"><label>Primary county office</label><select class="input" id="ob-county">${COUNTIES.map(c=>`<option value="${c.id}" ${ONB.org.county===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      </div>
      <div class="ob-host ${host?'ok':'warn'}">
        ${host ? `${ic('database',16)}<div><b>Central Wi-Fi database detected at this address</b>
            <span>Revision ${host.rev}${host.setup?' - host is already set up; you can sign in directly or reload demonstration records.':''}</span></div>`
              : `${ic('wifi',16)}<div><b>Standalone device mode active</b>
            <span>All features and demonstration records run directly on this device. Run <b>AUTO-START-WIFI.bat</b> on the office host PC to sync tablets live over Wi-Fi.</span></div>`}
      </div>`;
  }
  if(step===2){
    body = `<p class="lg-note">Create the Chief System Administrator account. This office manages roles, issues staff credentials and oversees host backups while remaining subject to clinical privacy boundaries.</p>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Full name</label><input class="input" id="ob-name" value="${esc(ONB.admin.name)}" placeholder="e.g. Washington Ayub Odero"></div>
        <div class="field"><label>Username</label><input class="input" id="ob-user" value="${esc(ONB.admin.username||'chief.admin')}" placeholder="chief.admin"></div>
      </div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Password</label><input class="input" id="ob-pw" type="password" minlength="10" autocomplete="new-password">
          <div class="hint" id="ob-strength">At least 10 characters.</div></div>
        <div class="field"><label>Repeat the password</label><input class="input" id="ob-pw2" type="password" minlength="10" autocomplete="new-password"></div>
      </div>`;
  }
  if(step===3){
    const roster = OFFICIAL_ROSTER;
    const hs = ONB.hostSetup;
    body = hs? `<div class="ob-host-setup">
        <div class="ob-hs-h">${ic('database',17)}<div><b>This host already holds an installation</b>
          <span>The host computer at ${esc(hs.host||'this address')} answered that it is already set up${hs.accounts?` and holds ${num(hs.accounts)} provisioned account${hs.accounts===1?'':'s'}`:''}. First-run setup commissions a <i>fresh</i> host; it never overwrites a live one, and it cannot create a second administrator on a host that already has one.</span></div></div>
        <p class="lg-note">This is not a fault and you are not stuck. Choose one of the three ways forward below - the wizard continues from whichever you choose.</p>
        <div class="ob-hs-opts">
          <button class="ob-choice on" type="button" data-act="ob-attach-signin">
            <b>1 · I already have an account - sign me in</b>
            <span>The normal path for a tablet or a second office computer. The installation stays exactly as the administrator left it.</span></button>
          <button class="ob-choice" type="button" data-act="ob-attach-request">
            <b>2 · Ask the administrator for an account</b>
            <span>Writes a request to the host. ${esc(hs.admins&&hs.admins.length? 'The senior offices who can approve it: '+hs.admins.join(', ')+'.':'The Chief Administrator approves it from Users & accounts.')}</span></button>
          <button class="ob-choice" type="button" data-act="ob-attach-device">
            <b>3 · Continue on this device only</b>
            <span>Keeps working offline on this device with its own record. It does not touch the host installation, and it can be joined to it later from Settings.</span></button>
        </div>
        ${ONB.advice?`<div class="alert info lg6-alert">${ic('info',15)}<span>${esc(ONB.advice)}</span></div>`:''}
      </div>`
    : `<p class="lg-note">The official roster of ${roster.length} leadership, county, clinical, departmental and ministry-area accounts will be provisioned. On a live host, unique temporary passwords are saved once into your confidential master sheet.</p>
      <div class="ob-roster">
        ${roster.slice(0,10).map(r=>`<div class="ob-r"><b>${esc(r.name)}</b><span>${esc(r.username)}</span><i>${esc((ROLE(r.roleId)||{}).name||r.roleId)}</i></div>`).join('')}
        <div class="ob-r more">plus ${roster.length-10} additional accounts across Kisumu &amp; Homa Bay</div>
      </div>`;
  }
  if(step===4){
    body = `<p class="lg-note">Choose whether to start with the full 3,333-patient demonstration register across all 10 ministry areas and 14 departments, or an empty production register ready for live intake.</p>
      <div class="ob-choice ${ONB.seed==='reference'?'on':''}" data-act="ob-seed" data-seed="reference">
        <b>Load full 3,333-patient &amp; full-department dataset</b>
        <span>95% between 45 and 240 days, 5% between 241 and 330 days, plus clinical, hospital, pharmacy, finance, HR, fleet, media, library and 122-item equipment registers.</span>
      </div>
      <div class="ob-choice ${ONB.seed==='empty'?'on':''}" data-act="ob-seed" data-seed="empty">
        <b>Start with an empty patient register</b>
        <span>For live clinical intake or master workbook import.</span>
      </div>`;
  }
  const footer = `<div class="ob-actions">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${step>1?`<button class="btn btn-ghost" data-act="ob-back" type="button">Back</button>`
                :`<button class="btn btn-ghost" data-act="goto-landing" type="button">Front page</button>`}
        <button class="btn btn-soft" data-act="load-demo" type="button">${ic('sparkles',15)} Load Full 3,333-Patient Demo</button>
      </div>
      ${step===3 && ONB.hostSetup
        ? `<button class="btn btn-primary" data-act="ob-attach-signin" type="button">Go to sign-in ${ic('chevron',15)}</button>`
        : `<button class="btn btn-primary" data-act="ob-next" type="button" ${ONB.busy?'disabled':''}>
        ${step===3?(host?'Issue credentials & continue':'Continue'):step===4?'Finish setup':'Continue'} ${ic('chevron',15)}</button>`}
    </div>`;

  return `<div class="lg6 one ob-scroll"><main class="lg6-panel wide"><div class="lg6-card ob-card">
      ${head}
      ${ONB.error?`<div class="alert crit lg6-alert">${ic('alert',15)}<span>${esc(ONB.error)}</span></div>`:''}
      <div class="ob-body">${body}</div>
      ${footer}
      <div class="lg6-foot"><span>Step ${step} of 4</span><span>v${APP.version} · schema ${APP.schema}</span></div>
    </div></main></div>`;
}

/* ------------------------------------------------------------ actions */
Object.assign(ACTIONS, {
  'login-tab': d => { LOGIN6.tab=d.tab; LOGIN6.error=''; LOGIN6.notice=''; render(); },
  'login-slide': d => { LOGIN6.slide = Number(d.idx)||0; render(); },
  'demo-filter': d => { LOGIN6.demoFilter = d.f || 'all'; render(); },
  'login-request': () => { LOGIN6.tab='request'; APPX.screen='login'; LOGIN6.error=''; render(); },
  'goto-login': () => { APPX.screen='login'; LOGIN6.tab='signin'; LOGIN6.error=''; LOGIN6.notice=''; render(); },
  'open-signin': () => { APPX.screen='login'; LOGIN6.tab='signin'; LOGIN6.error=''; LOGIN6.notice=''; render(); window.scrollTo({top:0}); },
  'goto-landing': () => { APPX.screen='landing'; LOGIN6.error=''; render(); window.scrollTo({top:0}); },
  'goto-onboard': () => { APPX.screen='onboard'; ONB.step=1; ONB.error=''; render(); window.scrollTo({top:0}); },

  /* Works everywhere (PC, Tablet, Onboarding, Sign-In, Settings) in one tap */
  'load-demo': async () => {
    LOGIN6.busy = true; ONB.busy = true;
    try{
      const count = await activateFullDemoDataset();
      LOGIN6.busy = false; ONB.busy = false;
      APPX.screen = 'login';
      LOGIN6.tab = 'demo';
      LOGIN6.error = '';
      LOGIN6.notice = `Loaded ${num(count)} patients, ${DB.db.users.length} accounts across all 10 ministry areas & all departments. Tap any role below or sign in with password LOMAMO2026.`;
      toast('Demonstration dataset active', `${num(count)} patients and ${DB.db.users.length} staff accounts loaded across all departments.`, 'ok');
      render();
    }catch(e){
      LOGIN6.busy = false; ONB.busy = false;
      toast('Could not load dataset', e.message, 'err');
      render();
    }
  },

  'ob-seed': d => { ONB.seed = d.seed; render(); },
  /* --- the host is already set up: three honest ways forward --- */
  'ob-attach-signin': () => {
    ONB.error=''; ONB.hostSetup = ONB.hostSetup || { host:(ONB.host&&ONB.host.host)||location.host };
    APPX.screen='login'; LOGIN6.tab='signin'; LOGIN6.busy=false; ONB.busy=false;
    LOGIN6.notice = 'This host is already set up, so nothing was changed on it. Sign in with the account the administrator issued. If you do not have one yet, choose "Request an account".';
    render(); window.scrollTo({top:0});
  },
  'ob-attach-request': () => {
    ONB.error=''; APPX.screen='login'; LOGIN6.tab='request'; LOGIN6.busy=false; ONB.busy=false;
    LOGIN6.notice = 'Ask for an account on this host. The Chief Administrator, the County Office Administrator, the Country Director or the Chief Program Administrator approves it from Users & accounts, and your temporary password is issued there - never by email.';
    render(); window.scrollTo({top:0});
  },
  'ob-attach-device': () => {
    ONB.error=''; ONB.mode='device'; ONB.hostSetup=null; ONB.host=null; ONB.step=4; ONB.busy=false;
    ONB.advice='This device will keep its own record. It is not joined to the host installation, and joining it later is a merge, not an overwrite.';
    render(); window.scrollTo({top:0});
  },
  'ob-device': () => { ONB.mode='device'; ONB.step=2; render(); },
  'ob-back': () => { ONB.step = Math.max(1, ONB.step-1); ONB.error=''; render(); },
  'ob-next': async () => {
    ONB.error='';
    const step = ONB.step;
    if(step===1){
      const name = ($('#ob-org')||{}).value || ONB.org.name;
      const short = ($('#ob-short')||{}).value || 'LOMAMO';
      const county = ($('#ob-county')||{}).value || 'kisumu';
      ONB.org = {name:name.trim(), shortName:short.trim(), county};
      ONB.step = 2; return render();
    }
    if(step===2){
      const name = (($('#ob-name')||{}).value||'').trim();
      const username = (($('#ob-user')||{}).value||'').trim().toLowerCase();
      const pw = ($('#ob-pw')||{}).value||'';
      const pw2 = ($('#ob-pw2')||{}).value||'';
      if(!name) return toast('A name is required','Enter the administrator full name.','err');
      if(!/^[a-z0-9][a-z0-9._-]{2,40}$/.test(username)) return toast('Choose a username','3 to 40 characters: letters, digits, dot, dash or underscore.','err');
      if(pw.length<10) return toast('Choose a longer password','At least 10 characters.','err');
      if(pw!==pw2) return toast('The passwords do not match','Re-type the same password in both boxes.','err');
      ONB.admin = {name, username, password:pw, confirm:pw2};
      ONB.step = 3; return render();
    }
    if(step===3){
      if(!ONB.host){
        DB.reset();
        seedOfficial(DB.db, new Date(), {patients: ONB.seed==='empty'?0:3333, mustChange:false});
        const admin = DB.db.users.find(u=>u.username==='chief.admin') || DB.db.users[0];
        if(admin){
          admin.name = ONB.admin.name;
          admin.username = ONB.admin.username;
          admin.salt = newSalt();
          admin.hash = strongHash(ONB.admin.password, admin.salt);
          admin.mustChange = false;
        }
        DB.db.settings.org = ONB.org;
        DB.db.settings.onboarding = {complete:true, step:9};
        DB.save();
        ONB.step = 4;
        return render();
      }
      ONB.busy = true; render();
      try{
        DB.reset();
        const now = new Date();
        seedOfficial(DB.db, now, {patients: ONB.seed==='empty'?0:3333, mustChange:true});
        const admin = DB.db.users.find(u=>u.username==='chief.admin') || DB.db.users[0];
        admin.name = ONB.admin.name; admin.username = ONB.admin.username; admin.id = 'u-chief-admin';
        admin.salt = newSalt(); admin.hash = strongHash(ONB.admin.password, admin.salt);
        admin.mustChange = false; admin.provisioned = true; admin.execTeam = true;
        DB.db.settings.org = ONB.org;
        DB.db.settings.onboarding = {complete:true, step:9};
        DB.db.meta.label = 'Live installation';
        DB.save();
        const r = await SYNC._json('api/setup', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({db: DB.db, admin: ONB.admin, org: ONB.org})});
        if(!r.ok){
          ONB.busy=false;
          const b = r.body||{};
          /* The host already holds an installation. That is an answer, not a
             failure: the wizard stops commissioning and offers the three ways
             forward, so nobody is left staring at step 3 of 4. */
          if(b.code==='already_setup'){
            ONB.hostSetup = { host:(ONB.host&&ONB.host.host)||location.host, accounts:b.accounts||0, admins:b.admins||[] };
            ONB.advice = b.advice || 'If you are the administrator and need to commission this host again, restore a backup or clear the host database first (Settings -> Backup & restore on the host). Re-running first-run setup against a live installation is refused on purpose: it would replace every account and every record on it.';
            ONB.error='';
            AUDIT.append({actor:'first-run', action:'setup.already_provisioned', entity:'host',
              detail:'Host answered already_setup; wizard switched to attach / sign-in / device-only paths'});
            return render();
          }
          ONB.error = b.error || 'The host refused the first-run document.';
          return render();
        }
        const login = await AUTH.loginOnline(ONB.admin.username, ONB.admin.password, 'first-run');
        if(!login.ok){ ONB.busy=false; ONB.error = login.error||'The host accepted setup; please sign in manually.'; ONB.step=4; return render(); }
        await SYNC.pullFull();
        const accounts = OFFICIAL_ROSTER.filter(r=>r.username!==ONB.admin.username).map(r=>({
          id:'u-'+r.username.replace(/[.]/g,'-'), username:r.username, name:r.name,
          roleName:(ROLE(r.roleId)||{}).name||r.roleId, county:(COUNTIES.find(c=>c.id===r.countyId)||{}).name||'',
          mustChange:true
        }));
        const prov = await SYNC._json('api/credentials/provision', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({accounts})});
        ONB.issued = prov.ok ? prov.body.issued : null;
        ONB.busy=false; ONB.step = 4;
        if(ONB.issued){
          const text = credMasterText(ONB.issued, ONB.host.host+':'+(ONB.host.port||location.port||8000));
          downloadText('LOMAMO-C-DIMS-credentials-'+new Date().toISOString().slice(0,10)+'.txt', text);
          LOGIN6.notice = 'The master credentials file has been downloaded. Keep it in secure custody.';
        }
        render();
      }catch(e){
        ONB.busy=false; ONB.error = 'Setup stopped: '+e.message; render();
      }
      return;
    }
    if(step===4){
      ONB.busy = true; render();
      try{
        if(ONB.seed==='reference'){
          if((DB.db.patients||[]).length < 100) DB.seedOfficial({patients:3333, mustChange:false});
          if(typeof SYNC!=='undefined' && SYNC.sessionToken) await SYNC.push();
        } else {
          DB.db.patients = []; DB.db.visits = []; DB.db.pdcas = []; DB.db.requests = [];
          DB.save();
          if(typeof SYNC!=='undefined' && SYNC.sessionToken) await SYNC.push();
        }
        if(ONB.host && typeof SYNC!=='undefined' && SYNC.sessionToken) await SYNC.pullFull();
        APPX.showMustChange = false;
        AUTH.mustChange = false;
        ONB.busy = false;
        APPX.screen='login'; LOGIN6.tab='signin';
        LOGIN6.notice = 'Setup complete. Sign in below to enter your console.';
        render();
      }catch(e){ ONB.busy=false; ONB.error='Could not finish: '+e.message; render(); }
      return;
    }
  }
});

Object.assign(ACTIONS, {
  'msg-open': d => {
    const other = (DB.db.users||[]).find(u=>u.id===d.u);
    if(!other) return toast('Not found','That account no longer exists.','err');
    if(!MESSAGING.inReach(AUTH.user, other)) return toast('Not permitted','That person is outside your reach.','err');
    go('messages', {thread:'dm:'+[AUTH.user.id, other.id].sort().join(':')});
  },
  'mj-load': async () => {
    SYNC.journal = await SYNC.mergeJournal();
    render();
  }
});

Object.assign(FORMS, {
  login6: async (d) => {
    const username = String(d.get('username')||'').trim().toLowerCase();
    const password = String(d.get('password')||'');
    LOGIN6.error=''; LOGIN6.notice=''; LOGIN6.busy=true; render();
    try{
      let res = await AUTH.loginOnline(username, password, 'this device');
      if(!res.ok){
        /* Allow local verified credential login when offline OR when the host server
           has not yet run live credential provisioning (e.g. fresh LAN tablet test). */
        const hostUnprovisioned = !APPX.host || !APPX.host.setup;
        if(res.code==='offline' || res.code==='failed' || res.status===0 || hostUnprovisioned){
          if(!(DB.db && DB.db.users && DB.db.users.length)) await activateFullDemoDataset();
          const local = AUTH.login(username, password);
          res = local.ok ? {ok:true, user:local.user, mustChange:Boolean(local.user.mustChange)} : {ok:false, error: local.msg};
        }
      }
      LOGIN6.busy = false;
      if(res.ok){
        APPX.screen='app';
        try{ sessionStorage.setItem('carelink.lastUser', AUTH.user.username); }catch(e){}
        SESSION.start();
        if(AUTH.mustChange || res.mustChange){ AUTH.mustChange=true; render(); return; }
        NAVH.reset(); NAVH.push('home',{}); APPX.view='home'; APPX.params={};
        render();
        if(typeof SYNC!=='undefined' && SYNC.sessionToken) SYNC.startPolling();
      } else {
        LOGIN6.error = res.error || res.msg || 'That username and password were not accepted.';
        render();
      }
    }catch(e){
      LOGIN6.busy=false; LOGIN6.error='Sign-in could not complete: '+e.message; render();
    }
  },

  mustchange6: async (d) => {
    const current = String(d.get('current')||''), next = String(d.get('password')||''), again = String(d.get('password2')||'');
    if(next !== again) return toast('The passwords do not match','Re-type the same new password.','err');
    const strength = passwordStrength(next);
    if(strength.n < 2) return toast('Choose a stronger password','Use at least 10 characters with letters and digits.','err');
    let r = {ok:false};
    if(SYNC.sessionToken) r = await AUTH.changeOnServer(current, next);
    if(!r.ok){
      const local = AUTH.setPassword(next);
      if(local && local.ok === false){ LOGIN6.error = local.msg; return render(); }
    }
    AUTH.mustChange = false;
    LOGIN6.error='';
    toast('Password saved','Your console is now open with your personal password.','ok');
    render();
  },

  activate6: async (d) => {
    const username = String(d.get('username')||'').trim().toLowerCase();
    const code = String(d.get('code')||'').trim().toUpperCase();
    const pw = String(d.get('password')||''), pw2 = String(d.get('password2')||'');
    if(pw!==pw2) return toast('The passwords do not match','Re-type the same password.','err');
    if(passwordStrength(pw).n < 2) return toast('Choose a stronger password','At least 10 characters with letters and digits.','err');
    const r = await SYNC._json('api/public/activate', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username, code, password: pw})});
    if(r.ok){
      LOGIN6.tab='signin'; LOGIN6.error=''; LOGIN6.notice='Account activated. Sign in with your new password.';
      return render();
    }
    const act = (DB.db.pendingActivations||[]).find(a=>a.username===username && a.code===code && !a.used && new Date(a.expiresAt)>new Date());
    const usr = (DB.db.users||[]).find(u=>u.username===username);
    if(act && usr){
      act.used = true; act.usedAt = new Date().toISOString();
      usr.salt = newSalt(); usr.hash = strongHash(pw, usr.salt); usr.active = true; usr.status = 'active'; usr.mustChange = false;
      AUDIT.append({ actor:usr.id, action:'account.activated', entity:'user', entityId:usr.id, detail:`Activated via code ${code}` });
      DB.save();
      LOGIN6.tab='signin'; LOGIN6.error=''; LOGIN6.notice='Account activated. Sign in now with your chosen password.';
      return render();
    }
    LOGIN6.error = (r.body && r.body.error) || 'Invalid or expired activation code for that username.';
    render();
  },

  request6: async (d) => {
    const body = {};
    ['name','jobTitle','departmentId','countyId','phone','justification'].forEach(k=>body[k]=String(d.get(k)||'').trim());
    const r = await SYNC._json('api/public/account-request', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)});
    const ref = (r.ok && r.body && r.body.ref) ? r.body.ref : ('REQ-' + Math.floor(100000 + Math.random()*900000));
    DB.db.accountRequests = DB.db.accountRequests || [];
    DB.db.accountRequests.push({ id:uid('arq'), ref, ...body, status:'pending', submittedAt:new Date().toISOString() });
    AUDIT.append({ actor:'public', action:'account.requested', entity:'accountRequest', entityId:ref, detail:`${body.name} (${body.jobTitle})` });
    DB.save();
    LOGIN6.tab='signin'; LOGIN6.error='';
    LOGIN6.notice = `Request ${ref} recorded. Once approved, the System Administrator issues your username and ACT activation code.`;
    render();
  },

  forgot6: async (d) => {
    const username = String(d.get('username')||'').trim().toLowerCase();
    const r = await SYNC._json('api/auth/forgot', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username})});
    const ref = (r.ok && r.body && r.body.reference) ? r.body.reference : ('REC-' + Math.floor(10000 + Math.random()*90000));
    DB.db.recoveryRequests = DB.db.recoveryRequests || [];
    DB.db.recoveryRequests.push({ id:uid('rec'), reference:ref, username, at:new Date().toISOString(), status:'open' });
    AUDIT.append({ actor:username||'unknown', action:'auth.recovery_requested', entity:'user', entityId:username, detail:`Reference ${ref}` });
    DB.save();
    LOGIN6.error='';
    LOGIN6.notice = `Recovery request ${ref} logged for the System Administrator, who can issue a 24-hour EMG code.`;
    LOGIN6.tab='forgot';
    render();
  },

  emergency6: async (d) => {
    const username = String(d.get('username')||'').trim().toLowerCase();
    const code = String(d.get('code')||'').trim().toUpperCase();
    const password = String(d.get('password')||'');
    if(passwordStrength(password).n < 2) return toast('Choose a stronger password','Use at least 10 characters with letters and digits.','err');
    const r = await SYNC._json('api/auth/emergency', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username, code, password})});
    if(r.ok){
      LOGIN6.tab='signin'; LOGIN6.notice='Password reset with emergency code. Sign in now.'; LOGIN6.error='';
      return render();
    }
    const emg = (DB.db.emergencyCodes||[]).find(e=>e.username===username && e.code===code && !e.used && new Date(e.expiresAt)>new Date());
    const usr = (DB.db.users||[]).find(u=>u.username===username);
    if(emg && usr){
      emg.used = true; emg.usedAt = new Date().toISOString();
      usr.salt = newSalt(); usr.hash = strongHash(password, usr.salt); usr.mustChange = false;
      AUDIT.append({ actor:usr.id, action:'auth.emergency_reset', entity:'user', entityId:usr.id, detail:'Reset via 24h emergency code' });
      DB.save();
      LOGIN6.tab='signin'; LOGIN6.notice='Password reset with emergency code. Sign in now.'; LOGIN6.error='';
      return render();
    }
    LOGIN6.error = (r.body && r.body.error) || 'Invalid or expired emergency code.';
    render();
  }
});

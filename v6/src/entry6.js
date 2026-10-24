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
  step:1, host:null, org:{ name:'LOMAMO Foundation Kenya', county:'kisumu', shortName:'LOMAMO', emailDomain:'lomamo.example' },
  admin:{ name:'', username:'', password:'', confirm:'' },
  mode:'host', roster:[], issued:null, seed:'reference', busy:false, error:'',
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
  return `${line}\n  LOMAMO FOUNDATION · CARELINK C-DIMS v${APP.version}\n  OFFICIAL ACCOUNT MASTER FILE  -  CONFIDENTIAL\n${line}\n
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

/* ------------------------------------------------------------ landing (strict 100dvh, zero scrollbar) */
function renderLanding6(){
  const th = (typeof landingTheme==='function') ? landingTheme() : { id:'heritage', mode:'dark', accent:'#E9C765' };
  const isActivated = (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated());
  const facts = [
    { n: Object.keys(CAPS||{}).length, l:'Governed Capabilities' },
    { n: (typeof COUNTIES!=='undefined'?COUNTIES.length:2), l:'County Offices' },
    { n: (typeof COUNTIES!=='undefined'?COUNTIES.reduce((a,c)=>a+c.areas.length,0):10), l:'Ministry Areas' },
    { n: DEPARTMENTS.length, l:'Department Consoles' }
  ];

  return `<div class="ld" data-front="1" data-theme="${esc(th.id)}" data-mode="${esc(th.mode||'dark')}" style="--accent:${esc(th.accent||'#E9C765')}">
    <div class="ld-aurora" aria-hidden="true"><i></i><i></i></div>
    <div class="ld-weave" aria-hidden="true"></div>

    <header class="ld-top">
      <div class="row" style="gap:11px">
        <img src="${window.LOGO||''}" alt="LOMAMO Foundation Kenya" class="ld-logo">
        <div>
          <div class="ld-org">CareLink · ${esc(orgName())}</div>
          <div class="xs ld-dim">CareLink C-DIMS · Unified Operating System for All Foundation Departments &amp; Partners · v${esc(APP.version)}</div>
        </div>
      </div>
      <nav class="row ld-nav" style="gap:8px;flex-wrap:wrap">
        <button class="btn ld-btn-arch btn-sm" data-act="goto-architecture">${ic('flow',14)} Platform Architecture &amp; Departments</button>
        <button class="btn ld-btn-secondary btn-sm" data-act="goto-public">${ic('eye',14)} Public Impact Portal</button>
        <button class="btn ld-btn-secondary btn-sm" data-act="login-request">${ic('userplus',14)} Request an Account</button>
        <button class="btn btn-primary ld-btn-primary btn-sm" data-act="open-signin">${ic('lock',14)} Sign In to CareLink</button>
      </nav>
    </header>

    <div class="ld-container ld-front-main">
      <section class="ld-hero ld-hero-tight">
        <div class="ld-hero-copy">
          <div class="ld-eyebrow">${ic('heart',14)} LOMAMO Foundation Kenya · Loving Hands Management &amp; Medical Organization</div>
          <h1>CareLink.<br><em>Saving lives, preventing orphans.</em></h1>
          <div class="ld-subhead">One Foundation. One Operating System.</div>
          <p class="ld-lede">CareLink unites every LOMAMO department, hospital referral desk, government oversight partner and international medical reviewer in one role-pure operating system — enforcing least-privilege access at the data layer so vulnerable parents recover and children remain safely in family care.</p>
          <div class="row ld-cta-row">
            <button class="btn btn-primary ld-cta ld-btn-primary" data-act="goto-login">${ic('lock',17)} Proceed to My CareLink Console ${ic('chevron',16)}</button>
            <button class="btn ld-cta ld-btn-arch" data-act="goto-architecture"><img src="${carelinkPhoto('united_hands')}" alt="" class="ld-arch-thumb"> Platform Architecture &amp; Departments Working Together</button>
            ${!isActivated ? `<button class="btn ld-cta ld-btn-secondary" data-act="login-request">${ic('userplus',16)} Request Access</button>` : ''}
          </div>
          <div class="ld-assure">
            <span>${ic('database',14)} Unified online &amp; office Wi-Fi DB</span>
            <span>${ic('wifi',14)} Zero-scroll PC &amp; tablet workspace</span>
            <span>${ic('shieldcheck',14)} SHA-256 tamper-evident audit</span>
            <span>${ic('sparkles',14)} CareLink AI workflow guidance</span>
          </div>
        </div>

        <div class="ld-hero-art" aria-hidden="true">
          <div class="ld-canvas-card ld-canvas-tight">
            <svg viewBox="0 0 460 236" class="ld-scene-svg">
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
              <path d="M-10,192 C75,164 120,214 205,186 C290,158 355,196 470,160" fill="none" stroke="rgba(56,189,248,0.16)" stroke-width="1.4"/>
              <circle cx="230" cy="116" r="92" fill="url(#coreGlow)"/>
              <circle cx="230" cy="116" r="86" fill="none" stroke="rgba(148,197,255,0.22)" stroke-width="1.2" stroke-dasharray="5 5"/>
              <circle cx="230" cy="116" r="58" fill="none" stroke="rgba(245,196,81,0.34)" stroke-width="1.4"/>
              <g stroke="url(#beamGrad)" stroke-width="1.4" opacity="0.74">
                <line x1="230" y1="116" x2="230" y2="26"/>
                <line x1="230" y1="116" x2="324" y2="54"/>
                <line x1="230" y1="116" x2="354" y2="116"/>
                <line x1="230" y1="116" x2="322" y2="180"/>
                <line x1="230" y1="116" x2="230" y2="206"/>
                <line x1="230" y1="116" x2="138" y2="180"/>
                <line x1="230" y1="116" x2="106" y2="116"/>
                <line x1="230" y1="116" x2="136" y2="54"/>
              </g>
              ${[
                [230,26,'Field Care','#38BDF8'], [324,54,'Hospital','#2DD4BF'],
                [354,116,'M&E / DHIS','#A78BFA'], [322,180,'Finance','#FBBF24'],
                [230,206,'Homestay','#F472B6'], [138,180,'Media & IT','#FB923C'],
                [106,116,'HR & Leave','#34D399'], [136,54,'Transport','#60A5FA']
              ].map(([x,y,lbl,col])=>`<g>
                <rect x="${x-38}" y="${y-11}" width="76" height="22" rx="11" fill="#0B1933" stroke="${col}" stroke-width="1.3"/>
                <circle cx="${x-26}" cy="${y}" r="3.4" fill="${col}"/>
                <text x="${x+4}" y="${y+3.5}" text-anchor="middle" font-size="9.2" font-weight="700" fill="#F1F5F9">${lbl}</text>
              </g>`).join('')}
              <circle cx="230" cy="116" r="35" fill="#0E2248" stroke="#F5C451" stroke-width="2"/>
              <text x="230" y="113" text-anchor="middle" font-size="12.5" font-weight="800" fill="#FFFFFF" letter-spacing="0.6">CareLink</text>
              <text x="230" y="126" text-anchor="middle" font-size="8" font-weight="600" fill="#F5C451" letter-spacing="0.5">OS · C-DIMS</text>
            </svg>

            <div class="ld-facts">
              ${facts.map(f=>`<div class="ld-fact"><b>${num(f.n)}</b><span>${esc(f.l)}</span></div>`).join('')}
            </div>
            <div class="ld-spark">
              <svg viewBox="0 0 260 32" preserveAspectRatio="none">
                <path d="M0,30 L0,24 L36,19 L72,21 L108,13 L144,15 L180,8 L216,10 L260,5 L260,30 Z" fill="url(#areaGrad)"/>
                <path d="M0,24 L36,19 L72,21 L108,13 L144,15 L180,8 L216,10 L260,5" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round"/>
                <path d="M0,28 L36,25 L72,24 L108,19 L144,18 L180,14 L216,15 L260,11" fill="none" stroke="#F5C451" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round"/>
              </svg>
              <span class="xs ld-dim">Unified CareLink workflow graphic across Kisumu &amp; Homa Bay. Explore full Platform Architecture &amp; Departments Working Together via the button above.</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer class="ld-foot ld-foot-tight">
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

/* ------------------------------------------------------------ dedicated architecture & departments page */
function renderArchitecture6(){
  const th = (typeof landingTheme==='function') ? landingTheme() : { id:'heritage', mode:'dark', accent:'#E9C765' };
  const departments = DEPARTMENTS.slice(0, 10);
  const dept = d => `<div class="ld-dept" style="--c:${d.accent}">
      <span class="dot"></span><b>${esc(d.name)}</b><span>${esc(d.short)}</span></div>`;
  const areaCount = (typeof COUNTIES!=='undefined'?COUNTIES.reduce((a,c)=>a+c.areas.length,0):10);
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
      body:'Supporting caregivers walk alongside vulnerable parents across all ten ministry areas with 30-day PDCA reviews, paediatric Weight/BMI/MUAC growth surveillance, nutrition bags, adherence support and early clinical escalation so children remain safely in family care.'
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
      body:'Finance, procurement, human resources, media governance and executive leadership coordinate from live budget-vs-expenditure boards, pivot tables, regional maps and tamper-evident audit trails.'
    }
  ];

  return `<div class="ld ld-arch-page" data-theme="${esc(th.id)}" data-mode="${esc(th.mode||'dark')}" style="--accent:${esc(th.accent||'#E9C765')}">
    <div class="ld-aurora" aria-hidden="true"><i></i><i></i></div>
    <div class="ld-weave" aria-hidden="true"></div>

    <header class="ld-top" style="position:sticky;top:0;z-index:20">
      <div class="row" style="gap:12px">
        <img src="${window.LOGO||''}" alt="LOMAMO Foundation Kenya" class="ld-logo">
        <div>
          <div class="ld-org">CareLink Architecture &amp; Institutional Overview</div>
          <div class="xs ld-dim">${esc(orgName())} · Platform Architecture, Departments Working Together &amp; Safeguards</div>
        </div>
      </div>
      <nav class="row ld-nav" style="gap:10px;flex-wrap:wrap">
        <button class="btn ld-btn-secondary btn-sm" data-act="goto-landing">${ic('back',14)} Back to CareLink Front Page</button>
        <button class="btn ld-btn-secondary btn-sm" data-act="goto-public">${ic('eye',14)} Public Impact Portal</button>
        <button class="btn btn-primary ld-btn-primary btn-sm" data-act="open-signin">${ic('lock',14)} Sign In to CareLink</button>
      </nav>
    </header>

    <div class="ld-container">
      <section class="ld-band" style="border-top:none">
        <div class="ld-band-head">
          <div>
            <span class="ld-band-kicker">01 · Platform Architecture</span>
            <h2>From Field Capture to Regional Intelligence</h2>
          </div>
          <p class="ld-band-sub">One continuous pipeline connecting household visits, clinical decisions and verified county reporting across PCs and tablets.</p>
        </div>
        <div class="ld-flow">
          ${step('clipboard','Capture','Online & Offline Field Records','Record assessments with instant National ID returning-beneficiary checks, physical hard-copy form digitisations, 30-day PDCA reviews, child Weight/BMI/MUAC curves and hospital dispatches on tablets or PCs.')}
          ${step('chart','Analyse','Live Pivot Tables, Budgets & Maps','Cross-tabulate active caseloads in interactive pivot matrices, track Expenditure Against Budget in real time, inspect Kisumu and Homa Bay ministry-area maps, and generate aligned Monday reports.')}
          ${step('flow','Interoperate','KHIS / DHIS2 Drafts & CareLink AI','Prepare verified Ministry of Health draft summaries, export DHIS2 dataValueSets and FHIR R4 bundles, and run the AI-assisted Intelligent Workflow Engine toward 100% data completion.')}
        </div>
      </section>

      <section class="ld-band">
        <div class="ld-band-head">
          <div>
            <span class="ld-band-kicker">02 · Departments Working Together</span>
            <h2>United Around Every Household to Prevent Orphans</h2>
          </div>
          <p class="ld-band-sub">Every LOMAMO department contributes its distinct discipline on one shared operating system across ${areaCount} ministry areas.</p>
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
          ${pillar('route','AI-Assisted Intelligent Workflow Engine','Smart daily priorities and 100% data-quality guidance assist every staff member across personal, departmental, county and global scopes.')}
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
        <div class="row" style="justify-content:space-between;margin-top:24px;flex-wrap:wrap;gap:12px">
          <button class="btn ld-btn-secondary" data-act="goto-landing">${ic('back',15)} Return to CareLink Front Page</button>
          <button class="btn btn-primary ld-btn-primary" data-act="open-signin">${ic('lock',15)} Proceed to Sign In ${ic('chevron',15)}</button>
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
  const isActivated = (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated());
  const isAwaitingAct = (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isAwaitingGlobalActivation && PROD_SETUP.isAwaitingGlobalActivation());
  if(isActivated && LOGIN6.tab === 'demo') LOGIN6.tab = 'signin';
  const t = LOGIN6.tab;
  const tabBtn = (id, label) => `<button class="lg-tab ${t===id?'on':''}" data-act="login-tab" data-tab="${id}" type="button">${label}</button>`;
  const host = APPX.host;
  const pCount = (DB.db && DB.db.patients) ? DB.db.patients.length : 0;
  const uCount = (DB.db && DB.db.users) ? DB.db.users.length : 0;
  const hostLine = isActivated
    ? `<div class="lg-host ok">${ic('shieldcheck',13)}<span>Official Production System Active · ${num(uCount)} organogram accounts governed across Kisumu &amp; Homa Bay</span></div>`
    : (isAwaitingAct
      ? `<div class="lg-host warn">${ic('key',13)}<span>4-Step Live Host Setup complete — sign in as Chief System Administrator to change password &amp; <b>Activate System Globally</b></span></div>`
      : (host
        ? `<div class="lg-host ok">${ic('database',13)}<span>Central Wi-Fi DB active · rev ${host.rev} · ${num(pCount)} patients &amp; ${num(uCount)} accounts loaded</span></div>`
        : `<div class="lg-host ok">${ic('check',13)}<span>Active dataset ready · ${num(pCount)} patients, ${num(uCount)} staff accounts &amp; 10 ministry areas</span></div>`));

  const slideIdx = ((LOGIN6.slide % LOGIN_TEAM_SLIDES.length) + LOGIN_TEAM_SLIDES.length) % LOGIN_TEAM_SLIDES.length;
  const curSlide = LOGIN_TEAM_SLIDES[slideIdx];

  const signIn = `
    <p class="lg-note">${isActivated
      ? 'Sign in with your assigned CareLink username or official email and your personal password (or your WhatsApp temporary password on first sign-in to activate your account).'
      : 'Sign in with your assigned LOMAMO Foundation username or official email and password to open your role-scoped workspace.'}</p>
    <form data-form="login6" autocomplete="on">
      <div class="field"><label for="lg-u">Username or Official Email</label>
        <input class="input" id="lg-u" name="username" autocomplete="username" placeholder="e.g. chief.admin, director, caregiver.nyalenda" required></div>
      <div class="field"><label for="lg-p">Password</label>
        <input class="input" id="lg-p" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></div>
      <label class="lg-check"><input type="checkbox" name="remember" checked> Keep session active on this device while in active use</label>
      <button class="btn btn-primary btn-block" type="submit" ${LOGIN6.busy?'disabled':''}>${LOGIN6.busy?'Verifying...':'Sign In to CareLink C-DIMS'} ${ic('chevron',16)}</button>
    </form>
    <div class="lg-links">
      ${!isActivated ? `<button class="linkbtn" data-act="login-tab" data-tab="demo" type="button">Explore demo accounts (${num(uCount)})</button>` : ''}
      <button class="linkbtn" data-act="login-tab" data-tab="request" type="button">Request county account</button>
      <button class="linkbtn" data-act="login-tab" data-tab="forgot" type="button">Forgotten password?</button>
      ${!isActivated ? `<button class="linkbtn" data-act="goto-onboard" type="button">Live host setup</button>` : ''}
    </div>`;

  const allUsers = (DB.db && DB.db.users && DB.db.users.length) ? DB.db.users : [];
  const demoGroups = [
    { id:'all', label:'Key Roles' },
    { id:'lead', label:'Leadership' },
    { id:'field', label:'10 Areas' },
    { id:'clinical', label:'Medical' },
    { id:'ops', label:'Depts' },
    { id:'deputy', label:'Deputies/Clerks' }
  ];
  const pickUsers = (() => {
    const f = LOGIN6.demoFilter || 'all';
    const byU = u => allUsers.find(x=>x.username===u);
    if(f==='lead') return ['director','president','chief.admin','program.admin','program.assistant','exec.secretary','kisumu.admin','homabay.admin'].map(byU).filter(Boolean);
    if(f==='field') return ['coord.nyalenda','caregiver.nyalenda','caregiver.nairobird','caregiver.manyatta','caregiver.nyahera','caregiver.chiga','caregiver.ombeyi','caregiver.ahero','caregiver.makongeni','caregiver.shauriyako'].map(byU).filter(Boolean);
    if(f==='clinical') return ['depthead.medical','deputy.medical','mcm.kisumu','mcm.homabay','nurse.kisumu','focal.kisumu','focal.homabay','homestay.kisumu'].map(byU).filter(Boolean);
    if(f==='ops') return ['finance.kisumu','procurement','me.kisumu','auditor','media.head','pr.officer','hr.officer','welfare.officer','vehicle.officer','ict.officer'].map(byU).filter(Boolean);
    if(f==='deputy') return ['exec.secretary','secretary.kisumu','secretary.homabay','deputy.procurement','deputy.finance','deputy.medical','deputy.hr','clerk.records.kisumu','clerk.stores.kisumu','clerk.data.kisumu'].map(byU).filter(Boolean);
    return ['director','chief.admin','program.admin','kisumu.admin','homabay.admin','mcm.kisumu','focal.kisumu','caregiver.nyalenda','finance.kisumu','procurement'].map(byU).filter(Boolean);
  })();

  const demoTab = `
    <div class="row" style="justify-content:space-between;gap:6px;margin-bottom:5px;flex-wrap:wrap">
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
    <div class="lg-links" style="margin-top:5px">
      <span class="xs muted">Password for all demo accounts: <b class="mono">LOMAMO2026</b></span>
      <button class="linkbtn" data-act="goto-onboard" type="button">Run 4-step host setup</button>
    </div>`;

  const activate = `
    <p class="lg-note">Received a WhatsApp temporary password? Simply use the <b>Sign in</b> tab to activate immediately, or redeem a legacy ACT code below.</p>
    <form data-form="activate6">
      <div class="grid g2" style="gap:6px">
        <div class="field"><label>Username</label><input class="input" name="username" required autocomplete="username" placeholder="e.g. caregiver.nyalenda"></div>
        <div class="field"><label>Activation code</label><input class="input mono" name="code" placeholder="ACT-XXXXXX" required style="text-transform:uppercase"></div>
        <div class="field"><label>New password</label><input class="input" name="password" type="password" minlength="10" required autocomplete="new-password" placeholder="Min. 10 chars"></div>
        <div class="field"><label>Confirm password</label><input class="input" name="password2" type="password" minlength="10" required autocomplete="new-password" placeholder="Repeat password"></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Activate My Account</button>
    </form>`;

  const request = `
    <p class="lg-note">Routed <b>urgently</b> to your selected <b>County Office Administrator</b> (Kisumu Head Office or Homa Bay County Office) for verification and credential issuance.</p>
    <form data-form="request6">
      <div class="grid g2" style="gap:6px">
        <div class="field"><label>Full name *</label><input class="input" name="name" required placeholder="Full staff name"></div>
        <div class="field"><label>Phone / WhatsApp *</label><input class="input" name="phone" required placeholder="07..."></div>
        <div class="field"><label>Job title / Seat *</label><input class="input" name="jobTitle" required placeholder="e.g. Supporting Caregiver"></div>
        <div class="field"><label>Department</label><select class="input" name="departmentId">${DEPARTMENTS.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
        <div class="field"><label>County Office Admin *</label><select class="input" name="countyId">${COUNTIES.map(c=>`<option value="${c.id}">${esc(c.name)} Admin</option>`).join('')}</select></div>
        <div class="field"><label>Ministry area / Reason *</label><input class="input" name="justification" required placeholder="Assigned role & area"></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${ic('send',14)} Send Urgent Request to County Admin</button>
    </form>`;

  const forgot = `
    <p class="lg-note">Submit an <b>urgent password recovery request</b> directly to your <b>County Office Administrator</b>, or redeem an issued 24-hour emergency code below.</p>
    <form data-form="forgot6" style="margin-bottom:7px">
      <div class="grid g3" style="gap:6px;align-items:flex-end">
        <div class="field" style="margin:0"><label>Username / Email *</label><input class="input" name="username" required autocomplete="username" placeholder="Username"></div>
        <div class="field" style="margin:0"><label>County Office *</label><select class="input" name="countyId">${COUNTIES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <button class="btn btn-primary" type="submit" style="white-space:nowrap;padding:7px 10px">Alert County Admin</button>
      </div>
    </form>
    <form data-form="emergency6">
      <div class="grid g3" style="gap:6px">
        <div class="field"><label>EMG code</label><input class="input mono" name="code" placeholder="EMG-XXXX" required style="text-transform:uppercase"></div>
        <div class="field"><label>Username</label><input class="input" name="username" required placeholder="Username"></div>
        <div class="field"><label>New password</label><input class="input" name="password" type="password" minlength="10" required placeholder="10+ chars"></div>
      </div>
      <button class="btn btn-ghost btn-block" type="submit">Redeem 24h Emergency Code</button>
    </form>`;

  const body = (!isActivated && t==='demo') ? demoTab : t==='activate' ? activate : t==='request' ? request : t==='forgot' ? forgot : signIn;

  return `<div class="lg6">
    <aside class="lg6-brand">
      <div class="lg6-brand-top">
        <div class="row" style="gap:11px;margin-bottom:8px">
          <img src="${window.LOGO||''}" alt="LOMAMO Foundation" class="lg6-logo" style="margin:0">
          <div>
            <div class="xs bold" style="letter-spacing:.11em;text-transform:uppercase;color:#F5C451">CareLink Operating System · LOMAMO Foundation</div>
            <div class="xs" style="color:#CBD6E8">Orphan Prevention, Clinical Care &amp; Partner Governance</div>
          </div>
        </div>
        <h1>CareLink.<br><em>Saving lives, preventing orphans.</em></h1>
        <div class="xs bold" style="color:#E2E8F0;margin:-4px 0 7px">One Foundation. One Operating System.</div>

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
          <b>CareLink. <em>Saving lives, preventing orphans.</em></b>
        </div>
      </div>
      <div class="lg6-card">
        <div class="lg6-head">
          <img src="${window.LOGO||''}" alt="" class="lg6-mark">
          <div style="flex:1">
            <div class="lg6-kicker">${esc(orgName())}</div>
            <h2>${(!isActivated && t==='demo')?'Active Demo Accounts':t==='activate'?'Activate Account':t==='request'?'Urgent County Account Request':t==='forgot'?'Urgent Password Recovery':'Official Staff Sign In'}</h2>
          </div>
          <button class="btn btn-xs btn-ghost" data-act="goto-landing" type="button">Front page</button>
        </div>
        ${hostLine}
        ${LOGIN6.error?`<div class="alert crit lg6-alert">${ic('alert',15)}<span>${esc(LOGIN6.error)}</span></div>`:''}
        ${LOGIN6.notice?`<div class="alert ok lg6-alert">${ic('check',15)}<span>${esc(LOGIN6.notice)}</span></div>`:''}
        <div class="lg-tabs" style="grid-template-columns:repeat(${isActivated?4:5},1fr)">
          ${tabBtn('signin','Sign in')}
          ${!isActivated ? tabBtn('demo','Demo') : ''}
          ${tabBtn('activate','Activate')}
          ${tabBtn('request','Request')}
          ${tabBtn('forgot','Recover')}
        </div>
        <div class="lg6-body">${body}</div>
        <div class="lg6-foot">
          <span>CareLink C-DIMS v${esc(APP.version)} · Schema ${esc(String(APP.schema))}</span>
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
          <div><div class="lg6-kicker">First Sign-In · Data Protection Act, 2019</div><h2>Create your private password</h2></div></div>
        <p class="lg-note">You signed in with a one-time SMS password issued during commissioning. Set your personal password below — it must be at least <b>12 characters</b> with uppercase, lowercase, digit and symbol, and is stored only as a salted one-way hash so <b>not even the Chief System Administrator knows your password</b>.</p>
        <div class="lg6-id"><span class="avatar">${initials(u.name)}</span>
          <div><b>${esc(u.name)}</b><div class="xs muted">${esc((roleObj(u.roleId)||{}).name||'')} · ${esc(u.username)}</div></div></div>
        ${LOGIN6.error?`<div class="alert crit lg6-alert">${ic('alert',15)}<span>${esc(LOGIN6.error)}</span></div>`:''}
        <form data-form="mustchange6">
          <div class="field"><label>Current (one-time SMS) password</label><input class="input" type="password" name="current" required autocomplete="current-password"></div>
          <div class="field"><label>New private password (12+ chars)</label><input class="input" type="password" name="password" minlength="12" required autocomplete="new-password">
            <div class="hint">Minimum 12 characters including uppercase (A–Z), lowercase (a–z), number (0–9) and symbol (@ # % &amp; * ! ?).</div></div>
          <div class="field"><label>Repeat your new private password</label><input class="input" type="password" name="password2" minlength="12" required autocomplete="new-password"></div>
          <button class="btn btn-primary btn-block" type="submit">Save private password &amp; open my console</button>
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
      <div><div class="lg6-kicker">First-Run Production Setup · CareLink C-DIMS v${APP.version}</div>
        <h2>Commission Chief System Administrator &amp; SMS Credentials</h2></div>
      <div class="ob-dots">${dots}</div></div>`;

  let body = '';
  if(step===1){
    body = `<p class="lg-note">Run the <b>4-Step Live Host Setup</b> to establish CareLink's institutional host &amp; organogram structure. Upon completion you return to the <b>Official Sign-In screen</b>, sign in as Chief System Administrator, change your password, and click <b>Activate System Globally</b> to generate the Team WhatsApp Credential Sheet.</p>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Organisation name</label><input class="input" id="ob-org" value="${esc(ONB.org.name)}"></div>
        <div class="field"><label>Official staff email domain</label><input class="input mono" id="ob-domain" value="${esc(ONB.org.emailDomain||'lomamo.example')}" placeholder="e.g. lomamofoundation.org"></div>
      </div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Short name</label><input class="input" id="ob-short" value="${esc(ONB.org.shortName)}"></div>
        <div class="field"><label>Primary county office (Head Office)</label><select class="input" id="ob-county">${COUNTIES.map(c=>`<option value="${c.id}" ${ONB.org.county===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      </div>
      <div class="ob-host ${host?'ok':'info'}">
        ${host ? `${ic('database',16)}<div><b>Unified Online Site Database connected at this address</b>
            <span>Revision ${host.rev}. Completing Steps 1–4 establishes global user structures and prepares Official Sign-In.</span></div>`
              : `${ic('database',16)}<div><b>4-Step Live Host Commissioning Ready</b>
            <span>Establishes global organogram accounts (including applicable Secretaries, Deputies &amp; Clerks), returns to Official Sign-In for Chief Admin password change, then enables <b>Activate System Globally</b>.</span></div>`}
      </div>`;
  }
  if(step===2){
    body = `<p class="lg-note">Establish the <b>Chief System Administrator</b> commissioning account and initial setup password. Immediately after Step 4 returns you to the <b>Official Sign-In screen</b>, you will sign in with this initial setup password and be prompted to set your private personal password before clicking <b>Activate System Globally</b>.</p>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Chief System Administrator full name</label><input class="input" id="ob-name" value="${esc(ONB.admin.name||'Chief System Administrator')}" placeholder="e.g. Chief System Administrator"></div>
        <div class="field"><label>Username</label><input class="input" id="ob-user" value="${esc(ONB.admin.username||'chief.admin')}" placeholder="chief.admin"></div>
      </div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Initial Commissioning Setup Password (12+ chars)</label><input class="input" id="ob-pw" type="password" minlength="12" value="${esc(ONB.admin.password||'')}" autocomplete="new-password" oninput="(function(v){var el=document.getElementById('ob-strength');if(!el)return;var u={name:(document.getElementById('ob-name')||{}).value||'',username:(document.getElementById('ob-user')||{}).value||''};var err=(typeof PROD_SETUP!=='undefined')?PROD_SETUP.validatePrivacyPassword(v,u):(v.length<12?'At least 12 characters required.':'');el.textContent=err?err:'Strong commissioning password ready ('+v.length+' chars).';el.style.color=err?'var(--crit)':'var(--ok)';})(this.value)">
          <div class="hint" id="ob-strength">At least 12 characters with uppercase, lowercase, digit &amp; symbol. You will replace this on Official Sign-In.</div></div>
        <div class="field"><label>Repeat initial setup password</label><input class="input" id="ob-pw2" type="password" minlength="12" value="${esc(ONB.admin.confirm||'')}" autocomplete="new-password"></div>
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
    const pack = (typeof PROD_SETUP!=='undefined') ? PROD_SETUP.lastPack : null;
    body = `<p class="lg-note">Choose whether to start with the full 3,333-patient synthetic reference register across all 10 ministry areas and 14 departments, or an empty production register ready for live intake.</p>
      ${pack ? `<div class="alert ok" style="margin-bottom:12px">${ic('check',16)}<div>
        <b>${num(pack.count)} Staff Accounts Provisioned with Unique Strong SMS Passwords</b>
        <span class="small">Download your SMS distribution pack below before closing. Every user will be required on first login to replace their SMS password with a private 12+ character password known only to them.</span>
        <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-xs btn-primary" type="button" data-act="dev-dl-sms-csv">${ic('download',13)} Download SMS Spreadsheet (.csv)</button>
          <button class="btn btn-xs btn-ghost" type="button" data-act="dev-dl-sms-txt">${ic('download',13)} Download SMS Dispatch Sheet (.txt)</button>
        </div>
      </div></div>` : ''}
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
  'goto-architecture': () => { APPX.screen='architecture'; LOGIN6.error=''; render(); window.scrollTo({top:0}); },
  'goto-onboard': () => {
    if (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated()) {
      APPX.screen='login'; LOGIN6.tab='signin'; return render();
    }
    APPX.screen='onboard'; ONB.step=1; ONB.error=''; render(); window.scrollTo({top:0});
  },

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
  'ob-back': () => {
    if(ONB.step===2){
      ONB.admin = {
        name: (($('#ob-name')||{}).value || ONB.admin.name || '').trim(),
        username: (($('#ob-user')||{}).value || ONB.admin.username || '').trim().toLowerCase(),
        password: ($('#ob-pw')||{}).value || ONB.admin.password || '',
        confirm: ($('#ob-pw2')||{}).value || ONB.admin.confirm || ''
      };
    }
    ONB.step = Math.max(1, ONB.step-1); ONB.error=''; render();
  },
  'ob-next': async () => {
    ONB.error='';
    const step = ONB.step;
    if(step===1){
      const name = ($('#ob-org')||{}).value || ONB.org.name;
      const short = ($('#ob-short')||{}).value || 'LOMAMO';
      const county = ($('#ob-county')||{}).value || 'kisumu';
      const emailDomain = (($('#ob-domain')||{}).value || ONB.org.emailDomain || 'lomamo.example').replace(/^@+/,'').trim().toLowerCase();
      ONB.org = {name:name.trim(), shortName:short.trim(), county, emailDomain};
      ONB.step = 2; return render();
    }
    if(step===2){
      const name = (($('#ob-name')||{}).value||'').trim();
      const username = (($('#ob-user')||{}).value||'').trim().toLowerCase();
      const pw = ($('#ob-pw')||{}).value||'';
      const pw2 = ($('#ob-pw2')||{}).value||'';
      if(!name) return toast('A name is required','Enter the administrator full name.','err');
      if(!/^[a-z0-9][a-z0-9._-]{2,40}$/.test(username)) return toast('Choose a username','3 to 40 characters: letters, digits, dot, dash or underscore.','err');
      const policyErr = (typeof PROD_SETUP!=='undefined') ? PROD_SETUP.validatePrivacyPassword(pw, {name, username}) : (pw.length<12?'At least 12 characters required.':'');
      if(policyErr) return toast('Strengthen password', policyErr, 'err');
      if(pw!==pw2) return toast('The passwords do not match','Re-type the same password in both boxes.','err');
      ONB.admin = {name, username, password:pw, confirm:pw2};
      ONB.step = 3; return render();
    }
    if(step===3){
      ONB.step = 4; return render();
    }
    if(step===4){
      ONB.busy = true; render();
      try{
        const res = await PROD_SETUP.completeFourStepHostSetup({
          orgNameVal: ONB.org.name,
          shortNameVal: ONB.org.shortName,
          emailDomain: ONB.org.emailDomain || 'lomamo.example',
          loginUrl: (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'https://carelink.lomamo.org',
          primaryCounty: ONB.org.county || 'kisumu',
          chiefName: ONB.admin.name || 'Chief System Administrator',
          chiefUsername: ONB.admin.username || 'chief.admin',
          chiefPassword: ONB.admin.password,
          seedMode: ONB.seed
        });
        APPX.showMustChange = false;
        ONB.busy = false;
        APPX.screen = 'login';
        LOGIN6.tab = 'signin';
        LOGIN6.error = '';
        LOGIN6.notice = `4-Step Live Host Setup complete. Sign in below as ${res.chiefUsername} (${res.chiefEmail}), set your private personal password, then click "Activate System Globally" to generate the Team WhatsApp Credential Sheet.`;
        toast('Live Host Setup Complete', 'Sign in as Chief System Administrator to change your password and Activate System Globally.', 'ok');
        render();
      }catch(e){ ONB.busy=false; ONB.error='Could not finish host setup: '+e.message; render(); }
      return;
    }
  }
});

Object.assign(ACTIONS, {
  'msg-open': d => {
    const other = (DB.db.users||[]).find(u=>u.id===d.u);
    if(!other) return toast('Not found','That account no longer exists.','err');
    if(!MESSAGING.inReach(AUTH.user, other)){
      go('messages', { thread:'global:all', mode:'global', focusChat:'1' });
      setTimeout(()=>{ const el=document.querySelector('#msgComposeInput'); if(el) el.focus(); }, 30);
      return toast('Opened Global Broadcast Channel', `${other.name.replace(/^Demo - /,'')} is in ${countyName(other.countyId)}; coordinate via the Global Foundation Channel.`, 'info');
    }
    const dmThread = 'dm:' + [AUTH.user.id, other.id].sort().join(':');
    go('messages', { thread:dmThread, to:other.id, focusChat:'1' });
    setTimeout(()=>{ const el=document.querySelector('#msgComposeInput'); if(el) el.focus(); }, 30);
  },
  'msg-save-draft': d => {
    const inp = document.querySelector('#msgComposeInput');
    const txt = inp ? String(inp.value||'').trim() : '';
    if(!txt) return toast('Write a message first','Type your coordination note before saving it to Workspace Drafts.','warn');
    DB.db.workspaceDrafts = DB.db.workspaceDrafts || [];
    DB.db.workspaceDrafts.unshift({
      id: uid('wdr'), kind:'message',
      title: `Draft Message — ${d.title || d.thread || 'Coordination'}`,
      ownerId: AUTH.user.id, countyId: AUTH.user.countyId || 'kisumu', dept: AUTH.user.departmentId || 'ministry',
      targetView:'messages', targetParams:{ thread:d.thread||'global:all', draftText:txt, focusChat:'1' },
      summary: txt.slice(0, 140),
      payload:{ thread:d.thread||'global:all', text:txt },
      updatedAt: todayISO(), status:'draft'
    });
    DB.save();
    if(inp) inp.value = '';
    toast('Saved to Workspace Drafts','Open Workspace Drafts in the left navigation at any time to review or send.','ok');
    render();
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
    if(!username || !password){
      LOGIN6.error = 'Enter both your username (or official email) and password.';
      return render();
    }
    LOGIN6.error=''; LOGIN6.notice=''; LOGIN6.busy=true; render();
    try{
      let res = await AUTH.loginOnline(username, password, 'this device');
      if(!res.ok){
        /* Allow verified local PBKDF2/hash sign-in whenever:
           1) The device is offline / host unreachable / host not yet server-provisioned, OR
           2) Client-side 4-Step Host Setup or Global Activation provisioned salted hashes in DB.db.users. */
        const hostUnprovisioned = !APPX.host || !APPX.host.setup;
        const isGloballyActive = (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated());
        if(!(DB.db && DB.db.users && DB.db.users.length) && !isGloballyActive && (res.code==='offline' || res.code==='failed' || res.status===0 || hostUnprovisioned)){
          await activateFullDemoDataset();
        }
        const localCandidate = (DB.db && Array.isArray(DB.db.users))
          ? DB.db.users.find(x => x.username.toLowerCase()===username || String(x.email||'').toLowerCase()===username)
          : null;
        if((localCandidate && localCandidate.hash && localCandidate.salt) || res.code==='offline' || res.code==='failed' || res.status===0 || hostUnprovisioned){
          const local = AUTH.login(username, password);
          res = local.ok
            ? { ok:true, user:local.user, mustChange:Boolean(local.user.mustChange || local.user.mustChangePassword) }
            : { ok:false, error: local.msg };
        }
      }
      LOGIN6.busy = false;
      if(res.ok){
        APPX.screen='app';
        try{ sessionStorage.setItem('carelink.lastUser', AUTH.user.username); }catch(e){}
        SESSION.start();
        if(AUTH.mustChange || res.mustChange || (AUTH.user && (AUTH.user.mustChange || AUTH.user.mustChangePassword))){
          AUTH.mustChange = true;
          render();
          return;
        }
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
    LOGIN6.error = '';
    if(!current){ LOGIN6.error = 'Enter your current temporary password.'; return render(); }
    if(next !== again){ LOGIN6.error = 'The new passwords do not match.'; toast('The passwords do not match','Re-type the same new password.','err'); return render(); }
    const uRec = AUTH.user ? ((DB.db && Array.isArray(DB.db.users) && DB.db.users.find(x => x.id===AUTH.user.id || x.username===AUTH.user.username)) || AUTH.user) : null;
    const policyErr = (typeof PROD_SETUP!=='undefined') ? PROD_SETUP.validatePrivacyPassword(next, AUTH.user, current) : '';
    if(policyErr){ LOGIN6.error = policyErr; toast('Privacy password requirement', policyErr, 'err'); return render(); }
    const strength = passwordStrength(next);
    if(strength.n < 2){ LOGIN6.error = 'Use at least 12 characters with uppercase, lowercase, digits and a symbol.'; return render(); }
    let r = {ok:false};
    if(typeof SYNC!=='undefined' && SYNC.sessionToken){
      try { r = await AUTH.changeOnServer(current, next); } catch(_e) { r = {ok:false}; }
    }
    if(!r.ok){
      const currentValid = (AUTH._pw && current === AUTH._pw) || (uRec && uRec.salt && uRec.hash && strongHash(current, uRec.salt) === uRec.hash);
      if(!currentValid){
        LOGIN6.error = 'Current temporary password is incorrect.';
        toast('Incorrect current password','Enter the one-time setup or WhatsApp password you signed in with.','err');
        return render();
      }
      const local = AUTH.setPassword(next);
      if(local && local.ok === false){ LOGIN6.error = local.msg; return render(); }
    }
    if(AUTH.user){
      const markActive = target => {
        if(!target) return;
        target.status = 'active';
        target.active = true;
        target.activatedAt = todayISO();
        target.mustChange = false;
        target.mustChangePassword = false;
        target.dpaFirstLoginRequired = false;
        target.passwordSetAt = todayISO();
        target.failedLogins = 0;
      };
      markActive(AUTH.user);
      if(uRec && uRec !== AUTH.user) markActive(uRec);
      AUDIT.append({ actor:AUTH.user.id, action:'account.self_activated', entity:'user', entityId:AUTH.user.id, detail:`${AUTH.user.username} completed first-login password change & self-activated account.` });
      DB.save();
    }
    AUTH.mustChange = false;
    LOGIN6.error='';
    NAVH.reset(); NAVH.push('home',{}); APPX.view='home'; APPX.params={};
    if(AUTH.user && AUTH.user.roleId==='chief' && typeof PROD_SETUP!=='undefined' && !PROD_SETUP.isGloballyActivated()){
      toast('Password Updated - Ready for Global Activation','Click "Activate System Globally" at the top of your console to generate the Team WhatsApp Credential Sheet.','ok');
    } else {
      toast('Account Activated & Private Password Saved','Your console is now open with your personal encrypted password known only to you.','ok');
    }
    render();
  },

  activate6: async (d) => {
    const rawUser = String(d.get('username')||'').trim().toLowerCase();
    const code = String(d.get('code')||'').trim().toUpperCase();
    const pw = String(d.get('password')||''), pw2 = String(d.get('password2')||'');
    if(pw!==pw2) return toast('The passwords do not match','Re-type the same password.','err');
    if(passwordStrength(pw).n < 2) return toast('Choose a stronger password','At least 10 characters with letters and digits.','err');
    let r = { ok:false };
    try {
      if(typeof SYNC !== 'undefined' && SYNC._json){
        r = await SYNC._json('api/public/activate', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({username:rawUser, code, password: pw})});
      }
    } catch(_e) { r = { ok:false }; }
    if(r && r.ok){
      LOGIN6.tab='signin'; LOGIN6.error=''; LOGIN6.notice='Account activated. Sign in with your new password.';
      return render();
    }
    const usr = (DB.db.users||[]).find(u=>u.username.toLowerCase()===rawUser || String(u.email||'').toLowerCase()===rawUser);
    const uname = usr ? usr.username.toLowerCase() : rawUser;
    const act = (DB.db.pendingActivations||[]).find(a=>String(a.username||'').toLowerCase()===uname && a.code===code && !a.used && new Date(a.expiresAt)>new Date());
    if(act && usr){
      act.used = true; act.usedAt = new Date().toISOString();
      usr.salt = newSalt(); usr.hash = strongHash(pw, usr.salt); usr.active = true; usr.status = 'active';
      usr.mustChange = false; usr.mustChangePassword = false; usr.dpaFirstLoginRequired = false; usr.failedLogins = 0;
      AUDIT.append({ actor:usr.id, action:'account.activated', entity:'user', entityId:usr.id, detail:`Activated via code ${code}` });
      DB.save();
      LOGIN6.tab='signin'; LOGIN6.error=''; LOGIN6.notice='Account activated. Sign in now with your chosen password.';
      return render();
    }
    LOGIN6.error = (r && r.body && r.body.error) || 'Invalid or expired activation code for that username.';
    render();
  },

  request6: async (d) => {
    const body = {};
    ['name','jobTitle','departmentId','countyId','phone','justification'].forEach(k=>body[k]=String(d.get(k)||'').trim());
    if(!body.name || !body.phone){ LOGIN6.error = 'Enter your full name and phone/WhatsApp number.'; return render(); }
    const cId = body.countyId || 'kisumu';
    const assignedAdminUsername = cId === 'homabay' ? 'homabay.admin' : 'kisumu.admin';
    const countyLabel = countyName(cId);
    const payload = { ...body, countyId:cId, assignedCountyId:cId, assignedAdminUsername, urgent:true, priority:'urgent' };
    let r = { ok:false };
    try {
      if(typeof SYNC !== 'undefined' && SYNC._json){
        r = await SYNC._json('api/public/account-request', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)});
      }
    } catch(_e) { r = { ok:false }; }
    const ref = (r && r.ok && r.body && r.body.ref) ? r.body.ref : ('REQ-' + Math.floor(100000 + Math.random()*900000));
    DB.db.accountRequests = DB.db.accountRequests || [];
    DB.db.accountRequests.unshift({
      id:uid('arq'), ref, ...payload, contact:body.phone, reason:body.justification,
      status:'open', at:new Date().toISOString(), submittedAt:new Date().toISOString()
    });
    AUDIT.append({ actor:'public', action:'account.requested.county_urgent', entity:'accountRequest', entityId:ref,
      detail:`URGENT -> ${assignedAdminUsername} (${countyLabel}): ${body.name} (${body.jobTitle})` });
    DB.save();
    LOGIN6.tab='signin'; LOGIN6.error='';
    LOGIN6.notice = `Urgent request ${ref} routed directly to the ${countyLabel} County Office Administrator (${assignedAdminUsername}) for immediate verification & credential issuance.`;
    render();
  },

  forgot6: async (d) => {
    const rawId = String(d.get('username')||'').trim().toLowerCase();
    if(!rawId){ LOGIN6.error = 'Enter your username or official email.'; return render(); }
    const matchedUser = (DB.db && DB.db.users || []).find(u => String(u.username||'').toLowerCase()===rawId || String(u.email||'').toLowerCase()===rawId);
    const cId = String(d.get('countyId') || (matchedUser && matchedUser.countyId) || 'kisumu').trim();
    const assignedAdminUsername = cId === 'homabay' ? 'homabay.admin' : 'kisumu.admin';
    const countyLabel = countyName(cId);
    const username = matchedUser ? matchedUser.username : rawId;
    const payload = { username, identifier:rawId, countyId:cId, assignedCountyId:cId, assignedAdminUsername, urgent:true, priority:'urgent' };
    let r = { ok:false };
    try {
      if(typeof SYNC !== 'undefined' && SYNC._json){
        r = await SYNC._json('api/auth/forgot', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)});
      }
    } catch(_e) { r = { ok:false }; }
    const ref = (r && r.ok && r.body && r.body.reference) ? r.body.reference : ('REC-' + Math.floor(10000 + Math.random()*90000));
    DB.db.recoveryRequests = DB.db.recoveryRequests || [];
    DB.db.recoveryRequests.unshift({
      id:uid('rec'), reference:ref, ...payload, at:new Date().toISOString(), status:'open'
    });
    AUDIT.append({ actor:username||'unknown', action:'auth.recovery_requested.county_urgent', entity:'user', entityId:username,
      detail:`URGENT -> ${assignedAdminUsername} (${countyLabel}) · Reference ${ref}` });
    DB.save();
    LOGIN6.error='';
    LOGIN6.notice = `Urgent recovery request ${ref} routed directly to your ${countyLabel} County Office Administrator (${assignedAdminUsername}), who can issue an immediate reset or 24-hour EMG code.`;
    LOGIN6.tab='forgot';
    render();
  },

  emergency6: async (d) => {
    const rawUser = String(d.get('username')||'').trim().toLowerCase();
    const code = String(d.get('code')||'').trim().toUpperCase();
    const password = String(d.get('password')||'');
    if(passwordStrength(password).n < 2) return toast('Choose a stronger password','Use at least 10 characters with letters and digits.','err');
    let r = { ok:false };
    try {
      if(typeof SYNC !== 'undefined' && SYNC._json){
        r = await SYNC._json('api/auth/emergency', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({username:rawUser, code, password})});
      }
    } catch(_e) { r = { ok:false }; }
    if(r && r.ok){
      LOGIN6.tab='signin'; LOGIN6.notice='Password reset with emergency code. Sign in now.'; LOGIN6.error='';
      return render();
    }
    const usr = (DB.db.users||[]).find(u=>u.username.toLowerCase()===rawUser || String(u.email||'').toLowerCase()===rawUser);
    const uname = usr ? usr.username.toLowerCase() : rawUser;
    const emg = (DB.db.emergencyCodes||[]).find(e=>String(e.username||'').toLowerCase()===uname && e.code===code && !e.used && new Date(e.expiresAt)>new Date());
    if(emg && usr){
      emg.used = true; emg.usedAt = new Date().toISOString();
      usr.salt = newSalt(); usr.hash = strongHash(password, usr.salt);
      usr.mustChange = false; usr.mustChangePassword = false; usr.dpaFirstLoginRequired = false;
      usr.failedLogins = 0; usr.status = 'active'; usr.active = true;
      AUDIT.append({ actor:usr.id, action:'auth.emergency_reset', entity:'user', entityId:usr.id, detail:'Reset via 24h emergency code' });
      DB.save();
      LOGIN6.tab='signin'; LOGIN6.notice='Password reset with emergency code. Sign in now.'; LOGIN6.error='';
      return render();
    }
    LOGIN6.error = (r && r.body && r.body.error) || 'Invalid or expired emergency code.';
    render();
  }
});

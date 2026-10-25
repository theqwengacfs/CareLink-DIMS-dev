/* ============================================================
   views_entry.js - Public landing page and sign-in entry
   The landing page is the organisation's front door: navy and
   gold, one screen, one action. The sign-in page is separate,
   quiet and white. No console data appears on either.
   ============================================================ */

/* Ten landing identities. Each is a different arrangement and palette, not a
   recolour of one page. The workspace accent is deliberately separate: a theme
   changes only the public front door. */
const LANDING_THEMES = [
  { id:'heritage', name:'Heritage White', blurb:'Crisp institutional pure white with royal navy and burnished gold accents. The default across all devices.', accent:'#1E3A8A', mode:'light' },
  { id:'dawn',     name:'Dawn',          blurb:'Warm sunrise gradient, centred hero, soft cards. Optimistic and open.', accent:'#F97316', mode:'dark' },
  { id:'clinic',   name:'Clinic white',  blurb:'Light, calm, generous white space with a single teal accent. Quietly clinical.', accent:'#0E7490', mode:'light' },
  { id:'editorial',name:'Editorial',     blurb:'Magazine layout: oversized serif headline, rule lines, one column of text.', accent:'#7C2D12', mode:'light' },
  { id:'canopy',   name:'Canopy',        blurb:'Deep green, organic shapes, layered leaves of colour. Rooted and human.', accent:'#15803D', mode:'dark' },
  { id:'signal',   name:'Signal',        blurb:'High-contrast black with a vivid spectrum bar. Direct and modern.', accent:'#E11D48', mode:'dark' },
  { id:'sand',     name:'Sandstone',     blurb:'Earth tones, wide type, photograph band across the base. Grounded.', accent:'#B45309', mode:'light' },
  { id:'violet',   name:'Violet hour',   blurb:'Indigo, violet glow and a glassy panel. Contemporary and calm.', accent:'#7C3AED', mode:'dark' },
  { id:'paper',    name:'Paper',         blurb:'Off-white, black rules, small caps. Plain, documentary, unfussy.', accent:'#111827', mode:'light' },
  { id:'spectrum', name:'Spectrum',      blurb:'A full visible-light ribbon running through the page. Vibrant and celebratory.', accent:'#2563EB', mode:'dark' }
];
const DEFAULT_THEME = 'heritage';
function landingTheme(){
  const explicitLocal = DB.db && DB.db.settings && DB.db.settings.landingTheme;
  const hostLanding = typeof APPX !== 'undefined' && APPX.host && APPX.host.landingTheme;
  const cachedLanding = typeof DB !== 'undefined' && typeof DB.loadLocalPrefs === 'function' && (DB.loadLocalPrefs()||{}).landingTheme;
  /* If local DB still has only the blank default ('heritage') and the live host
     exposed an explicit landingTheme in /api/health, honour the live host's theme. */
  const id = (explicitLocal && explicitLocal !== DEFAULT_THEME)
    ? explicitLocal
    : (hostLanding || explicitLocal || cachedLanding || DEFAULT_THEME);
  return LANDING_THEMES.find(t=>t.id===id) || LANDING_THEMES[0];
}

function renderLanding(){
  const year = new Date().getFullYear();
  const th = landingTheme();
  return `<div class="landing" data-theme="${esc(th.id)}" data-mode="${esc(th.mode)}">
    <div class="landing-grid" aria-hidden="true"></div>
    <header class="landing-top">
      <div class="landing-mark">
        <img src="${window.LOGO||''}" alt="LOMAMO Foundation Kenya">
        <div>
          <div class="landing-org">LOMAMO Foundation Kenya</div>
          <div class="landing-sub">LOMAMO C-DIMS · Data &amp; Information Management System</div>
        </div>
      </div>
      <div class="landing-version">Version ${esc(APP.version)} <span>·</span> ${esc(String(year))}</div>
    </header>

    <main class="landing-main">
      <div class="landing-copy">
        <div class="landing-eyebrow">Serving our Neighbours in Love</div>
        <h1>One Foundation.<br><em>One Operating System.</em></h1>
        <p class="landing-lead">Clinical care, hospital coordination, finance, transport, human resources and
        information governance in one governed record, across every ministry area and county office.</p>
        <div class="landing-mandate">Saving Lives, Preventing Orphans</div>
        <button class="landing-cta" data-act="goto-login">
          Proceed to My C-DIMS Console
          <span aria-hidden="true">${ic('chevron',20)}</span>
        </button>
        <div class="landing-note">Authorised staff only. Every action is identified and recorded.</div>
        <button class="landing-public" data-act="goto-public">Visit LOMAMO · Public Portal ${ic('chevron',15)}</button>
      </div>

      <div class="landing-panel" aria-label="What the system holds">
        <div class="landing-card">
          <div class="landing-card-h">Built around the way LOMAMO works</div>
          <ul class="landing-list">
            <li><span class="dot gold"></span><div><b>Every console has a purpose</b><span>Caregivers, hospital, finance, transport, media and leadership see only the work that belongs to them.</span></div></li>
            <li><span class="dot gold"></span><div><b>Confidentiality enforced in the data layer</b><span>County, ministry area and department boundaries are checked on every record, not hidden in the interface.</span></div></li>
            <li><span class="dot gold"></span><div><b>One shared online source</b><span>Hosted PCs, tablets and other clients use the same Vercel/KV record; the standalone file remains an explicitly offline, device-local mode.</span></div></li>
          </ul>
        </div>
        <div class="landing-foot">
          <span>${esc(APP.tagline||'')}</span>
          <span>Shared online source · explicit offline mode</span>
        </div>
      </div>
    </main>
  </div>`;
}

/* Sign-in is reached only from the landing page, never shown beside it. */
function renderLoginBack(){
  return `<button class="login-back" data-act="goto-landing">${ic('chevron',15)} Back to the front page</button>`;
}

/* ============================================================
   Public portal - readable without any account.
   Public means public: only items marked published and public
   are returned by this view, and no patient record is ever
   reachable from it.
   ============================================================ */
const PUBLICATION_CATEGORIES = [
  { id:'news', label:'News' }, { id:'story', label:'Stories' }, { id:'video', label:'Video' },
  { id:'audio', label:'Audio & podcasts' }, { id:'announcement', label:'Announcements' },
  { id:'programme', label:'Programme updates' }
];

/* The public portal reads the host when it is served by it. The host applies
   the publication rule in its own query, so a withdrawn or unapproved item
   cannot reach this page even if the browser cache still holds it. When the
   application is opened from a file, the local rule is used instead and the
   page says so. */
function publicItems(){
  const feed=DB.db.publicFeed;
  if(feed && Array.isArray(feed.items) && (Date.now()-feed.at)<10*60000) return feed.items;
  return (DB.db.publications||[])
    .filter(p=>p.status==='published' && p.public!==false && !p.withdrawn)
    .sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0));
}
function refreshPublicFeed(){
  const hosted=/^https?:/.test(location.protocol||'') && typeof fetch==='function';
  if(!hosted) return;
  fetch('/api/public/content',{headers:{'Accept':'application/json'}})
    .then(r=>r.ok?r.json():null)
    .then(j=>{
      if(!j || !Array.isArray(j.items)) return;
      DB.db.publicFeed={at:Date.now(),items:j.items};
      if(APPX.screen==='public') render();
    })
    .catch(()=>{ /* offline: the local copy stays authoritative */ });
}

function renderPublicPortal(params={}){
  const C = PORTAL_CONTENT;
  const items = PORTALX.news();
  const cat = params.cat || '';
  const q = String(params.q||'').toLowerCase();
  const shown = items.filter(i=>(!cat||i.category===cat) && (!q || ((i.title||'')+' '+(i.summary||'')+' '+(i.tag||'')).toLowerCase().includes(q)));
  const featured = shown[0] || items[0];
  const rest = shown.filter(i=>!featured || i.id!==featured.id);
  const fmt = d => d? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '';
  const catLabel = id => (PUBLICATION_CATEGORIES.find(c=>c.id===id)||{}).label || titleCase(String(id||'news'));
  const photo = k => PORTALX.photo(k);
  const cats = ['news','programme','story','announcement', ...PUBLICATION_CATEGORIES.map(c=>c.id)];
  const catList = [...new Set(cats)];
  const T = C.transparency;
  const CGK = C.cgkPartnership || null;
  const mode = params.mode === 'partner' ? 'partner' : 'public';
  const sessUser = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
  const partnerAllowed = !!(sessUser && (RBAC.has(sessUser,'gov.oversight') || RBAC.has(sessUser,'ccc.desk') || RBAC.has(sessUser,'intl.medical') || RBAC.has(sessUser,'report.executive') || RBAC.has(sessUser,'media.publish'))) || !!(DB.db && DB.db.settings && DB.db.settings.portalPartnerUnlocked);

  return `<div class="portal">
    <header class="portal-top">
      <div class="portal-brand">
        <img src="${window.LOGO||''}" alt="LOMAMO Foundation Kenya">
        <div><b>${esc(C.org.name)} · CareLink</b><span>${esc(C.org.motto)} · ${esc(C.org.tagline)}</span></div>
      </div>
      <div class="portal-actions">
        <div class="portal-search"><input placeholder="Search news, stories and programme updates" value="${esc(params.q||'')}" data-portal-q aria-label="Search public content"></div>
        <div class="seg" role="tablist" aria-label="Portal visibility mode">
          <button class="${mode==='public'?'on':''}" type="button" data-act="portal-mode" data-mode="public">Public mode</button>
          <button class="${mode==='partner'?'on':''}" type="button" data-act="portal-mode" data-mode="partner">${ic('shield',12)} Partner brief</button>
        </div>
        <a class="btn btn-sm btn-soft" href="${esc(C.contact.website)}" target="_blank" rel="noopener noreferrer">${PORTALX.icon('globe',14)} lovemattersmost.org</a>
        <a class="btn btn-sm btn-primary" href="${esc(C.contact.website)}donate-now/" target="_blank" rel="noopener noreferrer">${PORTALX.icon('heart',14)} Donate</a>
        <button class="btn btn-sm btn-ghost" data-act="goto-landing">Front page</button>
        <button class="btn btn-sm btn-ghost" data-act="goto-login">${sessUser?'Return to Console':'Partner / Staff sign-in'}</button>
      </div>
    </header>

    <div class="portal-banner">${ic('shield',14)}<span><b>${mode==='partner'?'Governed Private Partner Mode':'Public Portal Mode'}</b> · Powered by <b>CareLink</b>. Only governance-cleared programme metrics and narratives appear here. Zero patient names, National IDs, CCC numbers or individual disease profiles are ever exposed on this portal (Kenya Data Protection Act, 2019).</span></div>

    <section class="portal-hero">
      <div class="ph-copy">
        <div class="portal-kicker">${esc(C.org.kind)} · Kisumu &amp; Homa Bay, Kenya</div>
        <h1>${esc(C.mission.headline)}</h1>
        <p class="ph-lead">${esc(C.mission.body)}</p>
        <blockquote class="ph-quote">${PORTALX.icon('heart',16)}<span>${esc(C.mission.quote)}</span></blockquote>
        <div class="ph-cta">
          <a class="btn btn-primary" href="${esc(C.contact.website)}donate-now/" target="_blank" rel="noopener noreferrer">${PORTALX.icon('heart',15)} Donate now</a>
          <a class="btn btn-ghost" href="${esc(C.contact.website)}volunteers/" target="_blank" rel="noopener noreferrer">${PORTALX.icon('users',15)} Volunteer</a>
          <a class="btn btn-ghost" href="${esc(C.contact.about)}" target="_blank" rel="noopener noreferrer">${PORTALX.icon('globe',15)} About us</a>
        </div>
        <div class="ph-line">${esc(C.mission.call)}</div>
      </div>
      <div class="ph-art">
        <img src="${photo('field_home_visit')}" alt="A weekly home visit in a Kisumu neighbourhood" loading="lazy">
        <div class="ph-art-cap"><b>${esc(C.org.approvedBy)}</b><span>${esc(C.org.usEntity)}</span></div>
      </div>
    </section>

    <section class="portal-stats">
      ${C.stats.map(s=>`<div class="ps"><span class="ps-i">${PORTALX.icon(s.icon,20)}</span><b>${esc(s.value)}</b><span class="ps-l">${esc(s.label)}</span><span class="ps-n">${esc(s.note)}</span></div>`).join('')}
    </section>

    ${(C.extendedImpact&&C.extendedImpact.length)?`<section class="portal-sect" style="padding-top:8px">
      <div class="ps-h"><div><div class="portal-kicker">Cumulative verified programme reach · 2018-2026</div><h2>Holistic household restoration across Kisumu &amp; Homa Bay</h2></div>
        <p class="ps-sub">Verified cumulative outputs from the LOMAMO Foundation &amp; County Government of Kisumu Health Partnership (2018-2026).</p></div>
      <div class="grid g3" style="gap:12px">
        ${C.extendedImpact.map(x=>`<div class="pw" style="padding:14px 16px"><div class="mono bold" style="font-size:22px;color:var(--accent-fg)">${esc(x.value)}</div><div class="bold" style="margin:3px 0">${esc(x.label)}</div><div class="xs muted">${esc(x.note)}</div></div>`).join('')}
      </div>
    </section>`:''}

    ${mode==='partner' && CGK ? `<section class="portal-sect">
      <div class="ps-h"><div><div class="portal-kicker">Governed Partner Portal · Art. 43(1)(a) &amp; KAISF 2025-2030</div><h2>${esc(CGK.title)}</h2></div>
        <p class="ps-sub">${esc(CGK.subtitle)}</p></div>
      ${partnerAllowed ? `<div class="pw" style="margin-bottom:14px;border-left:4px solid var(--ok)">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div><b>Authorised Partner Brief Active</b><div class="xs muted">${esc(CGK.coverage)} · Strict de-identification &amp; k&gt;=5 suppression enforced</div></div>
            ${sessUser?`<button class="btn btn-sm btn-primary" data-act="goto-console-partner">Open My Governed Partner Console</button>`:''}
          </div>
          <div class="grid g2" style="gap:12px;margin-top:14px">
            ${CGK.pillars.map(p=>`<div class="card" style="padding:12px 14px"><div class="bold" style="margin-bottom:4px">${esc(p.title)}</div><div class="xs">${esc(p.body)}</div></div>`).join('')}
          </div>
          <div style="margin-top:14px"><div class="xs bold muted" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Collaborating County, Sub-County &amp; Faith-Based Referral Facilities (${CGK.facilities.length})</div>
            <div class="pw-areas">${CGK.facilities.map(f=>`<span class="chip">${esc(f)}</span>`).join('')}</div></div>
        </div>`
      : `<div class="pw" style="border-left:4px solid var(--warn)">
          <b>Administrator-Governed Partner Mode</b>
          <p class="small" style="margin:6px 0 10px">Detailed sub-county health system tables, KAISF 2025-2030 indicator alignments and facility referral summaries are restricted to authorised County/National Government Partners, CCC/PSC Clinicians and Leadership accounts.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" data-act="goto-login">${ic('lock',14)} Sign in with Partner Account (e.g. gov.kisumu / ccc.jootrh)</button>
            <button class="btn btn-sm btn-ghost" data-act="portal-mode" data-mode="public">Stay in Public Mode</button>
          </div>
        </div>`}
    </section>` : ''}

    <section class="portal-sect">
      <div class="ps-h"><div><div class="portal-kicker">What we do</div><h2>Four pillars, one household at a time</h2></div>
        <p class="ps-sub">${esc(C.programAreas.statement)}</p></div>
      <div class="portal-pillars">
        ${C.pillars.map(p=>`<article class="pp">
          <div class="pp-art"><img src="${photo(p.photo)}" alt="${esc(p.title)}" loading="lazy"></div>
          <div class="pp-b"><span class="pp-i">${PORTALX.icon(p.icon,18)}</span><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p></div>
        </article>`).join('')}
      </div>
    </section>

    <section class="portal-sect">
      <div class="ps-h"><div><div class="portal-kicker">News, stories &amp; programme updates</div><h2>Latest from LOMAMO</h2></div>
        <p class="ps-sub">Programme news from the Foundation, and anything the Media &amp; Information Governance department has approved for release.</p></div>
      <nav class="portal-cats">
        <button class="${!cat?'on':''}" data-act="portal-cat" data-cat="">All</button>
        ${catList.map(c=>`<button class="${cat===c?'on':''}" data-act="portal-cat" data-cat="${esc(c)}">${esc(catLabel(c))}</button>`).join('')}
      </nav>
      ${featured?`<article class="portal-feature">
        <div class="portal-feature-art"><img src="${photo(featured.photoKey||'analytics_screen')}" alt="${esc(featured.title)}" loading="lazy"></div>
        <div class="pf-b">
          <div class="portal-kicker">${esc(featured.tag||catLabel(featured.category))} · ${esc(fmt(featured.publishedAt||featured.date))}${featured.governed?' · Approved for publication':''}</div>
          <h2>${esc(featured.title)}</h2>
          <p>${esc(featured.summary||'')}</p>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-act="portal-open" data-id="${esc(featured.id)}">Read ${ic('chevron',14)}</button>
            <a class="btn btn-ghost" href="${esc(C.contact.updates)}" target="_blank" rel="noopener noreferrer">All updates on our website ${PORTALX.icon('globe',14)}</a></div>
        </div>
      </article>`:''}
      <div class="portal-grid">
        ${rest.length? rest.map(i=>`<article class="portal-card">
          <div class="portal-card-art"><img src="${photo(i.photoKey||'united_hands')}" alt="${esc(i.title)}" loading="lazy"></div>
          <div class="portal-card-body">
            <div class="portal-kicker">${esc(i.tag||catLabel(i.category))} · ${esc(fmt(i.publishedAt||i.date))}</div>
            <h3>${esc(i.title)}</h3>
            <p>${esc(i.summary||'')}</p>
            <div class="row" style="margin-top:auto;gap:8px"><button class="btn btn-xs btn-ghost" data-act="portal-open" data-id="${esc(i.id)}">Read</button>
              ${i.governed?`<span class="chip">Approved for publication</span>`:''}</div>
          </div>
        </article>`).join('') : `<div class="portal-empty">${emptyState('Nothing else in this category','Choose another category, or clear the search, to see more published content.','file')}</div>`}
      </div>
    </section>

    <section class="portal-sect portal-gallery-sect">
      <div class="ps-h"><div><div class="portal-kicker">In pictures</div><h2>The shape of a week in the programme</h2></div>
        <p class="ps-sub">Programme imagery. A photograph of a beneficiary is never published without recorded consent under the LOMAMO Ethical Storytelling Policy.</p></div>
      <div class="portal-gallery">
        ${C.gallery.map(g=>`<figure class="pg">
          <img src="${photo(g.key)}" alt="${esc(g.label)}" loading="lazy">
          <figcaption><b>${esc(g.label)}</b><span>${esc(g.dept)}</span><em>${esc(g.caption)}</em></figcaption>
        </figure>`).join('')}
      </div>
    </section>

    <section class="portal-sect">
      <div class="ps-h"><div><div class="portal-kicker">Where we serve</div><h2>Kisumu &amp; Homa Bay ministry areas</h2></div>
        <p class="ps-sub">${esc(C.mission.how)}</p></div>
      <div class="portal-where">
        ${C.where.map(w=>`<div class="pw">
          <div class="pw-h">${PORTALX.icon('globe',18)}<div><b>${esc(w.county)}</b><span>${num(w.areas.length)} ministry areas</span></div></div>
          <div class="pw-areas">${w.areas.map(a=>`<span class="chip">${esc(a)}</span>`).join('')}</div>
          <p class="xs">${esc(w.note)}</p></div>`).join('')}
      </div>
      <div class="portal-quote">${C.quotes.map(x=>`<blockquote><span>&ldquo;${esc(x.text)}&rdquo;</span><cite>${esc(x.who)}</cite></blockquote>`).join('')}</div>
    </section>

    <section class="portal-sect">
      <div class="ps-h"><div><div class="portal-kicker">Stewardship &amp; transparency</div><h2>Where the money comes from and where it goes</h2></div>
        <p class="ps-sub">${esc(T.source)} The Kenyan foundation delivers the programme; the California entity raises awareness and funds and files publicly.</p></div>
      <div class="portal-trans">
        <div class="pt">
          <h3>Published finances (LOVE MATTERS MOST, Inc. · EIN ${esc(C.org.ein)})</h3>
          <table class="pt-tbl">
            <thead><tr><th>Fiscal year</th><th class="num">Total revenue</th><th class="num">Grants &amp; contributions</th><th class="num">Programme services</th><th class="num">Investment income</th></tr></thead>
            <tbody>${T.revenues.map(r=>`<tr><td>${esc(r.year)}</td><td class="num mono">${esc(PORTALX.usd(r.total))}</td><td class="num mono">${esc(PORTALX.usd(r.grants))}</td>
              <td class="num mono">${esc(PORTALX.usd(r.programServices))}</td><td class="num mono">${esc(PORTALX.usd(r.investment))}</td></tr>`).join('')}</tbody>
          </table>
          <div class="pt-notes">
            <span class="chip">${esc(T.change)}</span>
            <span class="chip">Total expenses ${esc(PORTALX.usd(T.expenses))}</span>
            <span class="chip">Total assets ${esc(PORTALX.usd(T.assets))}</span>
            <span class="chip">NTEE ${esc(C.org.ntee)}</span>
            <span class="chip">501(c)(3), formed 2019</span>
          </div>
        </div>
        <div class="pt">
          <h3>Grants received</h3>
          <table class="pt-tbl">
            <thead><tr><th>Grantmaker</th><th>Period</th><th>Purpose</th><th class="num">Amount</th></tr></thead>
            <tbody>${T.grants.map(g=>`<tr><td>${esc(g.grantmaker)}</td><td class="mono">${esc(g.period)}</td><td>${esc(g.description)}</td><td class="num mono">${esc(PORTALX.usd(g.amount))}</td></tr>`).join('')}</tbody>
          </table>
          <h3 style="margin-top:18px">Form 990 filings</h3>
          <table class="pt-tbl">
            <thead><tr><th>Fiscal year ending</th><th>Received by the IRS</th><th>Form</th></tr></thead>
            <tbody>${T.filings.map(f=>`<tr><td class="mono">${esc(f.year)}</td><td class="mono">${esc(f.received)}</td><td>${esc(f.form)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="portal-cost-note">${ic('info',15)}<span class="small">Inside the programme, LOMAMO C-DIMS attributes every cost - hospital fee, transport fare, food bag by type, medication, SHIF contribution and in-patient care - to the patient it served, and rolls it up to ministry area, county and national level, reconciled against budget and against physical stock counts.</span></div>
    </section>

    <section class="portal-sect">
      <div class="ps-h"><div><div class="portal-kicker">Our team in Kenya</div><h2>The people who do the work</h2></div>
        <p class="ps-sub">Coordinators, caregivers, the hospital ministry, media, public relations, procurement, transport, welfare and administration, across both county offices.</p></div>
      <div class="portal-team">
        ${C.team.map(t=>`<div class="ptm"><span class="ptm-i">${initials(t.name)}</span><div><b>${esc(t.name)}</b><span>${esc(t.role)}</span></div></div>`).join('')}
      </div>
      <div class="portal-board">
        <div><h3>Board &amp; advisors</h3><div class="pb-list">${C.board.map(b=>`<span class="chip">${esc(b)}</span>`).join('')}</div></div>
        <div><h3>Officers of the US entity</h3><div class="pb-list">${C.officers.map(o=>`<span class="chip">${esc(o.name)} · ${esc(o.title)}</span>`).join('')}</div>
          <p class="xs" style="margin-top:10px">${esc(C.org.kickOff)}</p></div>
      </div>
    </section>

    <section class="portal-sect">
      <div class="ps-h"><div><div class="portal-kicker">Come and join us</div><h2>Ways to stand with a household</h2></div>
        <p class="ps-sub">${esc(C.programAreas.usMission)}</p></div>
      <div class="portal-ways">
        ${C.ways.map(w=>`<a class="pway" href="${esc(w.href)}" target="_blank" rel="noopener noreferrer">
          <span class="pway-i">${PORTALX.icon(w.icon,20)}</span><b>${esc(w.title)}</b><p>${esc(w.body)}</p>
          <span class="pway-go">Open ${PORTALX.icon('route',14)}</span></a>`).join('')}
      </div>
    </section>

    <section class="portal-sect">
      <div class="ps-h"><div><div class="portal-kicker">Questions</div><h2>What people ask us</h2></div></div>
      <div class="portal-faq">
        ${C.faqs.map(f=>`<details class="pf-item"><summary>${esc(f.q)}<span class="pf-chev">${ic('chevron',14)}</span></summary><p>${esc(f.a)}</p></details>`).join('')}
      </div>
    </section>

    <footer class="portal-foot2">
      <div class="pf2-grid">
        <div>
          <div class="portal-brand"><img src="${window.LOGO||''}" alt=""><div><b>${esc(C.org.name)}</b><span>${esc(C.org.motto)}</span></div></div>
          <p class="xs" style="margin-top:10px">${esc(C.mission.scale)}</p>
        </div>
        <div><h4>Kenya</h4><p class="xs">${esc(C.contact.kenya.place)}<br>Tel ${esc(C.contact.kenya.tel)}</p></div>
        <div><h4>United States</h4><p class="xs">${esc(C.contact.usa.place)}<br>Tel ${esc(C.contact.usa.tel)}</p></div>
        <div><h4>Write to us</h4><p class="xs"><a href="mailto:${esc(C.contact.email)}">${esc(C.contact.email)}</a></p>
          <div class="pf2-social">
            <a href="${esc(C.contact.facebook)}" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href="${esc(C.contact.instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href="${esc(C.contact.privacy)}" target="_blank" rel="noopener noreferrer">Privacy policy</a>
          </div></div>
      </div>
      <div class="pf2-base">
        <span>${esc(C.org.name)} · ${esc(C.org.motto)} · ${esc(C.org.mandate)}</span>
        <span>Public communications governed under the LOMAMO Ethical Storytelling Policy. Served by CareLink (CareLink C-DIMS v${esc(APP.version)}).</span>
      </div>
    </footer>
  </div>`;
}

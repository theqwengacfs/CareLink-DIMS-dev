/* ============================================================
   recognition.js - C-DIMS coins, usage scores and staff evaluation

   The Foundation asked for a module that encourages the system to be
   used properly, and that rewards the people who do it. Three rules
   keep it fair and legible:

   1. The score is computed from records that already exist  -  patients
      in scope, verified documentation, visits recorded, identities
      captured, follow-up discipline. Nothing is typed in by hand.
   2. The formula is shown to the person whose score it is, with the
      weight and the evidence for every part.
   3. Coins are earned by the score and spent on real things the
      Foundation controls (equipment loans, studio time, a printed
      photo). The catalogue has a cost and a balance; a person who has
      spent everything must earn more. Nobody can buy access to
      patient records with coins.
   ============================================================ */

const COIN_VALUE = { perPoint:1, monthCap:400 };

const PERKS = [
  { id:'perk-camera',  name:'Camera for a weekend',        cost:120, owner:'media',  note:'Canon SX720 HS, subject to the media department’s booking.' },
  { id:'perk-studio',  name:'Two hours in the studio',     cost:180, owner:'media',  note:'Lighting, backdrop and the lapel microphones.' },
  { id:'perk-laptop',  name:'Laptop for a field day',       cost:150, owner:'it',     note:'Any spare laptop in the ICT register, returned the same evening.' },
  { id:'perk-print',   name:'A3 photo print',              cost:40,  owner:'media',  note:'Printed on the office printer, one per quarter.' },
  { id:'perk-training',name:'Priority training seat',      cost:200, owner:'hr',     note:'First refusal on the next safeguarding or data-protection session.' },
  { id:'perk-parking', name:'Reserved parking for a month',cost:60,  owner:'admin',  note:'The shaded bay beside the kitchen door.' }
];

const BADGE_DETAIL = {
  Platinum:{ tone:'ok', blurb:'Above 90%: the console is complete and current. Coins at the highest rate; early access to new modules.' },
  Gold:    { tone:'warn', blurb:'75-89%: strong use. Full library borrowing rights and priority on equipment.' },
  Silver:  { tone:'neutral', blurb:'60-74%: working well, with gaps in documentation or follow-up.' },
  Bronze:  { tone:'neutral', blurb:'40-59%: the console is in use but key records are missing.' },
  Building:{ tone:'crit', blurb:'Below 40%: the score explains exactly what is missing. No penalty beyond the score itself.' }
};

const CREDITS = {
  score(user){ return usageScore(user, DB.db); },
  band(score){ return scoreBand(score); },

  earned(user){
    const c = (DB.db.credits||{})[user.id] || {};
    const events = (DB.db.rewardEvents||[]).filter(e=>e.userId===user.id);
    const awarded = events.filter(e=>e.delta>0).reduce((n,e)=>n+e.delta,0);
    const spent = events.filter(e=>e.delta<0).reduce((n,e)=>n+Math.abs(e.delta),0);
    return { awarded, spent, manual: c.manual||0, balance: Math.max(0, awarded - spent + (c.manual||0)),
             events: events.slice().sort((a,b)=>new Date(b.at)-new Date(a.at)) };
  },

  award(userId, delta, reason, by){
    DB.db.rewardEvents = DB.db.rewardEvents || [];
    const e = { id:'ce-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
      userId, delta, reason, by:by||'system', at:todayISO() };
    DB.db.rewardEvents.unshift(e);
    if(DB.db.rewardEvents.length > 5000) DB.db.rewardEvents.length = 5000;
    return e;
  },

  /* One monthly run. Idempotent for a given month and person. */
  runMonthly(user){
    if(!RBAC.has(user,'credit.manage')) return { ok:false, error:'Your role may not run the recognition cycle.' };
    const month = new Date().toISOString().slice(0,7);
    const results = [];
    (DB.db.users||[]).filter(u=>['active','locked'].includes(u.status)).forEach(u=>{
      const s = this.score(u);
      if(!s.score) return;
      const existing = (DB.db.rewardEvents||[]).find(e=>e.userId===u.id && e.month===month && e.kind==='monthly');
      if(existing) return;
      const coins = Math.min(COIN_VALUE.monthCap, Math.round(s.score * (scoreBand(s.score).coins||1) / 2));
      const e = this.award(u.id, coins, `Monthly recognition  -  score ${s.score}%`, user.id);
      e.month = month; e.kind = 'monthly'; e.score = s.score;
      results.push({ user:u, score:s.score, coins });
    });
    AUDIT.append({ actor:user.id, action:'recognition.month_closed', entity:'system', entityId:month,
      detail:`Recognition run for ${month}: ${results.length} people scored` });
    DB.save();
    return { ok:true, month, results };
  },

  redeem(user, perkId){
    const perk = PERKS.find(p=>p.id===perkId);
    if(!perk) return { ok:false, error:'That reward does not exist.' };
    const bal = this.earned(user).balance;
    if(bal < perk.cost) return { ok:false, error:`You need ${perk.cost - bal} more coins. The score page shows what earns them.` };
    this.award(user.id, -perk.cost, `Redeemed: ${perk.name}`, user.id);
    DB.db.borrowRequests = DB.db.borrowRequests || [];
    DB.db.borrowRequests.unshift({ id:'br-'+Date.now().toString(36), item:`Reward · ${perk.name}`, owner:perk.owner,
      requestedBy:user.id, requested:todayISO(), from:todayISO(),
      to:new Date(Date.now()+7*86400000).toISOString(), status:'requested', note:`Redeemed with ${perk.cost} C-DIMS coins.`, coin:true });
    AUDIT.append({ actor:user.id, action:'recognition.redeemed', entity:'reward', entityId:perk.id,
      detail:`${perk.name} for ${perk.cost} coins` });
    DB.save();
    return { ok:true, perk };
  }
};

/* ------------------------------------------------------------ views */
function renderRecognition(user){
  if(!RBAC.has(user,'credit.view')) return deniedPanel('credit.view');
  const sheet = (typeof APPX!=='undefined' && APPX.params && APPX.params.sheet) || 'overview';
  const mine = CREDITS.score(user);
  const band = scoreBand(mine.score);
  const bal = CREDITS.earned(user);
  const maySeeAll = RBAC.has(user,'credit.manage') || isGlobal(user) || ['director','program.admin','program.assistant'].includes(user.roleId);
  const people = (DB.db.users||[]).filter(u=>(u.status==='active'||u.status==='pending_activation') && (maySeeAll || u.id===user.id || u.countyId===user.countyId));
  const board = people.map(u=>({ u, s:CREDITS.score(u) })).sort((a,b)=>b.s.score-a.s.score);
  const myRank = board.findIndex(b=>b.u.id===user.id) + 1;
  const affordableCount = PERKS.filter(p=>bal.balance >= p.cost).length;

  const ring = `<div class="score-ring" style="--p:${mine.score}">
      <div class="sr-in"><b>${mine.score}<span>%</span></b><i>usage score</i></div>
    </div>`;
  const breakdown = mine.parts.map(p=>`
    <div class="sc-part">
      <div class="spread"><b>${esc(p.k)}</b><span class="mono bold">${Math.round(p.w*p.v)} / ${p.w} pts</span></div>
      <div class="sc-bar"><span style="width:${Math.round(p.v*100)}%"></span></div>
      <div class="spread xs muted"><span>${esc(p.note)}</span><span>Weight ${p.w}%</span></div>
    </div>`).join('');

  const spotlightBanner = `<div class="coins-hero-crest">
    <div class="coins-hero-left">
      ${ring}
      <div class="coins-hero-meta">
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:4px">
          <span class="badge ${band.tone}">${esc(band.name)} Standing</span>
          <span class="badge b-info nodot">Rank #${myRank || 1} of ${board.length}</span>
        </div>
        <h3>${esc(user.name.replace(/^Demo - /,''))}</h3>
        <p class="small muted" style="margin:2px 0 8px">${esc((BADGE_DETAIL[band.name]||{}).blurb||'Verified field & console excellence.')}</p>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <span class="coins-wallet-pill">${ic('sparkles',14)} <b>${num(bal.balance)}</b> C-DIMS Coins Available</span>
          <span class="xs muted">Earned <b>${num(bal.awarded)}</b> · Redeemed <b>${num(bal.spent)}</b> · <b>${affordableCount}/${PERKS.length}</b> perks unlocked</span>
        </div>
      </div>
    </div>
    <div class="coins-hero-right">
      <div class="xs bold muted" style="text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Standing Value Ladder</div>
      <div class="badge-ladder compact-ladder">
        ${['Platinum','Gold','Silver','Bronze','Building'].map(b=>`<div class="bl-row ${band.name===b?'on':''}">
          <span class="badge b-${BADGE_DETAIL[b].tone}" style="min-width:78px;justify-content:center">${b}</span>
          <span class="xs">${esc(BADGE_DETAIL[b].blurb.split('.')[0])}.</span>
        </div>`).join('')}
      </div>
    </div>
  </div>`;

  const sheetTabs = `<div class="tabs" style="margin:14px 0">
    <button class="tab ${sheet==='overview'?'active':''}" data-act="go" data-v="recognition" data-sheet="overview">${ic('sparkles',14)} Recognition Overview</button>
    <button class="tab ${sheet==='standings'?'active':''}" data-act="go" data-v="recognition" data-sheet="standings">${ic('chart',14)} Laureate Podium &amp; Standings (${board.length})</button>
    <button class="tab ${sheet==='perks'?'active':''}" data-act="go" data-v="recognition" data-sheet="perks">${ic('package',14)} Rewards Catalogue (${PERKS.length})</button>
    <button class="tab ${sheet==='formula'?'active':''}" data-act="go" data-v="recognition" data-sheet="formula">${ic('target',14)} Score Formula &amp; Coin Ledger</button>
  </div>`;

  const formulaCard = card('Transparent 5-Pillar Score Evidence & Monthly Coin Rate', `<div class="grid g2" style="gap:16px;align-items:center">
      <div class="sc-parts">${breakdown}</div>
      <div class="col" style="gap:10px">
        <div class="note">${ic('shieldcheck',16)}<span><b>100% Evidence-Driven Formula:</b> Every point is computed directly from verified work in CareLink — patient registrations, hard-copy verification, longitudinal visits, national IDs, and 30-day PDCA timeliness.</span></div>
        ${bal.events.length ? table([
          {label:'Date', render:e=>`<span class="xs mono">${esc((e.at||'').replace('T',' ').slice(0,16))}</span>`},
          {label:'Recognition Event', render:e=>esc(e.reason)},
          {label:'Coins', cls:'num mono', render:e=>`<b style="color:${e.delta>0?'var(--ok)':'var(--crit)'}">${e.delta>0?'+':''}${e.delta}</b>`}
        ], bal.events.slice(0,6)) : `<div class="xs muted">Monthly coin closures &amp; reward redemptions appear here automatically.</div>`}
      </div>
    </div>`, {sub:'Identical objective formula across every county office and role.'});

  const leaderboardCard = card('Laureate Podium & Verified Staff Standings', (()=>{
      const top3 = board.slice(0,3);
      const podiumOrder = top3.length>=3 ? [top3[1], top3[0], top3[2]] : top3;
      const medalMeta = rank => rank===1
        ? { label:'1st · Gold Laureate', fill:'#F59E0B', ring:'#FEF3C7', ink:'#78350F', svg:`<svg viewBox="0 0 36 36" width="32" height="32" aria-hidden="true"><circle cx="18" cy="20" r="11" fill="#F59E0B" stroke="#B45309" stroke-width="2"/><path d="M12 4h5l2 6h-5zM24 4h-5l-2 6h5z" fill="#DC2626"/><text x="18" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">1</text></svg>` }
        : rank===2
        ? { label:'2nd · Silver Merit', fill:'#64748B', ring:'#F1F5F9', ink:'#1E293B', svg:`<svg viewBox="0 0 36 36" width="28" height="28" aria-hidden="true"><circle cx="18" cy="20" r="10.5" fill="#94A3B8" stroke="#475569" stroke-width="2"/><path d="M12 5h5l2 6h-5zM24 5h-5l-2 6h5z" fill="#2563EB"/><text x="18" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">2</text></svg>` }
        : { label:'3rd · Bronze Honour', fill:'#B45309', ring:'#FFEDD5', ink:'#7C2D12', svg:`<svg viewBox="0 0 36 36" width="28" height="28" aria-hidden="true"><circle cx="18" cy="20" r="10.5" fill="#D97706" stroke="#92400E" stroke-width="2"/><path d="M12 5h5l2 6h-5zM24 5h-5l-2 6h5z" fill="#0F766E"/><text x="18" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">3</text></svg>` };
      const podiumHtml = top3.length ? `<div class="coins-podium">
        ${podiumOrder.map(item=>{
          const rk = board.indexOf(item) + 1;
          const m = medalMeta(rk);
          const uCoins = CREDITS.earned(item.u).balance;
          const uBand = scoreBand(item.s.score);
          return `<div class="podium-card podium-r${rk} ${item.u.id===user.id?'is-me':''}">
            <div class="podium-medal">${m.svg}<span class="podium-rank-lbl">${esc(m.label)}</span></div>
            <div class="podium-avatar-wrap">
              <span class="avatar podium-avatar" style="background:${esc(WTHEME.safeFill((deptObj((roleObj(item.u.roleId)||{}).dept||item.u.departmentId)||{}).accent||'#334155'))}">${initials(item.u.name)}</span>
              <span class="podium-score-pill">${item.s.score}%</span>
            </div>
            <b class="podium-name">${esc(item.u.name.replace(/^Demo - /,''))}</b>
            <span class="podium-role">${esc((roleObj(item.u.roleId)||{}).name||'')} · ${esc(countyName(item.u.countyId))}</span>
            <div class="podium-foot">
              <span class="badge b-${uBand.tone}">${uBand.name}</span>
              <span class="podium-coins">${ic('sparkles',13)} ${num(uCoins)} coins</span>
            </div>
          </div>`;
        }).join('')}
      </div>` : '';
      return podiumHtml + `<div class="lb" style="margin-top:14px">
        ${board.slice(0,12).map((b,i)=>{
          const uCoins = CREDITS.earned(b.u).balance;
          const uBand = scoreBand(b.s.score);
          return `<div class="lb-row ${b.u.id===user.id?'lb-me':''}">
            <span class="lb-rank lb-rank-${i<3?i+1:'n'}">${i+1}</span>
            <span class="avatar" style="background:${esc(WTHEME.safeFill((deptObj((roleObj(b.u.roleId)||{}).dept||b.u.departmentId)||{}).accent||'#334155'))}">${initials(b.u.name)}</span>
            <div class="lb-id"><b>${esc(b.u.name.replace(/^Demo - /,''))}${b.u.id===user.id?' <span class="badge b-info nodot">You</span>':''}</b><span>${esc((roleObj(b.u.roleId)||{}).name||'')} · ${esc(countyName(b.u.countyId))}</span></div>
            <div class="lb-bar"><span style="width:${b.s.score}%"></span></div>
            <b class="mono lb-pct">${b.s.score}%</b>
            <span class="badge b-${uBand.tone} nodot">${uBand.name}</span>
            <span class="lb-coin-pill">${ic('sparkles',12)} ${num(uCoins)}</span>
          </div>`;
        }).join('')}
      </div>`;
    })(), {sub:'Scored objectively from verified system records — refreshed automatically & sealed at monthly close.'});

  const perksCard = card('Foundation Rewards & Equipment Perks Catalogue', `<div class="perks perks-grid">
      ${PERKS.map((p,idx)=>{
        const canAfford = bal.balance >= p.cost;
        const pct = Math.min(100, Math.round((bal.balance / Math.max(1, p.cost)) * 100));
        const artThemes = [
          { bg:'linear-gradient(135deg,#1E3A8A,#0EA5E9)', ic:'image', tag:'Media & Creative Gear' },
          { bg:'linear-gradient(135deg,#065F46,#10B981)', ic:'book', tag:'Studio & Production' },
          { bg:'linear-gradient(135deg,#7C2D12,#F59E0B)', ic:'layers', tag:'ICT Field Kit' },
          { bg:'linear-gradient(135deg,#581C87,#A855F7)', ic:'sparkles', tag:'Commemorative Print' },
          { bg:'linear-gradient(135deg,#0F766E,#14B8A6)', ic:'shield', tag:'Professional Growth' },
          { bg:'linear-gradient(135deg,#1E293B,#475569)', ic:'package', tag:'Office Convenience' }
        ];
        const art = artThemes[idx % artThemes.length];
        return `<article class="perk-card ${canAfford?'perk-ready':''}">
          <div class="perk-art" style="background:${art.bg}">
            <div class="perk-art-badge">${esc(art.tag)} · ${esc(titleCase(p.owner))}</div>
            <div class="perk-art-icon">${ic(art.ic,26)}</div>
            <div class="perk-cost-chip"><svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="#FBBF24" stroke="#B45309" stroke-width="1.6"/><text x="10" y="13.5" text-anchor="middle" font-size="9" font-weight="800" fill="#78350F">C</text></svg> <b>${p.cost}</b> coins</div>
          </div>
          <div class="perk-body">
            <h4>${esc(p.name)}</h4>
            <p class="xs muted">${esc(p.note)}</p>
            <div class="perk-prog-wrap">
              <div class="spread xs" style="margin-bottom:4px">
                <span class="muted">${canAfford?'Unlocked — ready to redeem':`${bal.balance} / ${p.cost} coins saved`}</span>
                <b class="mono">${pct}%</b>
              </div>
              <div class="perk-prog"><span style="width:${pct}%"></span></div>
            </div>
            <div class="perk-foot">
              <span class="xs muted">Custodian: <b>${esc(titleCase(p.owner))} Dept</b></span>
              <button class="btn btn-xs ${canAfford?'btn-primary':'btn-ghost'}" data-act="coins-redeem" data-id="${p.id}"
                ${canAfford?'':'disabled'}>${canAfford?`${ic('check',12)} Redeem reward`:`Need ${p.cost-bal.balance} more`}</button>
            </div>
          </div>
        </article>`;
      }).join('')}
    </div>`, {sub:'C-DIMS Coins unlock supervised Foundation equipment loans & staff recognition perks — never access to patient records.'});

  return pageHead('C-DIMS coins & staff recognition',
    'Transparent data-completeness recognition, objective 5-pillar scoring, symmetrical standings, and Foundation equipment rewards.',
    `<div class="row" style="gap:8px;flex-wrap:wrap">
      ${RBAC.has(user,'hr.view')||RBAC.has(user,'credit.manage')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="evaluation">${ic('users',14)} Staff Evaluation Matrix</button>`:''}
      ${RBAC.has(user,'credit.manage')?`<button class="btn btn-sm btn-primary" data-act="coins-run">${ic('sparkles',15)} Close Monthly Cycle</button>`:''}
    </div>`)
  + `<div class="grid g4" style="margin-bottom:14px">
      ${kpi('Your usage & quality score', mine.score+'%', band.name+' standing', band.tone==='ok'?'ok':band.tone==='crit'?'crit':'info','target')}
      ${kpi('Available C-DIMS coins', num(bal.balance), `Earned ${num(bal.awarded)} · Spent ${num(bal.spent)}`, 'ok', 'sparkles')}
      ${kpi('Standing rank', maySeeAll || myRank ? '#'+(myRank||1) : '—', `Of ${num(board.length)} staff in scope`, 'info', 'chart')}
      ${kpi('Rewards unlocked', `${affordableCount} / ${PERKS.length}`, affordableCount ? 'Ready for 1-click redemption' : 'Keep recording timely visits', affordableCount?'ok':'warn', 'package')}
    </div>`
  + spotlightBanner
  + sheetTabs
  + (sheet==='standings' ? leaderboardCard
    : sheet==='perks' ? perksCard
    : sheet==='formula' ? formulaCard
    : `<div style="margin-bottom:16px">${formulaCard}</div><div style="margin-bottom:16px">${leaderboardCard}</div>${perksCard}`);
}

/* A supervisor's view: every account, its use of the console, and the
   correction the score implies. */
function renderStaffEvaluation(user){
  if(!RBAC.has(user,'credit.manage') && !RBAC.has(user,'hr.view') && !RBAC.has(user,'report.executive')) return deniedPanel('credit.manage');
  const rows = (DB.db.users||[]).filter(u=>u.status==='active').map(u=>{
    const s = CREDITS.score(u);
    const b = scoreBand(s.score);
    const last = u.lastLogin ? daysBetween(u.lastLogin) : null;
    return { u, s, b, last, coins:CREDITS.earned(u).balance };
  }).sort((a,b)=>b.s.score-a.s.score);
  const avg = rows.length ? Math.round(rows.reduce((n,r)=>n+r.s.score,0)/rows.length) : 0;
  return pageHead('Staff evaluation',
    'System usage, data quality and follow-up discipline for every account  -  the evidence behind the recognition score.') +
  `<div class="grid g4">
    ${kpi('Accounts evaluated', num(rows.length), 'active accounts','','users')}
    ${kpi('Average score', avg+'%', scoreBand(avg).name,'','chart')}
    ${kpi('Above 90%', num(rows.filter(r=>r.s.score>=90).length), 'Platinum standing','ok','target')}
    ${kpi('Not signed in for 14 days', num(rows.filter(r=>r.last===null||r.last>14).length), 'follow-up required',rows.filter(r=>r.last===null||r.last>14).length?'warn':'','clock')}
  </div>
  <div class="card" style="margin-top:16px"><div class="card-b">
  ${table([
    {label:'Person', render:r=>`<div class="cellname">${esc(r.u.name)}<span class="sm">${esc((roleObj(r.u.roleId)||{}).name||'')} · ${esc(countyName(r.u.countyId))}</span></div>`},
    {label:'Score', render:r=>`<b class="mono">${r.s.score}%</b>`},
    {label:'Standing', render:r=>`<span class="badge ${r.b.tone}">${r.b.name}</span>`},
    {label:'Weakest part', render:r=>{ const w=r.s.parts.slice().sort((a,b)=>(a.w*a.v)-(b.w*b.v))[0]; return `<span class="small">${esc(w.k)}</span><div class="xs muted">${esc(w.note)}</div>`; }},
    {label:'Coins', render:r=>num(r.coins)},
    {label:'Last sign-in', render:r=>r.last===null?'<span class="badge b-warn">Never</span>':r.last+' days ago'}
  ], rows)}
  </div></div>`;
}

/* ------------------------------------------------------------ actions */
Object.assign(ACTIONS, {
  'coins-run': () => {
    const r = CREDITS.runMonthly(AUTH.user);
    if(!r.ok) return toast('Not run', r.error, 'err');
    toast('Recognition closed', `${r.results.length} people scored for ${r.month}.`, 'ok');
    render();
  },
  'coins-redeem': d => {
    const r = CREDITS.redeem(AUTH.user, d.id);
    if(!r.ok) return toast('Not redeemed', r.error, 'err');
    toast('Reward requested', `${r.perk.name}  -  the ${titleCase(r.perk.owner)} department has been asked to release it.`, 'ok');
    render();
  }
});

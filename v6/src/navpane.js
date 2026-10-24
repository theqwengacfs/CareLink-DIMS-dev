/* ============================================================
   navpane.js - Console navigation pane (v5.1)

   One pane per console. It is built from navModel(), which already lists
   only the pages this person's capabilities allow, so the pane can never
   show a page the role may not open, and opening one still goes through
   the same checks as before. The pane only changes ORDER and PRESENTATION:

     - the groups a department works in most come first
     - every page navModel() returns appears exactly once, never added to,
       never removed
     - groups fold, and the whole pane folds to an icon rail
     - on a narrow screen the pane is a drawer opened from the sheet

   Layout choice is personal ('pane' or 'tabs') so the earlier tab sheet
   stays available to anyone who prefers it.
   ============================================================ */

const CONSOLE_FOCUS = {
  exec:     ['Overview','Partner & referral','Leadership','Reporting','Patients & field','Ministry & teams','People','Assurance'],
  admin:    ['Overview','Patients & field','Partner & referral','Ministry & teams','Hospital operations','Care centre','People','Reporting','System'],
  medical:  ['Overview','Patients & field','Clinical & pharmacy','Partner & referral','Hospital operations','Care centre','Reporting','Ministry & teams'],
  ministry: ['Overview','Patients & field','Ministry & teams','Partner & referral','Care centre','Clinical & pharmacy','Reporting','People'],
  media:    ['Overview','Media & governance','Partner & referral','Reporting','Department life','People'],
  finance:  ['Overview','Finance & procurement','Reporting','Ministry & teams','People'],
  procure:  ['Overview','Finance & procurement','Reporting','Ministry & teams','People'],
  me:       ['Overview','Reporting','Partner & referral','Patients & field','Assurance','Ministry & teams'],
  audit:    ['Overview','Assurance','Reporting','Finance & procurement','Ministry & teams','People'],
  hr:       ['Overview','People','Reporting'],
  welfare:  ['Overview','People','Reporting'],
  vehicle:  ['Overview','Fleet & transport','Ministry & teams','People'],
  pr:       ['Overview','Media & governance','Partner & referral','Reporting','Ministry & teams','People'],
  hospital: ['Overview','Partner & referral','Hospital operations','Patients & field','Clinical & pharmacy','Ministry & teams','Reporting'],
  pharmacy: ['Overview','Clinical & pharmacy','Patients & field','Ministry & teams','Reporting'],
  it:       ['Overview','System','Assurance','Ministry & teams'],
  intldata: ['Overview','Clinical & pharmacy','Partner & referral','Reporting','Assurance','Ministry & teams'],
  homestay: ['Overview','Care centre','Patients & field','Ministry & teams']
};

const NAV_GROUP_ICON = {
  'Overview':'home', 'Patients & field':'users', 'Partner & referral':'hospital', 'Clinical & pharmacy':'package', 'Hospital operations':'hospital',
  'Care centre':'bed', 'Reporting':'file', 'Finance & procurement':'wallet', 'Media & governance':'image',
  'People':'idcard', 'Fleet & transport':'car', 'Assurance':'shieldcheck', 'System':'settings', 'Leadership':'chart',
  'Ministry & teams':'route', 'Department life':'book'
};

/* Below this width the pane is a drawer and the tab sheet is shown. */
const NAV_PANE_MIN = 1000;

const NAVP = {
  /* Reorders groups for a department. Pure: same pages in, same pages out. */
  ordered(groups, deptId){
    const focus = CONSOLE_FOCUS[deptId] || [];
    const rank = g => { const i = focus.indexOf(g.label); return i<0? 1000 : i; };
    return groups.map((g,i)=>({g,i})).sort((a,b)=> (rank(a.g)-rank(b.g)) || (a.i-b.i)).map(x=>x.g);
  },
  groups(user){
    const role = roleObj(user.roleId) || {};
    return NAVP.ordered(navModel(user), role.dept || user.departmentId);
  },

  prefs(user){
    const p = (DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id]) || {};
    return {
      layout: p.navLayout==='tabs'? 'tabs' : 'pane',
      rail: p.navRail===true,
      autoFold: p.navAutoFold!==false,
      railExplicit: p.navRailExplicit===true,
      groups: (p.navGroups && typeof p.navGroups==='object')? p.navGroups : {}
    };
  },
  enabled(user){ return !!user && NAVP.prefs(user).layout==='pane'; },
  narrow(){ try{ return (window.innerWidth||1280) < NAV_PANE_MIN; }catch(e){ return false; } },

  /* Natural / automatic folding: folds automatically into the sleek icon rail
     when working inside workspace modules or on tablets, and naturally returns
     to expanded on Console Home unless manually pinned by the user. */
  effectiveRail(user, view){
    if(!user) return false;
    const pr = NAVP.prefs(user);
    if(pr.rail) return true;
    if(pr.railExplicit && !pr.rail) return false;
    if(!pr.autoFold) return false;
    const curView = view || (typeof APPX!=='undefined' && APPX.view) || 'home';
    const isTab = (typeof DEVICE!=='undefined' && DEVICE.isTablet && DEVICE.isTablet());
    let compactDesktop = false;
    try{ const w = window.innerWidth||1366; compactDesktop = (w >= NAV_PANE_MIN && w <= 1260); }catch(e){}
    if(isTab || compactDesktop) return true;
    return curView !== 'home';
  },

  setPref(user, key, value){
    DB.db.personalPrefs = DB.db.personalPrefs || {};
    DB.db.personalPrefs[user.id] = DB.db.personalPrefs[user.id] || {};
    DB.db.personalPrefs[user.id][key] = value;
    DB.save();
  },
  /* Open by default: the first two groups for the role. Anything the person folds or opens is remembered. */
  isOpen(user, label, index, active){
    if(active) return true;
    const g = NAVP.prefs(user).groups;
    return Object.prototype.hasOwnProperty.call(g,label)? g[label]===true : index<2;
  },
  toggleGroup(user, label, index){
    const groups = Object.assign({}, NAVP.prefs(user).groups);
    groups[label] = !NAVP.isOpen(user, label, index, false);
    NAVP.setPref(user, 'navGroups', groups);
  },
  toggleRail(user){
    const next = !NAVP.prefs(user).rail;
    NAVP.setPref(user, 'navRail', next);
    NAVP.setPref(user, 'navRailExplicit', true);
  },
  enableAutoFold(user){
    const pr = NAVP.prefs(user);
    const nextAuto = !(pr.autoFold && !pr.railExplicit);
    NAVP.setPref(user, 'navAutoFold', nextAuto);
    NAVP.setPref(user, 'navRailExplicit', !nextAuto);
    if(nextAuto) NAVP.setPref(user, 'navRail', false);
  },

  /* The pane. `here(id)` says whether a page is the one on screen. */
  html(user, here){
    const pr = NAVP.prefs(user);
    const curView = (typeof APPX!=='undefined' && APPX.view) || 'home';
    const effRail = NAVP.effectiveRail(user, curView);
    const autoActive = pr.autoFold && !pr.railExplicit;
    const groups = NAVP.groups(user);
    const role = roleObj(user.roleId) || {};
    const dept = deptObj(user.departmentId) || { accent:'#C8102E' };
    const total = groups.reduce((n,g)=>n+g.items.length,0);
    const body = groups.map((g,gi)=>{
      const active = g.items.some(i=>here(i.id));
      const open = NAVP.isOpen(user, g.label, gi, active);
      const gcount = g.items.reduce((n,i)=>n+(Number(i.count)||0),0);
      return `<section class="np-g ${open?'open':''}" data-g="${esc(g.label)}">
        <button class="np-gh" data-act="nav-group" data-g="${esc(g.label)}" data-i="${gi}" aria-expanded="${open}" title="${esc(g.label)}">
          <span class="np-gi">${ic(NAV_GROUP_ICON[g.label]||'layers',16)}</span><span class="np-gt">${esc(g.label)}</span>
          ${(!open && gcount)?`<span class="tcount np-gc">${gcount}</span>`:''}<span class="np-chev">${ic('chevron',14)}</span>
        </button>
        <div class="np-items" role="group" aria-label="${esc(g.label)}">
          ${g.items.map(i=>`<button class="np-i ${here(i.id)?'on':''}" data-act="go" data-v="${esc(i.id)}" title="${esc(i.label)}" ${here(i.id)?'aria-current="page"':''}>
            ${ic(i.icon,18)}<span class="np-l">${esc(i.label)}</span>${i.count?`<span class="tcount ${i.tone==='crit'?'crit':''}">${i.count}</span>`:''}
          </button>`).join('')}
        </div>
      </section>`;
    }).join('');
    return `<nav class="npane" id="npane" aria-label="Pages in this console" data-rail="${effRail?1:0}" data-autofold="${autoActive?1:0}">
      <div class="np-brand">
        <img src="${window.LOGO||''}" alt="LOMAMO Foundation">
        <div class="np-id"><div class="np-os">CareLink OS</div><b>${esc(role.consoleTitle||role.name||'Console')}</b>
          <span><i class="np-dot" style="background:${esc(dept.accent)}"></i>${esc(role.name||'')}</span></div>
        <button class="np-x" data-act="nav-close" aria-label="Close navigation">${ic('x',18)}</button>
      </div>
      <div class="np-scroll">${body}</div>
      <div class="np-foot">
        <button class="np-i" data-act="wtheme-open" title="Workspace theme">${ic('palette',18)}<span class="np-l">Theme</span></button>
        <button class="np-i" data-act="go" data-v="settings" title="Preferences">${ic('settings',18)}<span class="np-l">Preferences</span></button>
        <button class="np-i" data-act="nav-autofold" title="Toggle natural auto-folding of left pane" aria-pressed="${autoActive}">${ic('sparkles',18)}<span class="np-l">Auto-fold: ${autoActive?'ON':'OFF'}</span></button>
        <button class="np-i np-collapse" data-act="nav-rail" title="${effRail?'Pin pane open':'Fold the pane to icons'}" aria-pressed="${effRail}">${ic('panel',18)}<span class="np-l">${effRail?'Pin open':'Fold pane'}</span></button>
        <div class="np-meta">${total} pages for your role</div>
      </div>
    </nav>`;
  },

  _lastView: null,
  /* Keep the pane's scroll position across a redraw; only auto-reveal the active item when the view itself changed. */
  scrollState(){
    const el = document.querySelector && document.querySelector('.np-scroll');
    return el? el.scrollTop : null;
  },
  restoreScroll(top){
    const el = document.querySelector && document.querySelector('.np-scroll');
    if(!el) return;
    const curView = (typeof APPX!=='undefined' && APPX.view) ? APPX.view : '';
    const viewChanged = NAVP._lastView !== curView;
    NAVP._lastView = curView;
    if(top!==null && top!==undefined) el.scrollTop = top;
    if(viewChanged){
      const on = el.querySelector && el.querySelector('.np-i.on');
      if(on && on.offsetTop!==undefined){
        const vis0 = el.scrollTop, vis1 = vis0 + el.clientHeight;
        if(on.offsetTop < vis0 || on.offsetTop + on.offsetHeight > vis1) el.scrollTop = Math.max(0, on.offsetTop - 80);
      }
    }
  }
};

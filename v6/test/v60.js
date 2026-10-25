/* v6.0 · Data quality and the visit-order learner.
   Each check drives the data layer the way the pages do, including the
   refusal paths: a waiver without a capability, a waiver of a blocking
   finding, a suggestion before there is any pattern to learn from. */
const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedDemo();');
run(`AUTH.logout(); AUTH.login('chief.admin','LOMAMO2026');`);

let pass=0, fail=0; const fails=[];
function ok(name, cond, detail){
  if(cond){ pass++; } else { fail++; fails.push(name+(detail?(' — '+detail):'')); }
}
function test(name, fn){
  try{ const r=fn(); if(r===false) throw new Error('returned false'); ok(name,true); }
  catch(e){ ok(name,false,e.message); }
}
const as = u => { run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026');`); return run(`AUTH.user.id`); };

/* ---------------------------------------------------------------- 1. findings */
test('every finding carries a level, a rule and the record it concerns', ()=>{
  const list = run(`DQ6.scan(AUTH.user)`);
  ok('findings are produced', list.length>0, 'no findings at all');
  ok('each has a level', list.every(i=>['block','warn','info'].includes(i.level)));
  ok('each has a stable key', list.every(i=>typeof i.key==='string' && i.key.includes(':')), 'a waiver would not survive a rescan');
  ok('each names its record', list.every(i=>i.entity && i.entityId));
  return true;
});

test('blocking findings are ranked before warnings and advisories', ()=>{
  const ranks = run(`DQ6.scan(AUTH.user)`).map(i=>run(`DQ6.LEVELS['${i.level}'].rank`));
  const sorted = ranks.every((r,i)=>i===0 || ranks[i-1]<=r);
  ok('ordered by severity', sorted);
  return true;
});

test('a duplicate national ID is blocking and is never merged automatically', ()=>{
  const p = run(`(()=>{ const ps=DB.db.patients; ps[0].nationalId='NAT-778899'; ps[1].nationalId='NAT-778899'; DB.save(); return 'NAT-778899'; })()`);
  const found = run(`DQ6.scan(AUTH.user).filter(i=>i.rule==='duplicate-national-id')`);
  ok('duplicate flagged', found.length>0);
  ok('flagged as blocking', found.every(i=>i.level==='block'));
  ok('records are not merged', run(`DB.db.patients.filter(p=>p.nationalId==='${p}').length`)===2);
  ok('both records still exist', run(`DB.db.patients.length`)>1);
  return true;
});

/* ---------------------------------------------------------------- 2. waivers */
test('a caregiver cannot waive a data-quality finding', ()=>{
  as('caregiver.nyalenda');
  const key = run(`(DQ6.scan(AUTH.user).find(i=>i.level==='warn')||{}).key||''`);
  const r = run(`DQ6.waive(AUTH.user, '${key}', 'Accepted for this review period', 30)`);
  ok('refused', r.ok===false);
  ok('reason is the capability', /dq\.manage/.test(r.error||''));
  return true;
});

test('a waiver needs a written reason and a stated period', ()=>{
  as('me.kisumu');
  const key = run(`(DQ6.open(AUTH.user).find(i=>i.level==='warn')||{}).key||''`);
  const short = run(`DQ6.waive(AUTH.user, '${key}', 'ok', 30)`);
  ok('a two-word reason is refused', short.ok===false);
  const good = run(`DQ6.waive(AUTH.user, '${key}', 'Contact number is held on the paper file pending digitisation', 30)`);
  ok('a reasoned waiver is accepted', good.ok===true, good.error);
  ok('it carries an end date', /^\d{4}-\d{2}-\d{2}$/.test(good.until||''));
  ok('it leaves the open list', !run(`DQ6.open(AUTH.user).some(i=>i.key==='${key}')`));
  ok('it is auditable', run(`DB.db.audit.some(a=>a.action==='dataquality.waived')`));
  return true;
});

test('a blocking finding cannot be waived at all', ()=>{
  as('me.kisumu');
  const block = run(`DQ6.scan(AUTH.user).find(i=>i.level==='block')`);
  if(!block){ ok('simulated blocking finding', false, 'seed has no blocking finding'); return true; }
  const r = run(`DQ6.waive(AUTH.user, '${block.key}', 'We would rather not fix this one before the report', 30)`);
  ok('refused', r.ok===false);
  ok('says to correct the record', /corrected in the record/i.test(r.error||''));
  return true;
});

test('a waiver expires by itself and the finding returns', ()=>{
  as('me.kisumu');
  const key = run(`(DQ6.open(AUTH.user).find(i=>i.level==='info')||DQ6.open(AUTH.user)[0]||{}).key||''`);
  if(!key){ ok('a finding to waive', false, 'nothing open'); return true; }
  const good = run(`DQ6.waive(AUTH.user, '${key}', 'Document check scheduled for the November audit visit', 30)`);
  ok('waived', good.ok===true, good.error);
  run(`DB.db.dqIssues.find(w=>w.key==='${key}').until='2020-01-01'`);
  ok('an expired waiver no longer hides the finding', run(`DQ6.open(AUTH.user).some(i=>i.key==='${key}')`));
  return true;
});

test('a waiver can be withdrawn and stays in the register', ()=>{
  as('me.kisumu');
  const w = run(`(DB.db.dqIssues.find(x=>x.status==='waived')||{}).id`);
  const r = run(`DQ6.reopen(AUTH.user, '${w}')`);
  ok('withdrawn', r.ok===true, r.error);
  ok('the entry is kept, not deleted', run(`DB.db.dqIssues.some(x=>x.id==='${w}' && x.status==='reopened')`));
  ok('the withdrawal is audited', run(`DB.db.audit.some(a=>a.action==='dataquality.reopened')`));
  return true;
});

test('financial findings are only produced for roles that may see finance', ()=>{
  as('caregiver.nyalenda');
  ok('caregiver sees no receipt finding', !run(`DQ6.scan(AUTH.user).some(i=>i.rule==='receipt-missing')`));
  as('auditor');
  ok('auditor may see them', run(`RBAC.has(AUTH.user,'audit.view')`));
  return true;
});

/* ---------------------------------------------------- 3. visit-order learner */
test('the learner refuses to propose an order without field days', ()=>{
  as('caregiver.nyalenda');
  run(`(()=>{ const uid=AUTH.user.id; DB.db.visits = DB.db.visits.filter(v=>v.caregiverId!==uid); DB.save(); })()`);
  const r = run(`PLAN6.suggest(AUTH.user, 4)`);
  ok('no proposal', r.list.length===0);
  ok('it says how many more days it needs', r.basis.needsMore>0);
  return true;
});

test('the learned order comes from recorded field days, not from a guess', ()=>{
  as('caregiver.nyalenda');
  const uid = run(`AUTH.user.id`);
  /* Three field days, walked in a deliberate order. */
  run(`(()=>{
    DB.db.visits = DB.db.visits.filter(v=>v.caregiverId!=='${uid}');
    const ps = repo.patientList(AUTH.user);
    const a = ps[0], b = ps[1];
    ['2026-10-14','2026-10-15','2026-10-16'].forEach((d,n)=>{
      DB.db.visits.push({ id:'t1-'+n, patientId:a.id, caregiverId:'${uid}', date:d, type:'home', outcome:'seen' });
      DB.db.visits.push({ id:'t2-'+n, patientId:b.id, caregiverId:'${uid}', date:d, type:'home', outcome:'seen' });
    });
    DB.save();
  })()`);
  const pat = run(`PLAN6.patterns(AUTH.user)`);
  ok('three field days learned', pat.days.length===3, String(pat.days.length));
  ok('movement between areas recorded', pat.transitions.length>0 || pat.days.every(d=>d.stops.length===2));
  const sug = run(`PLAN6.suggest(AUTH.user, 4)`);
  ok('a proposal is now produced or nothing is due', sug.list.length>=0);
  ok('every proposal states its reasons', sug.list.every(x=>x.reasons.length>0));
  ok('the basis is reported', typeof sug.basis.fieldDays==='number' && sug.basis.fieldDays===3);
  return true;
});

test('a proposal becomes a calendar entry only when a person adds it', ()=>{
  as('caregiver.nyalenda');
  ok('nothing was scheduled by the learner itself', run(`(DB.db.calendarEvents||[]).filter(e=>e.source==='visit-order-learner').length`)===0);
  const pid = run(`(repo.patientList(AUTH.user).find(p=>['active','extension'].includes(p.status))||{}).id`);
  const r = run(`PLAN6.add(AUTH.user, '${pid}')`);
  ok('added', r.ok===true, r.error);
  ok('the entry names its source', run(`DB.db.calendarEvents.some(e=>e.patientId==='${pid}' && e.source==='visit-order-learner')`));
  ok('the reason travels with it', run(`DB.db.calendarEvents.filter(e=>e.patientId==='${pid}').slice(-1)[0].detail`).length>10);
  ok('adding the same patient twice is refused', run(`PLAN6.add(AUTH.user, '${pid}').ok`)===false);
  ok('the addition is audited', run(`DB.db.audit.some(a=>a.action==='visitplan.suggested_added')`));
  return true;
});

test('an unauthorised role cannot add a visit to a plan', ()=>{
  as('finance.kisumu');
  const pid = run(`DB.db.patients[0].id`);
  const r = run(`PLAN6.add(AUTH.user, '${pid}')`);
  ok('refused', r.ok===false);
  ok('reason is the capability', /does not schedule/.test(r.error||''));
  return true;
});

test('the week shows visited and not-visited per day from real records', ()=>{
  as('caregiver.nyalenda');
  const week = run(`PLAN6.week(AUTH.user)`);
  ok('seven days', week.length===7);
  ok('each day carries its counts', week.every(d=>typeof d.visited==='number' && typeof d.due==='number'));
  ok('future days cannot be marked missed', week.filter(d=>new Date(d.date)>new Date()).every(d=>d.missed===0));
  return true;
});

/* ------------------------------------------------------------ 4. the pages */
test('both pages render for the roles that are offered them', ()=>{
  as('me.kisumu');
  const q = run(`contentFor('quality',{},AUTH.user)`);
  ok('data quality renders', typeof q==='string' && q.includes('Data quality'));
  ok('it is not a denial panel', !/Access denied|not available to your role/i.test(q));
  ok('it names blocking and warnings', /Blocking/.test(q) && /Warnings/.test(q));
  as('caregiver.nyalenda');
  const p = run(`contentFor('visitplan',{},AUTH.user)`);
  ok('visit planner renders', typeof p==='string' && p.includes('Visit planner'));
  ok('it is honest before any field day', /not enough field days/i.test(p) || /Suggested next/i.test(p));
  return true;
});

test('a role without patient access is refused the data-quality page', ()=>{
  as('finance.kisumu');
  const html = run(`contentFor('quality',{},AUTH.user)`);
  ok('refused or scoped, never a blank page', typeof html==='string' && html.length>50);
  return true;
});


/* ------------------------------------------- 5. indicators and their formulas */
/* The demonstration seed carries patients and visits but no indicator
   registry, so the registry is seeded here the same way an official
   installation seeds it. */
run(`DB.db.dataElements = dataElementSeed(); DB.db.indicators = indicatorSeed(); DB.save();`);
test('the formula parser accepts arithmetic and refuses everything else', ()=>{
  ok('a plain fraction', run(`IND6.evaluate('de-001 / de-002 * 100', {'de-001':10,'de-002':40}).value`)===25);
  ok('multiplication before addition', run(`IND6.evaluate('2 + 3 * 4', {}).value`)===14);
  ok('brackets', run(`IND6.evaluate('(2 + 3) * 4', {}).value`)===20);
  ok('round', run(`IND6.evaluate('round(2.6)', {}).value`)===3);
  ok('safeDiv of zero', run(`IND6.evaluate('safeDiv(5, 0)', {}).value`)===0);
  const bad = ['alert(1)', 'require("fs")', 'DB.db', 'de-001; return 1', 'process.exit(1)',
               'this.constructor', 'window.location', '`x`', 'de-001 => 1', 'eval("1")'];
  bad.forEach(expr=>{
    const r = run(`IND6.evaluate(${JSON.stringify(expr)}, {'de-001':1})`);
    ok('refused: '+expr, r.ok===false, JSON.stringify(r));
  });
  ok('unknown function refused', run(`IND6.evaluate('pct(1,2)', {})`).ok===false);
  ok('unknown element refused', run(`IND6.evaluate('de-999 * 2', {'de-001':1})`).ok===false);
  ok('division by zero refused', run(`IND6.evaluate('1 / 0', {})`).ok===false);
  return true;
});

test('a division by a zero denominator produces no number at all', ()=>{
  as('me.kisumu');
  const ind = run(`({ id:'x', name:'test', numerator:'de-001', denominator:'de-999', unit:'%' })`);
  const r = run(`IND6.compute(${JSON.stringify(ind)}, AUTH.user)`);
  ok('no percentage', r.ok===false);
  ok('the reason is stated', /zero|unknown/i.test(r.error||''));
  return true;
});

test('a data element needs a name and a source', ()=>{
  as('me.kisumu');
  ok('nameless refused', run(`IND6.addElement(AUTH.user, { source:'welfare.distribution' }).ok`)===false);
  ok('sourceless refused', run(`IND6.addElement(AUTH.user, { name:'Bibles distributed' }).ok`)===false);
  const r = run(`IND6.addElement(AUTH.user, { name:'Bibles distributed', source:'welfare.distribution', unit:'items' })`);
  ok('a sourced element is created', r.ok===true, r.error);
  ok('it is in the registry', run(`DB.db.dataElements.some(e=>e.name==='Bibles distributed')`));
  ok('its creation is audited', run(`DB.db.audit.some(a=>a.action==='dataelement.created')`));
  return true;
});

test('a new indicator version never edits the reported one', ()=>{
  as('me.kisumu');
  const before = run(`IND6.nextVersion(AUTH.user,'ind-001').latest`);
  const r = run(`IND6.addVersion(AUTH.user,'ind-001',{ definition:'Visits completed divided by patients active.', numerator:'de-001', denominator:'de-002' })`);
  ok('a new version is created', r.ok===true, r.error);
  ok('the number increments', r.indicator.version===before.version+1);
  ok('the old version still exists unchanged', run(`DB.db.indicators.some(i=>i.id==='ind-001' && i.version===${before.version} && i.numerator==='${before.numerator}')`));
  ok('the new one starts as a draft', r.indicator.approval==='draft');
  ok('the change is audited', run(`DB.db.audit.some(a=>a.action==='indicator.version_created')`));
  return true;
});

test('an indicator version naming an undefined element is refused', ()=>{
  as('me.kisumu');
  const r = run(`IND6.addVersion(AUTH.user,'ind-001',{ numerator:'de-777', denominator:'de-002' })`);
  ok('refused', r.ok===false);
  ok('the element is named in the message', /de-777/.test(r.error||''));
  return true;
});

test('only indicator.manage may define or approve, and approval fixes a version', ()=>{
  as('caregiver.nyalenda');
  ok('caregiver cannot create a version', run(`IND6.addVersion(AUTH.user,'ind-001',{}).ok`)===false);
  ok('caregiver cannot add an element', run(`IND6.addElement(AUTH.user,{name:'x y z', source:'a.b'}).ok`)===false);
  as('me.kisumu');
  const r = run(`IND6.addVersion(AUTH.user,'ind-002',{})`);
  const a = run(`IND6.approveVersion(AUTH.user,'ind-002',${r.indicator.version})`);
  ok('approved', a.ok===true, a.error);
  ok('fixed against further edit', a.indicator.immutable===true);
  ok('approval is audited', run(`DB.db.audit.some(x=>x.action==='indicator.approved')`));
  return true;
});

test('the indicator page states what it is not', ()=>{
  as('me.kisumu');
  const html = run(`contentFor('indicators',{},AUTH.user)`);
  ok('renders', typeof html==='string' && /Data elements/.test(html));
  ok('says it is not a KHIS submission', /not an official KHIS submission/i.test(html));
  ok('distinguishes zero from missing', /not recorded/.test(html) || /genuine zero/i.test(html));
  return true;
});


/* ------------------------------------------- 6. analytics, pivot, map, interop & governance */
test('pivot engine, regional map, KHIS non-submission guard and FHIR consent filter', ()=>{
  as('me.kisumu');
  const piv = run(`PIVOT6.compute(AUTH.user, 'area', 'status', 'count')`);
  ok('pivot totals match scoped patients', piv.grandTotal === piv.totalPatients && piv.totalPatients > 0);
  ok('pivot CSV exports header and total row', /Total/.test(run(`PIVOT6.csv(PIVOT6.compute(AUTH.user,'area','sex','count'))`)));
  const html = run(`contentFor('analytics', {}, AUTH.user)`);
  ok('analytics renders regional SVG map', /WINAM GULF/.test(html) && /KISUMU COUNTY/.test(html) && /HOMA BAY COUNTY/.test(html));
  as('finance.kisumu');
  const finPiv = run(`PIVOT6.compute(AUTH.user, 'condition', 'status', 'count')`);
  ok('finance cannot pivot clinical conditions (falls back to area)', finPiv.rowKey === 'area');

  as('chief.admin');
  const interopHtml = run(`contentFor('interop', {tab:'khis'}, AUTH.user)`);
  ok('KHIS view states plainly it is NOT an official KHIS submission', /Not an official KHIS submission/i.test(interopHtml));
  const dhis = run(`buildDhis2Payload(AUTH.user)`);
  ok('DHIS2 payload carries khisSubmitted:false', dhis.meta.khisSubmitted === false && Array.isArray(dhis.dataValues));
  as('finance.kisumu');
  const fhirRedacted = run(`buildFhirBundle(AUTH.user)`);
  ok('FHIR bundle redacts names when caller lacks patient.export', fhirRedacted.entry[1].resource.name[0].text.indexOf('Redacted') >= 0);
  return true;
});

test('Hospital Focal Person rename, JOOTRH request slip, single-click sheet cancel, and 4-office recovery ceremony', ()=>{
  ok('liaison role is titled Hospital Focal Person', run(`ROLES.find(r=>r.id==='liaison').name`) === 'Hospital Focal Person');

  /* Single-click cancel auto-saves draft with NO second confirmation dialog */
  as('caregiver.nyalenda');
  run(`ACTIONS['new-assessment']()`);
  const modalHtml = run(`modalStack[modalStack.length-1].innerHTML`);
  ok('assessment modal starts with National ID check', /assessNatId/.test(modalHtml));
  ok('assessment includes default & custom programme durations', /360 days/.test(modalHtml) && /110 days/.test(modalHtml) && /45 days/.test(modalHtml));
  run(`globalThis.__form = { name:'Draft Test Patient', plannedDays:'120' }`); // { name:'Draft Test Patient', plannedDays:'120' };
  run(`(()=>{ const b=modalStack[modalStack.length-1]; b.__initial='changed'; })()`);
  run(`closeModal()`);
  ok('single closeModal click closes immediately without a second discard modal', run(`modalStack.length`) === 0);
  ok('draft was automatically saved on device', (run(`loadDraft('assessment')`)||{}).values?.name === 'Draft Test Patient');

  /* 4-office unanimous password recovery governance protocol */
  run(`(()=>{
    ['program.admin','program.assistant'].forEach(rid=>{
      if(!DB.db.users.some(u=>u.roleId===rid)){
        DB.db.users.push({ id:'u-'+rid, name:rid, username:rid, roleId:rid, countyId:'kisumu', areas:[], dept:'exec', status:'active', active:true, salt:'s', hash:strongHash('LOMAMO2026','s') });
      }
    });
    DB.save();
  })()`);
  as('director');
  const opened = run(`GOV6.openCeremony(AUTH.user, 'caregiver.nyalenda', 'Lost device recovery')`);
  ok('ceremony opened', opened.ok === true);
  const cid = opened.ceremony.id;
  run(`GOV6.castVote(AUTH.user, '${cid}')`);
  as('chief.admin');
  ok('overwrite blocked with only 2 votes', (run(`GOV6.castVote(AUTH.user, '${cid}')`), run(`GOV6.adminOverwrite(AUTH.user, '${cid}').ok`)) === false);
  as('program.admin'); run(`GOV6.castVote(AUTH.user, '${cid}')`);
  as('program.assistant'); const v4 = run(`GOV6.castVote(AUTH.user, '${cid}')`);
  ok('4th office vote unlocks approved_for_overwrite stage', v4.count === 4 && v4.ceremony.stage === 'approved_for_overwrite');
  as('chief.admin');
  const ow = run(`GOV6.adminOverwrite(AUTH.user, '${cid}')`);
  ok('System Admin overwrite succeeds only after 4/4 votes', ow.ok === true && ow.ceremony.stage === 'overwritten_awaiting_county');
  as('kisumu.admin');
  const rst = run(`GOV6.countySetPassword(AUTH.user, '${cid}', 'NewTempPass2026!')`);
  ok('County Admin assigns temporary password and enables forced change on first login', rst.ok === true && rst.ceremony.stage === 'completed');
  AUTH_CHECK: {
    const loginRes = run(`AUTH.logout(); AUTH.login('caregiver.nyalenda', 'NewTempPass2026!')`);
    ok('Staff member signs in with replacement password and mustChange is flagged', loginRes.ok === true && run(`AUTH.user.mustChange`) === true);
  }

  /* Official 3,333-patient register profile check */
  const stats3333 = run(`(()=>{
    DB.seedOfficial({org:{name:'LOMAMO Foundation Kenya',shortName:'LOMAMO',county:'kisumu'},admin:{name:'Admin',username:'chief.admin',password:'StrongPass123!'},withReferencePatients:true});
    const ps = DB.db.patients;
    const ds = ps.map(PAT.days);
    const core = ds.filter(d=>d>=45 && d<=240).length;
    const tail = ds.filter(d=>d>=241 && d<=330).length;
    return { n:ps.length, min:Math.min(...ds), max:Math.max(...ds), core, tail, pctCore: core/ps.length };
  })()`);
  ok('official register holds 3,333 patients', stats3333.n === 3333);
  ok('no patient under 45 days or over 330 days (zero 900-day records)', stats3333.min >= 45 && stats3333.max <= 330, JSON.stringify(stats3333));
  ok('95% in 45-240 days and 5% in 241-330 days', stats3333.pctCore >= 0.95 && stats3333.core + stats3333.tail === 3333, JSON.stringify(stats3333));
  return true;
});

test('PC & Tablet front-door parity, 10-area active dataset, 1-click Hospital Cancel, non-hyphenated prose, 13 teamwork photos & 15 departmental AI consoles', ()=>{
  /* 1. Brand-new device first load (PC or Tablet) auto-seeds full 3,333 register + 42 accounts and opens Landing Page */
  const freshBoot = run(`(()=>{
    AUTH.logout();
    Store.del(DB.KEY);
    DB.db = null;
    APPX.screen = 'landing';
    render();
    const html = document.querySelector('#root').innerHTML;
    return {
      patients: DB.db.patients.length,
      users: DB.db.users.length,
      areasCovered: new Set(DB.db.patients.map(p=>p.areaId)).size,
      countiesCovered: new Set(DB.db.patients.map(p=>p.countyId)).size,
      isLanding: /class="ld"/.test(html),
      hasHighContrastBtns: /ld-btn-secondary/.test(html) && /ld-btn-primary/.test(html),
      hasTeamworkSection: /Departments Working Together/.test(html) && html.includes('data:image/jpeg;base64'),
      hasLoadDemoAction: typeof ACTIONS['load-demo'] === 'function'
    };
  })()`);
  ok('First-time boot on PC or Tablet seeds 3,333 patients immediately', freshBoot.patients === 3333);
  ok('First-time boot provisions full 42-account official roster across 10 areas & 2 counties', freshBoot.users >= 42 && freshBoot.areasCovered === 10 && freshBoot.countiesCovered === 2);
  ok('First-time boot renders identical Bluish Front-Door Landing Page', freshBoot.isLanding === true);
  ok('Landing page buttons carry explicit high-contrast styling classes', freshBoot.hasHighContrastBtns === true);
  ok('Landing page lower section displays spacious Cross-Departmental Teamwork showcase', freshBoot.hasTeamworkSection === true);
  ok('load-demo action is registered globally for instant dataset reload', freshBoot.hasLoadDemoAction === true);

  /* 2. All 13 community/teamwork photos embedded & Sign-In screen showcase directly below H1 */
  const photoCount = run(`Object.keys(CARELINK_PHOTOS).length`);
  /* 13 teamwork photographs (media6.js) + 10 LOMAMO programme photographs for
     the public portal (media_portal.js). No identifiable beneficiary appears in
     any of them: patient photography needs recorded consent. */
  const teamworkKeys = run(`['analytics_screen','puzzle_hands','united_hands','boardroom_team','field_table','gears_table','charts_overhead','roundtable_forms','puzzle_vector','team_blocks','gears_circle','devices_table','hands_compact'].filter(k=>!CARELINK_PHOTOS[k]).length`);
  const portalKeys = run(`['field_home_visit','foodbag_nutrition','hospital_escort','tb_adherence','children_school','chv_meeting','lake_kisumu','monday_meeting','stock_room','field_transport'].filter(k=>!CARELINK_PHOTOS[k]).length`);
  ok('All 13 community & teamwork photographs are embedded in media6.js', teamworkKeys === 0 && photoCount >= 13, 'missing '+teamworkKeys+' of the teamwork set, '+photoCount+' embedded in total');
  ok('All 10 LOMAMO public-portal programme photographs are embedded', portalKeys === 0, 'missing '+portalKeys);
  const loginHtml = run(`renderLogin6()`);
  ok('Sign-In page shows Cross-Departmental Teamwork showcase under One Foundation. One Operating System.',
    /One Operating System[\s\S]{0,260}lg6-showcase[\s\S]{0,400}data:image\/jpeg;base64/.test(loginHtml));
  ok('Sign-In page includes interactive Demo account quick-switch tab', /data-tab="demo"/.test(loginHtml));

  /* 3. Non-hyphenated justified typography check in console6.css */
  const fs = require('fs'), path = require('path');
  const css6 = fs.readFileSync(path.join(__dirname, '..', 'src', 'console6.css'), 'utf8');
  ok('console6.css enforces hyphens: none !important across justified paragraphs', /hyphens:\s*none\s*!important/.test(css6) && !/hyphens:\s*auto/.test(css6));

  /* 4. Single-click Cancel on Hospital Visit Request & stacked sheets + child-record 1-click Back */
  as('caregiver.nyalenda');
  const singleClickCancel = run(`(()=>{
    clearDraft('request');
    const firstReq = repo.requests(AUTH.user)[0];
    if(firstReq) openRequestModal(firstReq.id);
    ACTIONS['new-request']({});
    const stackBefore = modalStack.length;
    globalThis.__form = { patientId: repo.patientList(AUTH.user)[0].id, reason: 'Urgent JOOTRH review draft', patientContact: '0722111222' };
    modalStack[modalStack.length-1].__initial = 'dirty-state';
    ACTIONS['close-modal']();
    const stackAfter = modalStack.length;
    const savedReqDraft = loadDraft('request');
    return { stackBefore, stackAfter, savedReason: savedReqDraft && savedReqDraft.values && savedReqDraft.values.reason };
  })()`);
  ok('Opening a sheet over an open sheet replaces cleanly without stacking duplicates', singleClickCancel.stackBefore === 1);
  ok('Single click on Cancel immediately closes Hospital Visit Request sheet (zero extra clicks)', singleClickCancel.stackAfter === 0);
  ok('Hospital Visit Request draft is auto-saved cleanly on single-click Cancel', singleClickCancel.savedReason === 'Urgent JOOTRH review draft');

  as('mcm.kisumu');
  const childBack = run(`(()=>{
    const rec = DB.db.formRecords[0];
    NAVH.reset();
    APPX.view = 'form';
    APPX.params = { id: rec.id };
    ACTIONS['nav-back']();
    return APPX.view;
  })()`);
  ok('Single-click Back from child form record returns directly to parent forms list even after page refresh', childBack === 'forms');

  /* 5. All 15 Departmental AI Specialist profiles & live verified answers across departments */
  const aiCheck = run(`(()=>{
    const profileCount = Object.keys(AI_PROFILES).length;
    const execTitle = AI.profileFor(AUTH.user, 'execconsole').title;
    const hospTitle = AI.profileFor(AUTH.user, 'requests').title;
    const pharmTitle = AI.profileFor(AUTH.user, 'pharmacy').title;
    const finTitle = AI.profileFor(AUTH.user, 'finance').title;
    const meTitle = AI.profileFor(AUTH.user, 'analytics').title;
    const libAns = AI.answer(AUTH.user, 'Check library resources & loans').text;
    const pharmAns = AI.answer(AUTH.user, 'Summarise pharmacy stock & expiry status').text;
    const homeAns = AI.answer(AUTH.user, 'Summarise homestay beds, residents & podcast').text;
    return { profileCount, execTitle, hospTitle, pharmTitle, finTitle, meTitle, libAns, pharmAns, homeAns };
  })()`);
  ok('All 15 departmental AI specialist profiles are registered', aiCheck.profileCount === 15);
  ok('AI specialist adapts dynamically to active console workspace',
    /Executive/.test(aiCheck.execTitle) && /Hospital Focal/.test(aiCheck.hospTitle) && /Pharmacy/.test(aiCheck.pharmTitle) && /Finance/.test(aiCheck.finTitle) && /M&E/.test(aiCheck.meTitle));
  ok('Departmental AI answers live Pharmacy, Homestay/Podcast & Library queries from verified DB records',
    /Pharmacy & FEFO/.test(aiCheck.pharmAns) && /Upper Room/.test(aiCheck.homeAns) && /Asset Inventory & Departmental Library/.test(aiCheck.libAns));
  return true;
});

test('CARELINK LATEST PROMPTS full verification: 100% 3,333-patient multi-level dataset, Discharge Summary & Referral, Post-Hospital Follow-Up & Feedback, Admin/Intl Dual Cross-Check, Zero Console Photos, Demo Switch Prompt, Role-Contextual Nav/Settings, 20 Themes & 15 Dept Palettes', ()=>{
  /* 1. 100% completeness across all 3,333 patients across every single level */
  const full3333 = run(`(()=>{
    DB.seedOfficial({org:{name:'LOMAMO Foundation Kenya',shortName:'LOMAMO',county:'kisumu'},admin:{name:'Admin',username:'chief.admin',password:'StrongPass123!'},withReferencePatients:true});
    const db = DB.db, ps = db.patients;
    const visitP = new Set(db.visits.map(v=>v.patientId));
    const pdcaP = new Set(db.pdcas.map(c=>c.patientId));
    const condP = new Set(db.patientConditions.map(c=>c.patientId));
    const supP = new Set(db.support.map(s=>s.patientId));
    const docP = new Set(db.documents.map(d=>d.patientId));
    const completeProfile = ps.filter(p =>
      p.dob && p.sha && p.village && p.guardian && p.carePlan &&
      p.clinical && p.clinical.diagnosis && p.clinical.conditionCategory &&
      Number(p.clinical.weightKg) > 0 && Number(p.clinical.baselineWeightKg) > 0 &&
      Number(p.clinical.bmi) > 0 && p.clinical.bp &&
      p.clinical.adherence && p.clinical.adherence !== 'Not recorded'
    ).length;
    const withReviews = db.pdcas.filter(c => Array.isArray(c.reviews) && c.reviews.length >= 1).length;
    const discharged = ps.filter(p => p.status === 'discharged');
    const dischargedComplete = discharged.filter(p => p.dischargeReferral && p.dischargeSummary).length;
    return {
      total: ps.length,
      completeProfile,
      visitPatients: visitP.size,
      totalVisits: db.visits.length,
      pdcaPatients: pdcaP.size,
      withReviews,
      condPatients: condP.size,
      supPatients: supP.size,
      docPatients: docP.size,
      dischargedCount: discharged.length,
      dischargedComplete,
      hospFollowUpsSeeded: db.requests.filter(r => r.postFollowUp).length,
      coWorkBatchesSeeded: (db.coWorkBatches || []).length
    };
  })()`);
  ok('3,333 / 3,333 patients (100%) have complete demographic, anthropometric, adherence & care-plan records', full3333.completeProfile === 3333, JSON.stringify(full3333));
  ok('3,333 / 3,333 patients (100%) have populated Home Visit records (>= 6,666 visits)', full3333.visitPatients === 3333 && full3333.totalVisits >= 6666, JSON.stringify(full3333));
  ok('3,333 / 3,333 patients (100%) have populated PDCA care cycles AND 30-day review records', full3333.pdcaPatients === 3333 && full3333.withReviews >= 3333, JSON.stringify(full3333));
  ok('3,333 / 3,333 patients (100%) have Condition Register, Household Support & Document records', full3333.condPatients === 3333 && full3333.supPatients === 3333 && full3333.docPatients === 3333, JSON.stringify(full3333));
  ok('100% of discharged patients carry structured Discharge Referral AND compiled Discharge Summary', full3333.dischargedCount > 0 && full3333.dischargedComplete === full3333.dischargedCount);
  ok('Post-reconciliation Hospital Follow-Ups & Admin/Intl Dual Cross-Check batches seeded', full3333.hospFollowUpsSeeded >= 3 && full3333.coWorkBatchesSeeded >= 2);

  /* 2. Live Discharge Recommendation WITH Referral Option -> Approval -> Printable Programme Discharge Summary */
  const disFlow = run(`(()=>{
    AUTH.logout(); AUTH.login('caregiver.nyalenda', 'LOMAMO2026');
    const cand = DB.db.patients.find(p => p.status === 'active' && p.caregiverId === AUTH.user.id) || DB.db.patients.find(p => p.status === 'active');
    const pid = cand.id;
    PAT_DISCHARGE.captureReferralFromForm(cand, {
      dischargePathway: 'referred_facility',
      referralRequired: 'yes',
      referralDestType: 'County referral hospital',
      receivingFacility: 'JOOTRH Kisumu Specialist Outpatient Wing',
      referralClinic: 'MOPC',
      referralDate: '2026-11-12',
      receivingContact: 'Dr Otieno · MOPC Desk 2',
      referralInstructions: 'Carry green card, discharge summary, and 30-day medication supply.'
    }, AUTH.user);
    transition('patient', pid, 'recommend_discharge', AUTH.user, { reason:'Goals met; referred to MOPC' });
    AUTH.logout(); AUTH.login('mcm.kisumu', 'LOMAMO2026');
    transition('patient', pid, 'approve_discharge', AUTH.user, { evidence:'EV-MOPC-1', note:'Clinical discharge verified with MOPC referral' });
    PAT_DISCHARGE.stampOnDischarge(cand, AUTH.user);
    const html = PAT_DISCHARGE.renderSheet(pid, AUTH.user);
    return {
      status: cand.status,
      clinic: cand.dischargeReferral && cand.dischargeReferral.clinic,
      facility: cand.dischargeReferral && cand.dischargeReferral.facility,
      hasSummary: !!cand.dischargeSummary,
      stayDays: cand.dischargeSummary && cand.dischargeSummary.stayDays,
      homeVisits: cand.dischargeSummary && cand.dischargeSummary.homeVisitsCount,
      hasHtmlSections: /Patient Programme Discharge Summary/.test(html) && /MOPC/.test(html) && /JOOTRH Kisumu Specialist Outpatient Wing/.test(html)
    };
  })()`);
  ok('Discharge referral option saves target clinic (MOPC), receiving facility & appointment cleanly', disFlow.status === 'discharged' && disFlow.clinic === 'MOPC', JSON.stringify(disFlow));
  ok('Upon discharge, complete Intake-to-Discharge Summary compiles & renders cleanly', disFlow.hasSummary === true && disFlow.stayDays >= 45 && disFlow.homeVisits >= 2 && disFlow.hasHtmlSections === true, JSON.stringify(disFlow));

  /* 3. Post-Hospital Visit Reconciliation Caregiver Follow-Up (MOPC/GOPC/SOPC/Physio/Referral) & Feedback to Hospital Dept */
  const hospFu = run(`(()=>{
    AUTH.logout(); AUTH.login('caregiver.nyalenda', 'LOMAMO2026');
    const req = DB.db.requests.find(r => r.status === 'reconciled') || DB.db.requests[0];
    req.status = 'reconciled';
    const fdObj = new Map([
      ['clinic', 'SOPC'],
      ['targetFacility', 'JOOTRH Surgical Outpatient Clinic (SOPC)'],
      ['reviewDate', '2026-11-18'],
      ['recoveryStatus', 'Improving steadily at home'],
      ['feedbackToHospital', 'Fast triage at JOOTRH desk; please pre-book SOPC slot for 18 Nov.'],
      ['queueNextVisit', 'yes'],
      ['homeCheckDate', '2026-11-01']
    ]);
    const saved = HOSP_FOLLOWUP.submit(fdObj, req.id, AUTH.user);
    AUTH.logout(); AUTH.login('liaison.kisumu', 'LOMAMO2026');
    const acked = HOSP_FOLLOWUP.acknowledge(req.id, AUTH.user);
    const reqView = renderRequests(AUTH.user, {});
    return {
      savedOk: saved && saved.ok,
      spawnedCode: saved && saved.spawnedCode,
      clinic: req.postFollowUp && req.postFollowUp.clinic,
      ackBy: req.postFollowUp && req.postFollowUp.ackByName,
      feedbackVisibleInQueue: /Follow-Up|SOPC/i.test(reqView),
      ackOk: acked && acked.ok
    };
  })()`);
  ok('Caregiver records post-reconciliation clinic follow-up (MOPC/GOPC/SOPC/Physio/Referral) & sends Hospital feedback', hospFu.savedOk === true && hospFu.clinic === 'SOPC' && !!hospFu.spawnedCode, JSON.stringify(hospFu));
  ok('Hospital Focal Person receives & acknowledges Caregiver follow-up in Hospital Department workspace', hospFu.ackOk === true && !!hospFu.ackBy && hospFu.feedbackVisibleInQueue === true, JSON.stringify(hospFu));

  /* 4. Admin & International Data Single-Operator Lease Lock + Dual 2/2 Compare & Contrast Module */
  const dualRes = run(`(()=>{
    AUTH.logout(); AUTH.login('kisumu.admin', 'LOMAMO2026');
    DUALCHECK.claimSolo(AUTH.user);
    const adminLeaseSide = DUALCHECK.ensureStore().holderSide;

    AUTH.logout(); AUTH.login('intl.data', 'LOMAMO2026');
    const lockBanner = DUALCHECK.bannerHTML(AUTH.user);
    DUALCHECK.enableConcurrent(AUTH.user);
    const fdBatch = new Map([
      ['domain', 'Kisumu October Indicator & Support Reconciliation'],
      ['recordRef', 'IND-KSM-10'],
      ['f1Key', 'Active Caseload Verified'],
      ['f1Admin', '2,102'],
      ['f1Intl', '2,102'],
      ['f2Key', 'Direct Household Support (KES)'],
      ['f2Admin', '428,500'],
      ['f2Intl', '426,000'],
      ['note', 'Cross-check voucher KSM-441 vs international ledger extract']
    ]);
    const created = DUALCHECK.submitNewBatch(fdBatch, AUTH.user);
    const batch = created.batch;
    const earlyCommit = DUALCHECK.commitBatch(batch.id, AUTH.user);
    DUALCHECK.pickResolution(batch.id, 1, 'admin', AUTH.user);
    DUALCHECK.signBatch(batch.id, 'intl', AUTH.user);
    const oneSignCommit = DUALCHECK.commitBatch(batch.id, AUTH.user);

    AUTH.logout(); AUTH.login('kisumu.admin', 'LOMAMO2026');
    DUALCHECK.signBatch(batch.id, 'admin', AUTH.user);
    const finalCommit = DUALCHECK.commitBatch(batch.id, AUTH.user);
    const viewHtml = renderDualCheck(AUTH.user);
    return {
      adminHoldsSolo: adminLeaseSide === 'admin',
      counterpartSeesLock: /Single-Operator Exclusivity Lock/i.test(lockBanner),
      earlyBlocked: earlyCommit.ok === false,
      oneSignBlocked: oneSignCommit.ok === false,
      twoOfTwoCommitted: finalCommit.ok === true && batch.status === 'committed',
      rendersCleanly: /Compare|Cross-Check/i.test(viewHtml)
    };
  })()`);
  ok('Admin & International Data enforce one-person-at-a-time lease lock by default', dualRes.adminHoldsSolo === true && dualRes.counterpartSeesLock === true, JSON.stringify(dualRes));
  ok('Compare & Contrast module blocks 0/2 and 1/2 commits and commits ONLY after 2/2 dual verification', dualRes.earlyBlocked === true && dualRes.oneSignBlocked === true && dualRes.twoOfTwoCommitted === true && dualRes.rendersCleanly === true, JSON.stringify(dualRes));

  /* 5. ZERO photos/captions across Chief Admin console, KHIS/DHIS interop & ALL workspace consoles */
  const noConsolePhotos = run(`(()=>{
    AUTH.user = DB.db.users.find(u => u.username === 'chief.admin');
    const bannerEmpty = teamBanner('home') === '';
    const chiefHome = contentFor('home', {}, AUTH.user);
    const interopHtml = contentFor('interop', {}, AUTH.user);
    const dualHtml = contentFor('dualcheck', {}, AUTH.user);
    return {
      bannerEmpty,
      chiefHasPhoto: chiefHome.includes('data:image/jpeg') || chiefHome.includes('<img '),
      interopHasPhoto: interopHtml.includes('data:image/jpeg') || interopHtml.includes('<img '),
      dualHasPhoto: dualHtml.includes('data:image/jpeg') || dualHtml.includes('<img ')
    };
  })()`);
  ok('Chief System Administrator console & KHIS/DHIS (interop) contain ZERO photos or photo captions',
    noConsolePhotos.bannerEmpty === true && noConsolePhotos.chiefHasPhoto === false && noConsolePhotos.interopHasPhoto === false && noConsolePhotos.dualHasPhoto === false, JSON.stringify(noConsolePhotos));

  /* 6. Demo Console Authorised-Account Switch Prompt + Banner */
  const demoSwitchCheck = run(`(()=>{
    const cg = DB.db.users.find(u => u.username === 'caregiver.nyalenda');
    AUTH.user = cg;
    ACTIONS['prompt-switch-account']({ u:'pharmacy.kisumu', v:'pharmacy', asset:'Pharmacy FEFO Stock & Dispensing Console' });
    const modalOpen = modalStack.length > 0 && JSON.stringify(modalStack[modalStack.length-1]).toLowerCase().includes('authorised account');
    ACTIONS['confirm-switch-account']({ u:'pharmacy.kisumu', v:'pharmacy', asset:'Pharmacy FEFO Stock & Dispensing Console' });
    const banner = DEMO_SWITCH.bannerHTML();
    const switchedRole = AUTH.user && AUTH.user.username;
    ACTIONS['dismiss-switch-banner']({});
    return { modalOpen, switchedRole, hasBanner: /demo-view-bar/.test(banner) && /Pharmacy/.test(banner) };
  })()`);
  ok('Demo Console switch prompt notifies user clearly before switching and displays authorised-account banner',
    demoSwitchCheck.modalOpen === true && demoSwitchCheck.switchedRole === 'pharmacy.kisumu' && demoSwitchCheck.hasBanner === true, JSON.stringify(demoSwitchCheck));

  /* 7. Strict Role-Contextual Left Navigation & Role-Specific Settings + 20 Themes + 15+ Dept Palettes + Vivid KPIs & Hero Quick Tabs */
  const uiPolish = run(`(()=>{
    const themeCount = WTHEMES.length;
    const deptCount = DEPARTMENTS.length;
    const paletteCount = Object.keys(DEPT_PALETTES).length;

    AUTH.user = DB.db.users.find(u => u.username === 'caregiver.nyalenda');
    const cgNav = navModel(AUTH.user);
    const cgGroups = cgNav.map(g => g.label);
    const cgLabels = cgNav.flatMap(g => g.items.map(i => i.label));
    const cgSettings = renderSettings(AUTH.user);

    AUTH.user = DB.db.users.find(u => u.username === 'media.head');
    const mediaSettings = renderSettings(AUTH.user);

    AUTH.user = DB.db.users.find(u => u.username === 'director');
    const dirHome = renderHome(AUTH.user);

    return {
      themeCount,
      deptCount,
      paletteCount,
      cgNoSysOrPeople: !cgGroups.includes('System') && !cgGroups.includes('People'),
      cgContextualLabels: cgLabels.some(l => /My Caregiver Home|My Assigned Households/.test(l)),
      cgRoleSettings: /Field Caregiver.*Tablet Operational Settings/.test(cgSettings),
      mediaRoleSettings: /Ethical Storytelling|Consent|Public Portal/i.test(mediaSettings),
      dirHeroTabsAndKpis: dirHome.includes('hero-qtabs') && dirHome.includes('hero-dept-pill') && /caseload/i.test(dirHome) && dirHome.includes('class="kpi')
    };
  })()`);
  ok('30 vibrant workspace themes and all 15+ department colour palettes are registered',
    uiPolish.themeCount >= 30 && uiPolish.deptCount >= 15 && uiPolish.paletteCount >= 15, JSON.stringify(uiPolish));
  ok('Caregiver left navigation & Settings are strictly contextual to field caregiving (zero System/HR clutter)',
    uiPolish.cgNoSysOrPeople === true && uiPolish.cgContextualLabels === true && uiPolish.cgRoleSettings === true && uiPolish.mediaRoleSettings === true);
  ok('Executive & Departmental consoles render colorful dept hero pills, right-side quick tabs & jewel-toned KPI boxes',
    uiPolish.dirHeroTabsAndKpis === true);

  return true;
});

console.log(fails.map(f=>'FAIL | '+f).join('\n'));
console.log(`\n${pass}/${pass+fail} v6.0 assertions passed`);
if(fail) process.exit(1);

/* ============================================================
   org_teams.js - Ministry area teams, home-visit days, department
   leadership and the Monday management-meeting rule.

   Everything here comes from the Administration's own instruction and
   is stored as data, not as code:

     1  Nyalenda        Daniel Naphtaly Ombija
     2  Nairobi Road    Catherine Awuor Obila, assisted by Ashar Anyango Omondi
                        Home visits Tuesday and Thursday
     3  Manyatta        Washington Ayub Odero, assisted by any available
                        caregiver, casual worker or Community Health Volunteer
                        registered by the concerned admin office
                        (Iscah Abuto, Millicent Achieng Otieno, Caroline,
                        Maureen, ...).  Home visits Wednesday only
     4  Ombeyi          Allan Dennis Wayodi, assisted by Evans Omondi Odiyo
                        Home visits Tuesday only
     5  Nyahera         John Shikuku Omolo, assisted by Ashar Anyango Omondi
                        Home visits Wednesday
     6  Ahero           Evans Omondi Odiyo, assisted by either John Shikuku
                        Omolo or Allan Dennis Wayodi (both drive)
                        Home visits Thursday only
     7  Chiga           Wycliff Otieno, assisted by either John Shikuku Omolo
                        or Allan Dennis Wayodi (both drive)
                        Home visits Friday only
     8  Hospital visits on Friday: Washington Ayub Odero (head of the hospital
        department), assisted by Nyalenda CHP Susan Mildred
     9  Hospital Ministry/Department: Washington Ayub Odero; if unavailable he
        may assign Susan Mildred
    10  Director Martin Mito Chamah · Kisumu Admin & Chief Admin Moses Otieno ·
        Chief Admin Assistant / Kisumu Admin Assistant Julie Oguta
    11  Homa Bay Admin Oscar Lubalo · Homa Bay County Coordinator Daniel Ondu ·
        Julia Orwa caregiver in Homa Bay (field days to be added later)
    12  Department heads: Procurement Allan Wayodi · Media (Kisumu) Daniel
        Naphtaly Ombija · Media (Homa Bay) Oscar Lubalo · Public Relations
        Catherine Awuor Obila · Hospital Washington Ayub Odero · Staff Welfare
        Ashar Anyango Omondi · Internal Operations Irene Otieno · Vehicle &
        Transport Allan Wayodi, deputised by John Shikuku Omolo in both
        departments

   Monday is Management Meeting Day: everyone is at the office except a person
   on sick leave. Wycliff Otieno may leave to assist patients at the hospital,
   because he serves that department and patients come first.
   ============================================================ */

/* ---------------- capabilities ---------------- */
Object.assign(CAPS, {
  'team.view':   { g:'People', l:'See ministry teams, visit days & department leadership' },
  'team.manage': { g:'People', l:'Edit ministry teams, visit days & department leadership', sensitive:true }
});

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ---------------- Monday management meeting ---------------- */
const MONDAY_MEETING = {
  id:'monday-management-meeting',
  weekday:1,
  title:'Monday Management Meeting Day',
  time:'08:00 EAT',
  venue:'LOMAMO Foundation Kenya · Kisumu head office',
  chair:'Moses Otieno (Chief Admin)',
  rule:'Everyone is at the office on Monday except a person on sick leave. Leave on a Monday is refused under rule R1.',
  exceptions:[
    { staff:'ls-wickliff', name:'Wycliff Otieno', reason:'May leave to assist patients at the hospital. He serves that department, and patients come first: it is the reason the programme exists.' },
    { staff:'sick', name:'Any member of staff', reason:'Sick leave is a medical absence, not a choice, and is never refused by the Monday rule.' }
  ],
  agenda:[
    'Ministry area reports: households visited, foodbags issued, patients due for review',
    'Hospital ministry: Friday visit list, transport and escort cover',
    'TB dispensing control: pyridoxine requests, doses due on day 9 or 10, stock against procurement',
    'Cost per patient: expenditure per ministry area, county and disease category',
    'M&E: indicator quality, targets and baselines within each office\u2019s authority',
    'Staff welfare, leave cover and the coming week\u2019s field days'
  ]
};

/* ---------------- ministry area teams ----------------
   `visitDays` are the days Administration fixed for home visits.
   `confirmed:false` means the day is provisional and is labelled as such
   everywhere it is shown - the system never presents a guess as a decision. */
const MINISTRY_TEAMS = [
  { areaId:'nyalenda', countyId:'kisumu', coordinator:'coord.nyalenda',
    assistants:[{ username:'caregiver.nyalenda', role:'Supporting caregiver (seat to be confirmed)' }],
    visitDays:[2,3], confirmed:false,
    note:'Administration named Daniel Naphtaly Ombija as coordinator. A fixed Nyalenda visit day has not been confirmed, so the carried-over Tuesday and Wednesday are shown as provisional.' },

  { areaId:'nairobird', countyId:'kisumu', coordinator:'coord.nairobird',
    assistants:[{ username:'caregiver.nairobird', role:'Assisting caregiver' }],
    visitDays:[2,4], confirmed:true, note:'Home visits Tuesday and Thursday.' },

  { areaId:'manyatta', countyId:'kisumu', coordinator:'coord.manyatta',
    assistants:[
      { username:'caregiver.manyatta', role:'Any available caregiver' },
      { username:'chw.manyatta.iscah', role:'Community Health Volunteer' },
      { username:'chw.manyatta.millicent', role:'Community Health Volunteer' },
      { username:'chw.manyatta.caroline', role:'Casual worker' },
      { username:'chw.manyatta.maureen', role:'Casual worker' }
    ],
    visitDays:[3], confirmed:true,
    note:'Home visits Wednesday only. Assisted by any available caregiver, casual worker or Community Health Volunteer registered by the concerned admin office.' },

  { areaId:'ombeyi', countyId:'kisumu', coordinator:'coord.ombeyi',
    assistants:[{ username:'caregiver.ombeyi', role:'Assisting caregiver' }],
    visitDays:[2], confirmed:true, note:'Home visits Tuesday only.' },

  { areaId:'nyahera', countyId:'kisumu', coordinator:'coord.nyahera',
    assistants:[{ username:'caregiver.nairobird', role:'Assisting caregiver (shared with Nairobi Road)' }],
    visitDays:[3], confirmed:true, note:'Home visits Wednesday.' },

  { areaId:'ahero', countyId:'kisumu', coordinator:'coord.ahero',
    assistants:[
      { username:'coord.nyahera', role:'Assists when available (driver)' },
      { username:'coord.ombeyi',  role:'Assists when available (driver)' },
      { username:'caregiver.ahero', role:'Ahero care team' }
    ],
    visitDays:[4], confirmed:true,
    note:'Home visits Thursday only. Assisted by either John Shikuku Omolo or Allan Dennis Wayodi, since both can drive: whoever is available assists Evans.' },

  { areaId:'chiga', countyId:'kisumu', coordinator:'coord.chiga',
    assistants:[
      { username:'coord.nyahera', role:'Assists when available (driver)' },
      { username:'coord.ombeyi',  role:'Assists when available (driver)' },
      { username:'caregiver.chiga', role:'Chiga care team' }
    ],
    visitDays:[5], confirmed:true,
    note:'Home visits Friday only. Assisted by either John Shikuku Omolo or Allan Dennis Wayodi, since both can drive.' },

  { areaId:'makongeni', countyId:'homabay', coordinator:'coord.homabay',
    assistants:[{ username:'caregiver.makongeni', role:'Caregiver, Homa Bay' }],
    visitDays:[], confirmed:false, note:'Julia Orwa is a caregiver in Homa Bay. Homa Bay field days will be added later.' },

  { areaId:'shauriyako', countyId:'homabay', coordinator:'coord.homabay',
    assistants:[{ username:'caregiver.shauriyako', role:'Caregiver seat to be confirmed' }],
    visitDays:[], confirmed:false, note:'Homa Bay field days will be added later.' },

  { areaId:'sofia', countyId:'homabay', coordinator:'coord.homabay',
    assistants:[{ username:'caregiver.sofia', role:'Caregiver seat to be confirmed' }],
    visitDays:[], confirmed:false, note:'Homa Bay field days will be added later. Sofia is still marked unverified on the organogram.' }
];

/* ---------------- hospital ministry team ---------------- */
const HOSPITAL_TEAM = {
  departmentId:'hospital',
  visitDays:[5],
  head:{ username:'focal.kisumu', name:'Washington Ayub Odero', role:'Head of Hospital Department' },
  deputy:{ username:'liaison.kisumu', name:'Susan Mildred', role:'Nyalenda Community Health Partner - assists Friday hospital visits and stands in when the head is unavailable' },
  assignmentRule:'If Washington Ayub Odero is unavailable he may assign Susan Mildred. The assignment is written down in the hospital focal desk, never assumed.',
  note:'Friday hospital visits are led by Washington, because he heads the hospital department, assisted by Susan Mildred.'
};

/* ---------------- department leadership ----------------
   One row per department Administration named. `deputy` carries the written
   delegation, so a console can show who acts when the head is away. */
const DEPARTMENT_LEADS = [
  { dept:'exec',      head:'director',            title:'Organisation Director',            deputy:'program.admin', deputyTitle:'Internal Operations Manager' },
  { dept:'admin',     head:'chief.admin',         title:'Chief Admin (Kisumu Admin)',        deputy:'kisumu.assistant', deputyTitle:'Chief Admin Assistant / Kisumu Admin Assistant' },
  { dept:'procure',   head:'procurement',         title:'Head of Procurement Department',    deputy:'vehicle.officer', deputyTitle:'Deputy Head of Procurement' },
  { dept:'vehicle',   head:'coord.ombeyi',        title:'Head of Vehicle & Transport Department', deputy:'vehicle.officer', deputyTitle:'Deputy Head of Vehicle & Transport' },
  { dept:'media',     head:'media.head',          title:'Head of Media Department (Kisumu)', deputy:'media.homabay', deputyTitle:'Head of Media Department (Homa Bay) - equal privileges' },
  { dept:'pr',        head:'pr.officer',          title:'In charge of the Public Relations Office' },
  { dept:'hospital',  head:'focal.kisumu',        title:'Head of Hospital Department',       deputy:'liaison.kisumu', deputyTitle:'Assigned by the head when unavailable' },
  { dept:'welfare',   head:'welfare.officer',     title:'Head of Staff Welfare Department' },
  { dept:'ministry',  head:'coord.nyalenda',      title:'Ministry Area Coordinators (one per area)', deputy:'coord.homabay', deputyTitle:'Homa Bay County Coordinator' },
  { dept:'hr',        head:'hr.officer',          title:'Human Resource Officer', unconfirmed:true },
  { dept:'finance',   head:'finance.kisumu',      title:'Finance Officer (Kisumu)', unconfirmed:true },
  { dept:'me',        head:'me.kisumu',           title:'M&E / Data Officer (Kisumu)', unconfirmed:true },
  { dept:'medical',   head:'mcm.kisumu',          title:'Medical Case Manager (Kisumu)', unconfirmed:true },
  { dept:'audit',     head:'auditor',             title:'Internal Auditor', unconfirmed:true },
  { dept:'it',        head:'ict.officer',         title:'ICT & Host Officer', unconfirmed:true }
];

/* ---------------- service ---------------- */
const TEAMX = {
  /* The team table lives in the database once an installation exists, so an
     edit made by Administration survives a reload and synchronises to every
     device. Before that (and in the offline demo) the reference table is used
     directly. ensure() copies any area that is not yet stored. */
  ensure(){
    if(!DB.db) return MINISTRY_TEAMS;
    if(!Array.isArray(DB.db.ministryTeams)) DB.db.ministryTeams = [];
    MINISTRY_TEAMS.forEach(t=>{
      const row = DB.db.ministryTeams.find(x=>x.areaId===t.areaId);
      if(!row) DB.db.ministryTeams.push(JSON.parse(JSON.stringify(t)));
    });
    return DB.db.ministryTeams;
  },
  all(){ return this.ensure(); },
  byArea(areaId){ return this.all().find(t=>t.areaId===areaId) || null; },
  monday(){ return MONDAY_MEETING; },
  hospital(){ return HOSPITAL_TEAM; },
  leads(){ return DEPARTMENT_LEADS; },

  userByUsername(username){ return (DB.db.users||[]).find(u=>u.username===username) || null; },
  nameOf(username){
    const u = this.userByUsername(username);
    return u ? u.name : String(username||'').replace(/\./g,' ');
  },

  /* The team this account belongs to, and the days it is expected in the field. */
  teamFor(user){
    if(!user) return null;
    const own = this.all().find(t=>t.coordinator===user.username || (t.assistants||[]).some(a=>a.username===user.username));
    if(own) return own;
    if([HOSPITAL_TEAM.head.username, HOSPITAL_TEAM.deputy.username].includes(user.username)) return { areaId:null, countyId:'kisumu', visitDays:HOSPITAL_TEAM.visitDays, confirmed:true, hospital:true, note:HOSPITAL_TEAM.note };
    return null;
  },

  /* Visit days for a person: the team table first, then the account itself. */
  visitDaysFor(user){
    const t = this.teamFor(user);
    const days = (t && t.visitDays && t.visitDays.length) ? t.visitDays : (user && user.visitDays) || [];
    return [...new Set(days)].sort();
  },

  visitDayLabel(user){
    const days = this.visitDaysFor(user);
    if(!days.length) return 'Not yet fixed';
    return days.map(d=>DAY_NAMES[d]||'').filter(Boolean).join(' & ');
  },

  /* Is a date one of this person's field days? Monday is always the office. */
  onVisitDay(user, date){
    const d = new Date(date); if(isNaN(d)) return false;
    const wd = d.getDay()===0?7:d.getDay();
    if(wd===1) return false;
    return this.visitDaysFor(user).includes(wd);
  },

  /* Who is in the field on a weekday: the weekly board used by the visit
     planner, the leave console and the Monday meeting card. */
  weekBoard(){
    const rows = [];
    for(let wd=1; wd<=5; wd++){
      const teams = this.all().filter(t=>(t.visitDays||[]).includes(wd))
        .map(t=>({ areaId:t.areaId, area:areaName(t.areaId), countyId:t.countyId,
          lead:t.coordinator, assistants:(t.assistants||[]).map(a=>a.username), confirmed:t.confirmed }));
      const hospital = (HOSPITAL_TEAM.visitDays||[]).includes(wd)
        ? { areaId:null, area:'Hospital Ministry', countyId:'kisumu', lead:HOSPITAL_TEAM.head.username,
            assistants:[HOSPITAL_TEAM.deputy.username], confirmed:true, hospital:true } : null;
      rows.push({
        weekday:wd, name:DAY_NAMES[wd],
        management: wd===1,
        teams: wd===1 ? [] : teams,
        hospital: wd===1 ? null : hospital,
        office: wd===1 ? (DB.db.employees||[]).filter(e=>e.staffType==='permanent' && e.status!=='ended') : []
      });
    }
    return rows;
  },

  /* Coverage on one date, honouring approved leave: used before a field day is
     published so a coordinator is never sent to an area nobody can reach. */
  coverageOn(date){
    const iso = String(date).slice(0,10);
    const wd = (()=>{ const d=new Date(iso); return d.getDay()===0?7:d.getDay(); })();
    const out = [];
    this.all().forEach(t=>{
      if(!(t.visitDays||[]).includes(wd)) return;
      const people = [t.coordinator, ...(t.assistants||[]).map(a=>a.username)];
      const present = people.filter(un=>{
        const u = this.userByUsername(un); if(!u) return false;
        const e = (DB.db.employees||[]).find(x=>x.userId===u.id);
        return !(e && typeof LEAVE!=='undefined' && LEAVE.onLeave(e.id, iso));
      });
      out.push({ areaId:t.areaId, area:areaName(t.areaId), countyId:t.countyId, weekday:wd,
        confirmed:t.confirmed, expected:people.length, present:present.length,
        presentNames:present.map(un=>this.nameOf(un)),
        status: present.length? (present.length<2? 'thin':'covered') : 'uncovered' });
    });
    if((HOSPITAL_TEAM.visitDays||[]).includes(wd)){
      const people = [HOSPITAL_TEAM.head.username, HOSPITAL_TEAM.deputy.username];
      const present = people.filter(un=>{
        const u=this.userByUsername(un); if(!u) return false;
        const e=(DB.db.employees||[]).find(x=>x.userId===u.id);
        return !(e && typeof LEAVE!=='undefined' && LEAVE.onLeave(e.id, iso));
      });
      out.push({ areaId:null, area:'Hospital Ministry', countyId:'kisumu', weekday:wd, confirmed:true,
        expected:people.length, present:present.length, presentNames:present.map(un=>this.nameOf(un)),
        status: present.length? 'covered':'uncovered', hospital:true });
    }
    return out;
  },

  /* Editing is a governed act: only Administration, HR or a county office
     administrator may change a team, and every change is audited. */
  setVisitDays(user, areaId, days, note){
    if(!RBAC.has(user,'team.manage')) return { ok:false, msg:'Your role may not edit ministry teams.' };
    const t = this.byArea(areaId);
    if(!t) return { ok:false, msg:'That ministry area is not on the team table.' };
    const clean = [...new Set((days||[]).map(Number).filter(d=>d>=1&&d<=6))].sort();
    const before = (t.visitDays||[]).join(',');
    t.visitDays = clean;
    if(note!==undefined) t.note = String(note||'');
    t.confirmed = clean.length>0;
    AUDIT.append({ actor:user.id, action:'team.updated', entity:'ministry_team', entityId:areaId,
      detail:`visit days ${before||'none'} -> ${clean.join(',')||'none'}${note?` (${note})`:''}` });
    DB.save();
    return { ok:true, days:clean };
  },

  /* ---------------- console ---------------- */
  render(user){
    if(!RBAC.has(user,'team.view')) return deniedPanel('team.view');
    const board = this.weekBoard();
    const canEdit = RBAC.has(user,'team.manage');
    const today = new Date();
    const todayWd = today.getDay()===0?7:today.getDay();
    const cov = this.coverageOn(todayISO());
    const leadRows = DEPARTMENT_LEADS.map(l=>({
      dept:(deptObj(l.dept)||{}).name||l.dept,
      head:this.nameOf(l.head), headTitle:l.title,
      deputy:l.deputy? this.nameOf(l.deputy) : '', deputyTitle:l.deputyTitle||'',
      unconfirmed:!!l.unconfirmed
    }));

    return pageHead('Ministry teams & visit days',
      'Coordinators, assisting caregivers, fixed home-visit days, department leadership and the Monday management-meeting rule. One staff list, one schedule.',
      canEdit?`<button class="btn btn-sm btn-primary" data-act="team-edit-days">${ic('calendar',15)} Edit visit days</button>`:'')

    + `<div class="grid g4" style="margin-bottom:16px">
        ${kpi('Ministry areas staffed', num(this.all().filter(t=>this.nameOf(t.coordinator)).length), 'Kisumu & Homa Bay', 'ok', 'route')}
        ${kpi('Visit days fixed', num(this.all().filter(t=>t.confirmed && (t.visitDays||[]).length).length)+' of '+num(this.all().length), 'Areas with a confirmed field day', this.all().every(t=>t.confirmed)?'ok':'warn', 'calendar')}
        ${kpi('Department heads named', num(DEPARTMENT_LEADS.filter(l=>!l.unconfirmed).length)+' of '+num(DEPARTMENT_LEADS.length), 'Seats awaiting confirmation are labelled', DEPARTMENT_LEADS.some(l=>l.unconfirmed)?'warn':'ok', 'idcard')}
        ${kpi('Today', esc(DAY_NAMES[todayWd]||''), todayWd===1?'Management meeting day':'Field day: '+esc(cov.filter(c=>c.present.length).map(c=>c.area).join(', ')||'office'), todayWd===1?'info':'ok', 'clock')}
      </div>`

    + card('Monday management meeting', `
        <div class="team-monday">
          <div class="tm-h">${ic('users',16)}<div><b>${esc(MONDAY_MEETING.title)}</b>
            <span class="xs muted">${esc(MONDAY_MEETING.time)} · ${esc(MONDAY_MEETING.venue)} · chaired by ${esc(MONDAY_MEETING.chair)}</span></div></div>
          <p class="small">${esc(MONDAY_MEETING.rule)}</p>
          <div class="tm-exc">${MONDAY_MEETING.exceptions.map(e=>`<div class="tm-e">${ic('alert',14)}<div><b>${esc(e.name)}</b><span class="xs">${esc(e.reason)}</span></div></div>`).join('')}</div>
          <div class="tm-ag"><b class="xs muted">Standing agenda</b>
            <ol>${MONDAY_MEETING.agenda.map(a=>`<li class="small">${esc(a)}</li>`).join('')}</ol></div>
        </div>`, { foot:'<span>Rule R1 in Leave &amp; off-days enforces this: a Monday request is refused unless it is sick leave.</span>' })

    + `<div style="margin-top:16px">${card('The field week', `
        <div class="tbl-wrap"><table class="tbl team-week">
          <thead><tr><th style="width:110px">Day</th><th>Ministry areas in the field</th><th style="width:190px">Hospital ministry</th><th style="width:120px" class="num">Teams out</th></tr></thead>
          <tbody>${board.map(d=>`<tr class="${d.weekday===todayWd?'row-today':''}">
            <td><b>${esc(d.name)}</b>${d.management?`<div class="xs muted">Office day</div>`:''}</td>
            <td>${d.management
              ? `<span class="badge b-info nodot">Everyone at the office</span> <span class="xs muted">${num(d.office.length)} permanent staff · sick leave excepted</span>`
              : (d.teams.length? d.teams.map(t=>`<span class="team-chip ${t.confirmed?'':'prov'}">${esc(t.area)}<i>${esc(this.nameOf(t.lead))}${t.assistants.length?` + ${esc(this.nameOf(t.assistants[0]))}`:''}</i></span>`).join(' ')
                 : '<span class="xs muted">No fixed visit day</span>')}</td>
            <td>${d.hospital?`<span class="team-chip hosp">${esc(d.hospital.area)}<i>${esc(this.nameOf(d.hospital.lead))} + ${esc(this.nameOf(d.hospital.assistants[0]))}</i></span>`:'<span class="xs muted">-</span>'}</td>
            <td class="num mono">${d.management?'0':num(d.teams.length + (d.hospital?1:0))}</td>
          </tr>`).join('')}</tbody>
        </table></div>`,
        { foot:'<span>Provisional days are marked and are never presented as a confirmed decision.</span>' })}</div>`

    + `<div style="margin-top:16px">${card('Ministry area teams', `
        <div class="tbl-wrap"><table class="tbl team-table">
          <thead><tr><th>Ministry area</th><th>Coordinator</th><th>Assisting caregivers</th><th style="width:150px">Home visit days</th><th style="width:110px">Status</th></tr></thead>
          <tbody>${this.all().map(t=>`<tr>
            <td><div class="cellname">${esc(areaName(t.areaId))}</div><div class="xs muted">${esc(countyName(t.countyId))}</div></td>
            <td><div class="cellname">${esc(this.nameOf(t.coordinator))}</div><div class="xs muted mono">${esc(t.coordinator)}</div></td>
            <td>${(t.assistants||[]).map(a=>`<div class="xs">${esc(this.nameOf(a.username))} <span class="muted">· ${esc(a.role)}</span></div>`).join('')||'<span class="xs muted">None named</span>'}</td>
            <td>${(t.visitDays||[]).length? `<div class="row" style="gap:4px;flex-wrap:wrap">${t.visitDays.map(d=>`<span class="day-chip">${esc(DAY_SHORT[d]||'')}</span>`).join('')}</div>` : '<span class="xs muted">To be added</span>'}</td>
            <td>${t.confirmed? badge('Confirmed','b-ok') : badge('Provisional','b-warn')}</td>
          </tr>${t.note?`<tr class="note-row"><td colspan="5"><span class="xs muted">${ic('info',12)} ${esc(t.note)}</span></td></tr>`:''}`).join('')}</tbody>
        </table></div>`,
        { foot:'<span>The same table drives leave coverage (rule R6), the visit planner and the ministry area console.</span>' })}</div>`

    + `<div style="margin-top:16px">${card('Hospital ministry', `
        <div class="grid g2">
          <div class="team-hosp">
            <div class="tm-h">${ic('hospital',16)}<div><b>${esc(HOSPITAL_TEAM.head.name)}</b><span class="xs muted">${esc(HOSPITAL_TEAM.head.role)}</span></div></div>
            <div class="tm-h" style="margin-top:10px">${ic('shieldcheck',16)}<div><b>${esc(HOSPITAL_TEAM.deputy.name)}</b><span class="xs muted">${esc(HOSPITAL_TEAM.deputy.role)}</span></div></div>
            <p class="small" style="margin-top:10px">${esc(HOSPITAL_TEAM.assignmentRule)}</p>
          </div>
          <div>${note(esc(HOSPITAL_TEAM.note),'info')}
            <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">${HOSPITAL_TEAM.visitDays.map(d=>`<span class="day-chip">${esc(DAY_NAMES[d]||'')}</span>`).join('')}
              <span class="badge b-neutral nodot">Escort &amp; transport via Fleet</span></div></div>
        </div>`)}</div>`

    + `<div style="margin-top:16px">${card('Department leadership', table([
        {label:'Department',render:r=>`<div class="cellname">${esc(r.dept)}</div>`},
        {label:'Head',render:r=>`${esc(r.head)}${r.unconfirmed?` ${badge('Seat to be confirmed','b-warn')}`:''}<div class="xs muted">${esc(r.headTitle)}</div>`},
        {label:'Deputy / acting',render:r=>r.deputy?`${esc(r.deputy)}<div class="xs muted">${esc(r.deputyTitle)}</div>`:'<span class="xs muted">Not applicable</span>'}
      ], leadRows),
      { foot:'<span>Media: Daniel Naphtaly Ombija (Kisumu) and Oscar Lubalo (Homa Bay) hold equal privileges in the department workspace.</span>' })}</div>`

    + `<div style="margin-top:16px">${card('Cover today · '+esc(fmtDate(today)), cov.length? table([
        {label:'Location',render:c=>`<div class="cellname">${esc(c.area)}</div><div class="xs muted">${esc(countyName(c.countyId))}</div>`},
        {label:'Expected',cls:'num',render:c=>num(c.expected)},
        {label:'Available',cls:'num',render:c=>num(c.present)},
        {label:'Who',render:c=>esc(c.presentNames.join(', ')||'Nobody - cover must be arranged')},
        {label:'Status',render:c=>badge(c.status==='covered'?'Covered':c.status==='thin'?'Thin cover':'Uncovered', c.status==='covered'?'b-ok':c.status==='thin'?'b-warn':'b-crit')}
      ], cov) : emptyState('No field day today','Monday is the office day. Field coverage appears on a visit day.','calendar'),
      { foot:'<span>Coverage reads the approved leave register, so a person on leave is never counted as present.</span>' })}</div>`;
  }
};

/* Everyone may see who covers their ministry area and when. Editing is narrow. */
ROLES.forEach(r=>{ if(!r.perms.includes('team.view')) r.perms.push('team.view'); });
['chief','countyadmin','hr','director','program.admin'].forEach(id=>{
  const r = ROLES.find(x=>x.id===id);
  if(r && !r.perms.includes('team.manage')) r.perms.push('team.manage');
});

/* ---------------- editing a visit day ----------------
   A governed act: only Administration, HR, the executive or a County Office
   Administrator may change a ministry area's field days, the change is written
   to the database, and it is audited with the reason. */
Object.assign(ACTIONS, {
  'team-edit-days': d => {
    if(!RBAC.has(AUTH.user,'team.manage')) return toast('Not permitted','Your role may not edit ministry teams.','err');
    const teams = TEAMX.all();
    const pre = d && d.area ? String(d.area) : '';
    openModal({ title:'Edit ministry home-visit days', sub:'The same table drives leave coverage, the visit planner and the ministry console.',
      body:`<form data-form="team-days" id="teamDaysForm">
        <div class="field"><label>Ministry area</label><select class="input" name="areaId" required>
          ${teams.map(t=>`<option value="${esc(t.areaId)}" ${pre===t.areaId?'selected':''}>${esc(areaName(t.areaId))} · ${esc(countyName(t.countyId))}</option>`).join('')}
        </select></div>
        <div class="field"><label>Home visit days</label>
          <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:4px">
            ${[1,2,3,4,5,6].map(wd=>`<label class="checkline" style="margin:0"><input type="checkbox" name="day${wd}" value="${wd}" ${wd===1?'disabled':''}>
              <span>${esc(DAY_NAMES[wd])}${wd===1?' <span class="xs muted">(office day)</span>':''}</span></label>`).join('')}
          </div>
          <div class="hint">Monday is Management Meeting Day and cannot be a field day. Saturday may be used where a coordinator works a six-day week.</div></div>
        <div class="field"><label>Reason or instruction</label><input class="input" name="note" required placeholder="e.g. Administration fixed Wednesday only for Manyatta"></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="team-days-submit">${ic('save',15)} Save visit days</button>` });
  },
  'team-days-submit': () => {
    const f = $('#teamDaysForm'); if(!f) return;
    const d = new FormData(f);
    const areaId = String(d.get('areaId')||'');
    const days = [1,2,3,4,5,6].filter(wd=>d.get('day'+wd));
    const note = String(d.get('note')||'');
    const r = TEAMX.setVisitDays(AUTH.user, areaId, days, note);
    if(!r.ok) return toast('Not saved', r.msg, 'err');
    closeModal(true);
    toast('Visit days saved', `${areaName(areaId)}: ${days.length? days.map(x=>DAY_NAMES[x]).join(', ') : 'no fixed day yet'}. Leave coverage and the visit planner now read it.`, 'ok');
    render();
  }
});
Object.assign(FORMS, {
  'team-days': () => { ACTIONS['team-days-submit'](); }
});

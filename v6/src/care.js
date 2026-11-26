/* ============================================================
   care.js - Clinical classification, care planning and the
   care centre domain layer.

   Three principles run through this file:
   1. A condition is recorded, never inferred. Every row names the
      person who recorded it and whether it is confirmed.
   2. Sensitive classifications (HIV, TB, co-infection, cancer,
      cryptococcal meningitis) are withheld from any role without
      condition.sensitive, including from aggregate tables that
      could re-identify a small group.
   3. A care plan belongs to the patient, not to a reporting period.
      Reviews keep their original due date even when completed late.
   ============================================================ */

const CONDITION_DEFS = [
  { key:'hiv',          label:'HIV',                       cls:'Infectious',        sensitive:true  },
  { key:'tb',           label:'Tuberculosis',              cls:'Infectious',        sensitive:true  },
  { key:'hiv_tb',       label:'HIV and TB co-infection',   cls:'Infectious',        sensitive:true  },
  { key:'cancer',       label:'Cancer (documented type)',  cls:'Non-communicable',  sensitive:true  },
  { key:'wound',        label:'Wound care',                cls:'Surgical',          sensitive:false },
  { key:'crypto',       label:'Cryptococcal meningitis',   cls:'Infectious',        sensitive:true  },
  { key:'diarrhoea',    label:'Diarrhoeal illness',         cls:'Infectious',        sensitive:false },
  { key:'other',        label:'Other recorded condition',   cls:'Other',              sensitive:false },
  { key:'malaria',      label:'Malaria',                   cls:'Infectious',        sensitive:false },
  { key:'pneumonia',    label:'Pneumonia',                 cls:'Respiratory',       sensitive:false },
  { key:'malnutrition', label:'Malnutrition',              cls:'Nutrition',         sensitive:false },
  { key:'anaemia',      label:'Anaemia',                   cls:'Haematology',       sensitive:false },
  { key:'hypertension', label:'Hypertension',              cls:'Non-communicable',  sensitive:false },
  { key:'diabetes',     label:'Diabetes mellitus',         cls:'Non-communicable',  sensitive:false }
];

const CONDITION_STATUS = {
  suspected:'Suspected', document:'Documented', documented:'Documented', confirmed:'Confirmed',
  historical:'Historical', resolved:'Resolved', follow_up:'Requires follow-up'
};

const COND = {
  def(key){ return CONDITION_DEFS.find(c=>c.key===key) || null; },

  isSensitive(row){ return !!(row.sensitive || this.def(row.key)?.sensitive); },

  /* All conditions for one patient, filtered to what this role may see. */
  list(user, patientId){
    const p = repo.patient(user, patientId);
    if(!p) return { rows:[], withheld:0, allowed:false };
    if(!RBAC.can(user,'condition.view',{countyId:p.countyId,areaId:p.areaId},true).ok){
      AUDIT.deny(user,'condition.view',{patientId},'no clinical condition capability');
      return { rows:[], withheld:0, allowed:false };
    }
    const all = (DB.db.patientConditions||[]).filter(c=>c.patientId===patientId);
    const maySeeSensitive = RBAC.has(user,'condition.sensitive');
    const rows = all.filter(c=>!this.isSensitive(c) || maySeeSensitive);
    return { rows, withheld: all.length - rows.length, allowed:true, maySeeSensitive };
  },

  record(user, { patientId, key, status='suspected', note='', details={} }){
    const p = repo.patient(user, patientId);
    if(!p) return { ok:false, msg:'Patient not found in your scope.' };
    if(!RBAC.can(user,'condition.record',{countyId:p.countyId,areaId:p.areaId}).ok)
      return { ok:false, msg:'Your role may not record clinical conditions.' };
    const def = this.def(key);
    if(!def) return { ok:false, msg:'Choose a defined condition.' };
    /* A diagnosis is not something a non-clinical role can assert. */
    if(['confirmed','documented'].includes(status) && !RBAC.has(user,'condition.confirm'))
      return { ok:false, msg:'Only a clinician may confirm or document a diagnosis. Record it as suspected and refer for review.' };
    if(!['suspected','documented','confirmed','historical','resolved','follow_up'].includes(status)) return { ok:false, msg:'Choose a valid condition status.' };
    const safeDetails={};
    if(def.key==='tb' || def.key==='hiv_tb'){
      if(RBAC.has(user,'condition.sensitive')){
        const subtype=String(details.tbType||'').trim();
        if(subtype && !['Pulmonary TB','Extra-pulmonary TB'].includes(subtype)) return {ok:false,msg:'Choose a supported TB subtype.'};
        const started=String(details.treatmentStartedAt||'').slice(0,10), expected=String(details.expectedCompletionAt||'').slice(0,10);
        const validDate=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const dt=new Date(s+'T00:00:00Z'); return !isNaN(dt)&&dt.toISOString().slice(0,10)===s;};
        if(started && !validDate(started)) return {ok:false,msg:'Treatment start must be a valid date.'};
        if(expected && !validDate(expected)) return {ok:false,msg:'Expected completion must be a valid date.'};
        if(started && started>todayISO().slice(0,10)) return {ok:false,msg:'Treatment start cannot be in the future.'};
        if(started && expected && expected < started) return {ok:false,msg:'Expected completion cannot be before treatment starts.'};
        Object.assign(safeDetails,{tbType:subtype,treatmentStartedAt:started,expectedCompletionAt:expected,
          treatmentHistory:String(details.treatmentHistory||'').trim().slice(0,600)});
      }
    }
    if(def.key==='cancer' && RBAC.has(user,'condition.sensitive')) safeDetails.cancerType=String(details.cancerType||'').trim().slice(0,100);
    if(def.key==='anaemia' && RBAC.has(user,'condition.confirm')){
      const severity=String(details.severity||'');
      if(severity && !['Severe','Moderate','Mild','Normal','Healthy'].includes(severity)) return {ok:false,msg:'Choose a valid anaemia classification.'};
      safeDetails.severity=severity;
    }

    const row = {
      id:'pc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),
      patientId, key, label:def.label, cls:def.cls, status,
      sensitive:def.sensitive, recordedBy:user.id, recordedAt:new Date().toISOString(),
      confirmedBy:['confirmed','documented'].includes(status)?user.id:null,
      confirmedAt:['confirmed','documented'].includes(status)?new Date().toISOString():null,
      note:String(note||'').slice(0,500), details:safeDetails, demo:false
    };
    DB.db.patientConditions.push(row);
    AUDIT.append({actor:user.id, action:'condition.recorded', entity:'patient', entityId:patientId,
      detail:`${def.label} · ${CONDITION_STATUS[status]||status}${row.sensitive?' · sensitive':''}`,
      sensitive:row.sensitive});
    DB.save();
    return { ok:true, row };
  },

  confirm(user, conditionId){
    const row = (DB.db.patientConditions||[]).find(c=>c.id===conditionId);
    if(!row) return { ok:false, msg:'Condition not found.' };
    const p = repo.patient(user, row.patientId);
    if(!p) return { ok:false, msg:'Patient outside your scope.' };
    if(!RBAC.can(user,'condition.confirm',{countyId:p.countyId,areaId:p.areaId}).ok)
      return { ok:false, msg:'Only an authorised clinician may confirm a diagnosis.' };
    if(row.confirmedBy) return { ok:false, msg:'Already confirmed by a clinician.' };
    row.status='confirmed'; row.confirmedBy=user.id; row.confirmedAt=new Date().toISOString();
    AUDIT.append({actor:user.id, action:'condition.confirmed', entity:'patient', entityId:row.patientId,
      detail:`${row.label} confirmed`, sensitive:row.sensitive});
    DB.save();
    return { ok:true, row };
  },

  /* Aggregate counts with small-cell suppression. Returns rows plus a
     plain statement of what was withheld. */
  aggregate(user, opts={}){
    if(!RBAC.has(user,'condition.aggregate') && !RBAC.has(user,'condition.sensitive'))
      return { allowed:false, rows:[], suppressed:0, reason:'This role does not hold condition reporting authority.' };
    const role = roleObj(user.roleId)||{scope:{}};
    let patients = (DB.db.patients||[]).filter(p=>RBAC.patientVisible(user,p));
    if(opts.countyId && opts.countyId!=='all') patients = patients.filter(p=>p.countyId===opts.countyId);
    const ids = new Set(patients.map(p=>p.id));
    const maySeeSensitive = RBAC.has(user,'condition.sensitive');
    const counts = new Map();
    (DB.db.patientConditions||[]).forEach(c=>{
      if(!ids.has(c.patientId)) return;
      if(this.isSensitive(c) && !maySeeSensitive) return;
      const detail=c.details||{};
      const variant=(c.key==='tb'||c.key==='hiv_tb')?(detail.tbType||'TB subtype not recorded')
        :(c.key==='anaemia'?(detail.severity||detail.anaemiaSeverity||'Severity not recorded')
        :(c.key==='cancer'?(detail.cancerType||c.label):''));
      const label=variant?(c.key==='anaemia'?`Anaemia · ${variant}`:variant):c.label;
      const k = `${c.key}|${variant}`;
      if(!counts.has(k)) counts.set(k, { key:c.key, label, sensitive:this.isSensitive(c), ids:new Set() });
      counts.get(k).ids.add(c.patientId);
    });
    let suppressed = 0;
    const rows = [...counts.values()].map(r=>{
      const row={key:r.key,label:r.label,sensitive:r.sensitive,n:r.ids.size};
      if(row.n>0 && row.n<5){ suppressed++; return {...row,n:null,band:'Fewer than 5'}; }
      return row;
    }).sort((a,b)=>(b.n||0)-(a.n||0));
    return { allowed:true, rows, suppressed, maySeeSensitive,
      total: patients.length,
      note: suppressed? `${suppressed} categor${suppressed===1?'y':'ies'} held fewer than five patients and are shown as a band, not a number.` : '' };
  }
};

/* ------------------------------------------------------------------
   Care plans and the 30-day review cycle
   ------------------------------------------------------------------ */
const PDCAX = {
  plan(p){ return p?.carePlan || null; },

  daysInProgramme(p, now=new Date()) { return CARE_RULES.days(p,now.toISOString()); },

  // Fixed programme-day milestones, scoped to this support cycle. Legacy
  // reviews remain history but cannot count as new MCM-reviewed completions.
  schedule(p){
    if(!CARE_RULES.supported(p)||!CARE_RULES.cycleStart(p))return [];
    const start=CARE_RULES.cycleStart(p),now=Date.now();
    const done=(DB.db.careReviews||[]).filter(r=>r.patientId===p.id&&r.cycleId===CARE_RULES.cycleId(p));
    return CARE_RULES.REVIEW_DAYS.map(day=>{
      const due=new Date(CARE_RULES.addDays(start,day)+'T00:00:00Z'),rec=done.find(r=>r.dueDay===day);
      const approved=rec&&['reviewed','scheduled','authorized','shared','archived'].includes(rec.status);
      const completed=approved?new Date(rec.evaluatedAt):null;
      return {day,due,completed,status:completed?'completed':rec?'in_progress':due.getTime()<now?'overdue':'upcoming',
        workflowStatus:rec?.status||'',recordId:rec?.id||null,slipDays:completed?Math.round((completed-due)/86400000):null};
    });
  },

  summary(p){
    const s = this.schedule(p);
    return {
      total:s.length,
      completed:s.filter(x=>x.status==='completed').length,
      overdue:s.filter(x=>x.status==='overdue').length,
      upcoming:s.filter(x=>x.status==='upcoming').length,
      nextDue:s.find(x=>x.status!=='completed')?.due || null,
      adherence: s.some(x=>x.due<=new Date())? Math.min(100,Math.round(100*s.filter(x=>x.status==='completed'&&x.due<=new Date()).length/s.filter(x=>x.due<=new Date()).length)) : null
    };
  },

  /* Reviews due across the patients this user may see. */
  due(user, opts={}){
    const days = opts.days ?? 14;
    const out = [];
    repo.patientList(user, {status:'active'}).forEach(p=>{
      this.schedule(p).forEach(r=>{
        const delta = Math.round((r.due - Date.now())/86400000);
        if(r.status==='overdue' || (r.status==='upcoming' && delta<=days))
          out.push({ patient:p, review:r, days:delta });
      });
    });
    return out.sort((a,b)=>a.days-b.days);
  },

  /* Completing a review preserves the due date and records the actual date. */
  complete(){return {ok:false,msg:'A note alone does not complete a PDCA. Use the editable template and county MCM review workflow.'};},

  extensionRequired(p){
    if(!p||p.status==='discharged')return false;
    const max=DB.db?.settings?.programme?.maxDays||180;
    return this.daysInProgramme(p)>max && !(DB.db.careReviews||[]).some(r=>r.patientId===p.id&&r.cycleId===CARE_RULES.cycleId(p)&&
      ['reviewed','scheduled','authorized','shared','archived'].includes(r.status)&&Date.parse(r.evaluatedAt)>Date.now()-90*86400000);
  },
  recordExtension(){return {ok:false,msg:'Record the continued-care justification in a full on-demand PDCA and submit it for MCM review.'};},

  /* Only the assigned caregiver/case manager pair can see a cycle thread. */
  discussionAccess(user, rec){
    if(!user || !rec || rec.kind==='review' || rec.kind==='extension') return false;
    const p=repo.patient(user,rec.patientId);
    if(!p || !RBAC.patientVisible(user,p)) return false;
    const assignedCaregiver = user.roleId==='caregiver' && (user.id===p.caregiverId || user.id===rec.owner);
    const reviewedMcm = user.id===rec.reviewedBy && user.roleId==='mcm';
    return assignedCaregiver || reviewedMcm;
  },

  canReviewDiscussion(user, rec){
    if(!user || user.roleId!=='mcm' || !RBAC.has(user,'pdca.review')) return false;
    const p=repo.patient(user,rec?.patientId);
    if(!p || !RBAC.patientVisible(user,p)) return false;
    const owner= userById(rec.owner);
    return !!owner && owner.roleId==='caregiver' && !rec.reviewedAt;
  },

  discussion(user, pdcaId){
    const rec=(DB.db.pdcas||[]).find(x=>x.id===pdcaId);
    if(!rec || !rec.reviewedAt || !this.discussionAccess(user,rec)) return {allowed:false, rows:[]};
    return {allowed:true, rows:(DB.db.pdcaDiscussions||[]).filter(m=>m.pdcaId===pdcaId)
      .sort((a,b)=>String(a.at).localeCompare(String(b.at)))};
  },

  reviewAndComment(user, pdcaId, text){
    const rec=(DB.db.pdcas||[]).find(x=>x.id===pdcaId);
    if(!rec || !this.canReviewDiscussion(user,rec)) return {ok:false,msg:'Only the scoped Medical Case Manager may review a caregiver-owned PDCA.'};
    const body=String(text||'').trim();
    if(body.length<8 || body.length>1200) return {ok:false,msg:'Write a review comment of 8–1,200 characters.'};
    rec.reviewedBy=user.id; rec.reviewedAt=todayISO(); rec.reviewComment=body;
    const message={id:uid('pdm'),pdcaId,patientId:rec.patientId,senderId:user.id,at:rec.reviewedAt,text:body,kind:'mcm_review'};
    DB.db.pdcaDiscussions=DB.db.pdcaDiscussions||[]; DB.db.pdcaDiscussions.push(message);
    AUDIT.append({actor:user.id,action:'pdca.discussion.reviewed',entity:'pdca',entityId:rec.id,
      detail:'Medical Case Manager reviewed the caregiver PDCA and opened a formal correction thread.'});
    const p=repo.patient(user,rec.patientId);
    if(p?.caregiverId) notify(p.caregiverId,'PDCA reviewed; response requested','Your Medical Case Manager reviewed a PDCA. Open the scoped patient record to read and respond to the correction thread.','info','pdca:'+rec.id);
    DB.save(); return {ok:true,rec,message};
  },

  replyDiscussion(user, pdcaId, text){
    const rec=(DB.db.pdcas||[]).find(x=>x.id===pdcaId);
    if(!rec || !rec.reviewedAt || !this.discussionAccess(user,rec)) return {ok:false,msg:'This PDCA discussion is not available to your account.'};
    const body=String(text||'').trim();
    if(body.length<2 || body.length>1200) return {ok:false,msg:'Write a message of 2–1,200 characters.'};
    const message={id:uid('pdm'),pdcaId,patientId:rec.patientId,senderId:user.id,at:todayISO(),text:body,kind:'reply'};
    DB.db.pdcaDiscussions=DB.db.pdcaDiscussions||[]; DB.db.pdcaDiscussions.push(message);
    AUDIT.append({actor:user.id,action:'pdca.discussion.reply',entity:'pdca',entityId:rec.id,
      detail:'Formal PDCA correction/follow-up message recorded; content is held in the scoped discussion thread.'});
    const p=repo.patient(user,rec.patientId); const otherId=user.id===rec.reviewedBy?p?.caregiverId:rec.reviewedBy;
    if(otherId) notify(otherId,'PDCA discussion updated','A new message was added to your scoped PDCA correction thread. Open CareLink to review it.','info','pdca:'+rec.id);
    DB.save(); return {ok:true,message};
  }
};

/* ------------------------------------------------------------------
   Care centre (homestay) domain layer
   ------------------------------------------------------------------ */
const CARE = {
  beds(user){
    if(!RBAC.has(user,'care.view')) return [];
    return DB.db.careBeds||[];
  },

  residents(user){
    if(!RBAC.has(user,'care.view')) return [];
    return (DB.db.careResidents||[])
      .map(r=>({ ...r, patient: repo.patient(user, r.patientId) }))
      .filter(r=>!!r.patient);
  },

  occupancy(user){
    const beds = this.beds(user), res = this.residents(user);
    const occupied = beds.filter(b=>b.status==='occupied').length;
    return { beds:beds.length, occupied, available:beds.length-occupied,
      rate: beds.length? Math.round(100*occupied/beds.length):0 };
  },

  resident(user, id){
    if(!RBAC.has(user,'care.view')) return null;
    const r = (DB.db.careResidents||[]).find(x=>x.id===id);
    if(!r) return null;
    const p = repo.patient(user, r.patientId);
    return p ? { ...r, patient:p } : null;
  },

  logs(user, residentId=null){
    if(!RBAC.has(user,'care.view')) return [];
    const allowed = new Set(this.residents(user).map(r=>r.id));
    return (DB.db.careLogs||[])
      .filter(l=>allowed.has(l.residentId) && (!residentId || l.residentId===residentId))
      .sort((a,b)=>new Date(b.at)-new Date(a.at));
  },

  incidents(user){
    if(!RBAC.has(user,'care.incident')){
      if(RBAC.has(user,'care.view')) AUDIT.deny(user,'care.incident',{},'incident register withheld');
      return [];
    }
    const allowed = new Set(this.residents(user).map(r=>r.id));
    return (DB.db.careIncidents||[]).filter(i=>allowed.has(i.residentId))
      .sort((a,b)=>new Date(b.at)-new Date(a.at));
  },

  addLog(user, { residentId, shift, eaten, fluids, hygiene, mood, note }){
    const r = this.resident(user, residentId);
    if(!r) return { ok:false, msg:'Resident not found in your scope.' };
    if(!RBAC.can(user,'care.log',{},false).ok && !RBAC.has(user,'care.log'))
      return { ok:false, msg:'Your role may not record daily care.' };
    const entry = { id:'cl-'+Date.now().toString(36), residentId, bedId:r.bedId, shift,
      at:new Date().toISOString(), by:user.id, eaten, fluids, hygiene, mood,
      note:String(note||'').slice(0,600), demo:false };
    DB.db.careLogs.push(entry);
    AUDIT.append({actor:user.id, action:'care.log.recorded', entity:'careResident', entityId:residentId,
      detail:`${shift} shift · eaten ${eaten} · mood ${mood}`});
    DB.save();
    return { ok:true, entry };
  },

  addIncident(user, { residentId, type, severity, actions }){
    const r = this.resident(user, residentId);
    if(!r) return { ok:false, msg:'Resident not found in your scope.' };
    if(!RBAC.has(user,'care.incident'))
      return { ok:false, msg:'Only roles with safeguarding authority may record an incident.' };
    if(!type || !actions || actions.trim().length<10)
      return { ok:false, msg:'An incident needs a type and a description of the action taken.' };
    const inc = { id:'ci-'+Date.now().toString(36), residentId, bedId:r.bedId, type,
      severity, at:new Date().toISOString(), reportedBy:user.id, status:'open',
      actions:actions.trim().slice(0,800), restricted:true, demo:false };
    DB.db.careIncidents.push(inc);
    AUDIT.append({actor:user.id, action:'care.incident.reported', entity:'careResident', entityId:residentId,
      detail:`${type} · ${severity}`});
    DB.save();
    return { ok:true, inc };
  },

  closeIncident(user, id, resolution){
    const inc = (DB.db.careIncidents||[]).find(x=>x.id===id);
    if(!inc) return { ok:false, msg:'Incident not found.' };
    if(!RBAC.has(user,'care.manage') && !RBAC.has(user,'care.incident'))
      return { ok:false, msg:'Your role may not close a safeguarding incident.' };
    if(!resolution || resolution.trim().length<10)
      return { ok:false, msg:'Record what was done before closing the incident.' };
    inc.status='closed'; inc.closedBy=user.id; inc.closedAt=new Date().toISOString();
    inc.resolution=resolution.trim().slice(0,800);
    AUDIT.append({actor:user.id, action:'care.incident.closed', entity:'careResident', entityId:inc.residentId,
      detail:`${inc.type} closed`});
    DB.save();
    return { ok:true, inc };
  }
};

/* ------------------------------------------------------------------
   Delegation
   ------------------------------------------------------------------ */
const DELEGATION = {
  issue(user, { delegateId, caps, from, to, reason }){
    if(!RBAC.has(user,'delegation.manage'))
      return { ok:false, msg:'Your role may not issue a delegation.' };
    const delegate = DB.db.users.find(u=>u.id===delegateId);
    if(!delegate) return { ok:false, msg:'Choose a member of staff.' };
    if(delegate.id===user.id) return { ok:false, msg:'You cannot delegate to yourself.' };
    if(!Array.isArray(caps) || !caps.length) return { ok:false, msg:'Choose at least one responsibility.' };
    const mine = RBAC.expandedPerms(user.roleId);
    const excess = caps.filter(c=>!CAPS[c] || !mine.includes(c));
    if(excess.length) return { ok:false, msg:'You can only delegate responsibilities you hold yourself. Not held: '+excess.join(', ') };
    const start = new Date(from), end = new Date(to);
    if(isNaN(start) || isNaN(end) || end<=start) return { ok:false, msg:'The end of the delegation must be after the start.' };
    if(end - start > 120*86400000) return { ok:false, msg:'A delegation may not run longer than 120 days. Issue a new one if it is still needed.' };
    /* A county-scoped delegator cannot create a cross-county delegate. */
    const role = roleObj(user.roleId)||{scope:{}};
    if((role.scope?.geo==='county') && delegate.countyId!==user.countyId)
      return { ok:false, msg:'A county delegation must stay within your county.' };
    const d = { id:'dlg-'+Date.now().toString(36), fromId:user.id, fromName:user.name,
      delegateId, caps:[...new Set(caps)], from:start.toISOString(), to:end.toISOString(),
      status:'active', reason:String(reason||'').slice(0,300), issuedBy:user.id,
      issuedAt:new Date().toISOString(), fromRoleId:user.roleId, capsAtIssue:[...new Set(caps)], demo:false };
    DB.db.delegations.push(d);
    AUDIT.append({actor:user.id, action:'delegation.issued', entity:'user', entityId:delegateId,
      detail:`${caps.length} responsibilities delegated until ${end.toISOString().slice(0,10)}`});
    DB.save();
    return { ok:true, d };
  },

  revoke(user, id, note=''){
    const d = (DB.db.delegations||[]).find(x=>x.id===id);
    if(!d) return { ok:false, msg:'Delegation not found.' };
    if(d.issuedBy!==user.id && !RBAC.has(user,'delegation.manage'))
      return { ok:false, msg:'Only the delegating officer may revoke this.' };
    d.status='revoked'; d.revokedAt=new Date().toISOString(); d.revokedBy=user.id; d.revokeNote=note;
    AUDIT.append({actor:user.id, action:'delegation.revoked', entity:'user', entityId:d.delegateId,
      detail:'Delegation revoked'});
    DB.save();
    return { ok:true, d };
  },

  forUser(user){ return (DB.db.delegations||[]).filter(d=>d.delegateId===user.id); },
  issuedBy(user){ return (DB.db.delegations||[]).filter(d=>d.issuedBy===user.id); },

  /* Expired delegations are closed lazily, so a stale grant can never act. */
  sweep(){
    let n=0;
    (DB.db.delegations||[]).forEach(d=>{
      if(d.status==='active' && new Date(d.to).getTime() < Date.now()){ d.status='expired'; n++; }
    });
    return n;
  }
};

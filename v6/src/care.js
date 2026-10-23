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
  { key:'diarrhoea',    label:'Diarrhoeal illness',        cls:'Infectious',        sensitive:false },
  { key:'malaria',      label:'Malaria',                   cls:'Infectious',        sensitive:false },
  { key:'pneumonia',    label:'Pneumonia',                 cls:'Respiratory',       sensitive:false },
  { key:'malnutrition', label:'Malnutrition',              cls:'Nutrition',         sensitive:false },
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

  record(user, { patientId, key, status='suspected', note='' }){
    const p = repo.patient(user, patientId);
    if(!p) return { ok:false, msg:'Patient not found in your scope.' };
    if(!RBAC.can(user,'condition.record',{countyId:p.countyId,areaId:p.areaId}).ok)
      return { ok:false, msg:'Your role may not record clinical conditions.' };
    const def = this.def(key);
    if(!def) return { ok:false, msg:'Choose a defined condition.' };
    /* A diagnosis is not something a non-clinical role can assert. */
    if(['confirmed','documented'].includes(status) && !RBAC.has(user,'condition.confirm'))
      return { ok:false, msg:'Only a clinician may confirm or document a diagnosis. Record it as suspected and refer for review.' };
    if(status==='suspected' && !['suspected'].includes(status)) return { ok:false, msg:'Invalid status.' };

    const row = {
      id:'pc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),
      patientId, key, label:def.label, cls:def.cls, status,
      sensitive:def.sensitive, recordedBy:user.id, recordedAt:new Date().toISOString(),
      confirmedBy:['confirmed','documented'].includes(status)?user.id:null,
      confirmedAt:['confirmed','documented'].includes(status)?new Date().toISOString():null,
      note:String(note||'').slice(0,500), demo:false
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
      const k = c.key;
      if(!counts.has(k)) counts.set(k, { key:k, label:c.label, sensitive:this.isSensitive(c), n:0 });
      counts.get(k).n++;
    });
    let suppressed = 0;
    const rows = [...counts.values()].map(r=>{
      if(r.n>0 && r.n<5){ suppressed++; return {...r, n:null, band:'Fewer than 5'}; }
      return r;
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

  daysInProgramme(p, now=new Date()){
    if(!p?.intake) return 0;
    const end = p.discharge ? new Date(p.discharge) : now;
    return Math.max(0, Math.floor((end - new Date(p.intake))/86400000));
  },

  /* Twelve scheduled reviews from the programme start date. A review
     keeps the date it was due, whether it was completed early, late or not at all. */
  schedule(p){
    const cadence = DB.db?.settings?.programme?.reviewCadence || 30;
    const max = DB.db?.settings?.programme?.maxReviews || 12;
    if(!p?.intake) return [];
    const start = new Date(p.intake).getTime();
    const done = (DB.db.pdcas||[]).filter(x=>x.patientId===p.id && x.kind==='review');
    const today = Date.now();
    return Array.from({length:max},(_,i)=>{
      const day = (i+1)*cadence;
      const due = new Date(start + day*86400000);
      const rec = done.find(x=>x.dueDay===day) || done.find(x=>x.dueDay==null && Math.abs(new Date(x.due)-due)<3*86400000);
      const completed = rec && rec.completedAt ? new Date(rec.completedAt) : null;
      let status = 'upcoming';
      if(completed) status='completed';
      else if(due.getTime() < today) status='overdue';
      return { day, due, status, completed, recordId:rec?.id||null,
        slipDays: completed? Math.round((completed - due)/86400000) : null };
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
      adherence: s.length? Math.round(100*s.filter(x=>x.status==='completed').length/s.filter(x=>x.due<=new Date()).length) : null
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
  complete(user, patientId, dueDay, note=''){
    const p = repo.patient(user, patientId);
    if(!p) return { ok:false, msg:'Patient outside your scope.' };
    if(!RBAC.can(user,'pdca.create',{countyId:p.countyId,areaId:p.areaId},true).ok &&
       !RBAC.can(user,'pdca.review',{countyId:p.countyId,areaId:p.areaId},true).ok)
      return { ok:false, msg:'Your role may not complete a care-plan review.' };
    const slot = this.schedule(p).find(r=>r.day===Number(dueDay));
    if(!slot) return { ok:false, msg:'That review is not on the schedule.' };
    if(slot.status==='completed') return { ok:false, msg:'That review is already recorded.' };
    /* One record per scheduled review. A late completion fills in the
       existing slot rather than creating a second one. */
    let rec = (DB.db.pdcas||[]).find(x=>x.patientId===patientId && x.kind==='review' && x.dueDay===Number(dueDay));
    if(rec){
      rec.completedAt = new Date().toISOString();
      rec.reviewedBy = user.id; rec.status='closed'; rec.note = String(note||'').slice(0,600);
      rec.overdue = false;
    } else {
      rec = {
        id:'rv-'+p.id+'-'+dueDay, patientId, kind:'review', dueDay:Number(dueDay),
        stage:'Check', plan:'Scheduled 30-day care plan review', due:slot.due.toISOString(),
        completedAt:new Date().toISOString(), owner:user.id, reviewedBy:user.id,
        note:String(note||'').slice(0,600), status:'closed', demo:false
      };
      DB.db.pdcas.push(rec);
    }
    AUDIT.append({actor:user.id, action:'pdca.review.completed', entity:'patient', entityId:patientId,
      detail:`Review at day ${dueDay} completed${slot.slipDays>0?` (${slot.slipDays} days after the due date)`:''}`});
    DB.save();
    return { ok:true, rec };
  },

  /* Extended cases: beyond the approved programme maximum a documented
     review is required before the care episode can be closed. */
  extensionRequired(p){
    const max = DB.db?.settings?.programme?.maxDays || 180;
    if(!p || p.status==='discharged') return false;
    const openExtension = (DB.db.pdcas||[]).some(x=>x.patientId===p.id && x.kind==='extension' && x.status!=='closed');
    const latest = (DB.db.pdcas||[]).filter(x=>x.patientId===p.id && x.kind==='extension')
      .sort((a,b)=>new Date(b.due)-new Date(a.due))[0];
    const reviewedRecently = latest && latest.completedAt &&
      (Date.now() - new Date(latest.completedAt).getTime()) < 90*86400000;
    return this.daysInProgramme(p) > max && !reviewedRecently;
  },

  recordExtension(user, patientId, note){
    const p = repo.patient(user, patientId);
    if(!p) return { ok:false, msg:'Patient outside your scope.' };
    if(!RBAC.can(user,'pdca.review',{countyId:p.countyId,areaId:p.areaId},true).ok && !RBAC.has(user,'pdca.create'))
      return { ok:false, msg:'Your role may not record an extension review.' };
    if(!note || note.trim().length < 20)
      return { ok:false, msg:'An extension review needs a documented justification of at least 20 characters.' };
    const rec = { id:'ext-'+patientId+'-'+Date.now().toString(36), patientId, kind:'extension',
      stage:'Act', plan:'Extension review beyond the approved programme maximum',
      due:new Date().toISOString(), completedAt:new Date().toISOString(), owner:user.id,
      reviewedBy:user.id, note:note.trim().slice(0,800), status:'closed', demo:false };
    DB.db.pdcas.push(rec);
    AUDIT.append({actor:user.id, action:'pdca.extension.reviewed', entity:'patient', entityId:patientId,
      detail:'Extended case reviewed; justification recorded'});
    DB.save();
    return { ok:true, rec };
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

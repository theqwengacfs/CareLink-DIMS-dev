/* Shared clinical calendar and template rules. No patient data or inferred
   clinical findings live here. Also loaded by the API (v6 is CommonJS). */
const CARE_RULES = (()=>{
  const REVIEW_DAYS = Object.freeze([30,60,90,120,150,180,210,240,270,300,330,360]);
  const date = value => {
    const s=String(value||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d=new Date(s+'T00:00:00.000Z');
    return !isNaN(d) && d.toISOString().slice(0,10)===s?s:'';
  };
  // The programme calendar is Kenyan civil time (Africa/Nairobi, UTC+03).
  // Bare dates are already civil dates. Instants retain their absolute time
  // but are classified by the Kenyan calendar day, including near midnight.
  const programDate = value => {
    const raw=value instanceof Date?(Number.isFinite(value.getTime())?value.toISOString():''):String(value||'');
    if(!raw.includes('T'))return date(raw);
    if(!date(raw)||!/(Z|[+-]\d{2}:\d{2})$/.test(raw))return '';
    const n=Date.parse(raw);return Number.isFinite(n)?new Date(n+3*3600000).toISOString().slice(0,10):'';
  };
  const addDays = (value,n) => { const s=date(value); return s?new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10):''; };
  const anniversary = value => {
    const s=date(value); if(!s) return '';
    const [y,m,d]=s.split('-').map(Number);
    const last=new Date(Date.UTC(y+1,m,0)).getUTCDate();
    return `${y+1}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
  };
  const cycleId = p => p?.careCycleId || `legacy:${p?.id||''}:${programDate(p?.cycleStartedAt||p?.enrolledAt||p?.enrolDate||p?.intake)||'undated'}`;
  const cycleStart = p => programDate(p?.cycleStartedAt||p?.enrolledAt||p?.enrolDate||p?.intake);
  const days = (p,at=new Date().toISOString()) => {
    const start=cycleStart(p), asOf=programDate(at), discharged=p?.status==='discharged'?programDate(p.dischargedAt||p.discharge):'';
    const end=discharged&&asOf&&discharged<asOf?discharged:asOf;
    return start&&end?Math.max(0,Math.floor((Date.parse(end)-Date.parse(start))/86400000)):0;
  };
  const lastDischarge = (p,db={}) => [programDate(p?.dischargedAt||p?.discharge),
    ...(db.careCycles||[]).filter(c=>c.patientId===p?.id).map(c=>programDate(c.dischargedAt))].filter(Boolean).sort().pop()||'';
  const supported = p => !!(p && (['active','extension','discharge_recommended','discharged'].includes(p.status) || p.enrolledAt || p.enrolDate || p.careCycleId || p.discharge || p.dischargedAt));
  const classify = (p,referralDate=new Date().toISOString(),db={}) => {
    const referred=programDate(referralDate), discharged=lastDischarge(p,db);
    if(!p) return {kind:'new',label:'New / fresh assessment',tone:'ok',lastDischarge:'',anniversary:''};
    if(!supported(p) && !discharged) return {kind:'new',label:'New / fresh — assessment not yet enrolled',tone:'info',lastDischarge:'',anniversary:''};
    if(!discharged) return {kind:'history_review',label:'Prior support — discharge date needs review',tone:'warn',lastDischarge:'',anniversary:''};
    const limit=anniversary(discharged);
    if(!referred || referred<discharged) return {kind:'history_review',label:'Check referral / discharge dates',tone:'warn',lastDischarge:discharged,anniversary:limit};
    const repeat=referred<=limit; // The whole 12-month anniversary date is inclusive; leap day clamps to 28 February.
    return {kind:repeat?'repeat':'returning',label:repeat?'Repeat — within 12 months':'Returning — after 12 months',tone:repeat?'crit':'info',lastDischarge:discharged,anniversary:limit};
  };
  const recordCycle = (record,p,db={}) => {
    if(record.cycleId) return record.cycleId;
    const when=programDate(record.evaluatedAt||record.date||record.visitDate||record.completedAt||record.uploadedAt||record.createdAt||record.due);
    const cycles=(db.careCycles||[]).filter(c=>c.patientId===p.id && when && programDate(c.startedAt)<=when && (!c.dischargedAt||when<=programDate(c.dischargedAt))).sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)));
    return cycles[0]?.id || (!when || when>=cycleStart(p)?cycleId(p):'unassigned-history');
  };
  const openReviewCount=(p,db={})=>(db.pdcas||[]).filter(r=>r.patientId===p.id&&r.status==='open'&&recordCycle(r,p,db)===cycleId(p)).length+
    (db.careReviews||[]).filter(r=>r.patientId===p.id&&r.cycleId===cycleId(p)&&['draft','submitted','corrections_requested','correcting','resubmitted','authorized'].includes(r.status)).length;
  // A past foundation-supported admission still counts, including in a prior
  // support cycle. Only MCM-confirmed provenance is authoritative, not an
  // ordinary inpatient form or a client-editable hospitalization checkbox.
  const supportedAdmission = (p,db={}) => (db.programAdmissions||[]).some(a=>a.patientId===p.id &&
    a.foundationSupported===true && a.confirmedBy && a.confirmedAt && date(a.admittedAt));
  const reportDays = (p,rec,db={},now=new Date().toISOString()) => Math.max(days(p,now),days(p,rec?.evaluatedAt||now),Number(rec?.dueDay)||0,Number(rec?.programmeDay)||0,Number(rec?.policyDays)||0);
  const mcmPrepares = (p,rec,db={},now) => reportDays(p,rec,db,now)>=120 && supportedAdmission(p,db);
  /* Every text box corresponds to a field in the supplied three-page report.
     A blank stays blank. 'Not assessed' or 'not applicable' must be entered by
     the author, not manufactured by a report generator. */
  const SECTIONS = Object.freeze([
    {title:'Patient & caregiver data',fields:[
      ['patientName','Patient name'],['caregiverName','Caregiver full name'],['ministryArea','Ministry area'],
      ['intakeDate','Intake date','date'],['age','Age at evaluation','number'],['children','Children / household dependants','textarea'],
      ['maritalStatus','Marital status'],['education','Education'],['occupation','Occupation'],
      ['assessmentDate','Assessment date','date'],['heightCm','Height / length (cm)','number'],
      ['intakeWeightKg','Weight at intake (kg)','number'],['currentWeightKg','Current weight (kg)','number'],
      ['intakeBmi','BMI at intake','number'],['currentBmi','Current BMI','number']
    ]},
    {title:'SMART aim',fields:[['aimDate','Target date','date',true],['aimOutcome','Measurable health outcome','textarea',true],['aimFunction','Functional / family goal','textarea',true]]},
    {title:'Diagnosis & major symptoms',fields:[['diagnoses','Recorded diagnoses','textarea',true],['symptoms','Chief complaints / major symptoms WITH durations','textarea',true]]},
    {title:'PLAN — challenges',fields:[['plan','Challenges / problems to address','textarea',true]]},
    {title:'DO — actions',fields:[['actions','Actions, monitoring & additional support','textarea',true]]},
    {title:'Treatment & interventions',fields:[['treatment','Treatment / interventions AND indications','textarea',true],['procedures','Procedures & clinic reviews','textarea'],['educationCounselling','Education / counselling','textarea']]},
    {title:'CHECK — progress',fields:[['resolvedSymptoms','Resolved / resolving symptoms','textarea',true],['newComplaints','New complaints / side effects AND management','textarea',true],['adherence','Medication adherence & appointments','textarea',true],['anthropometry','Weight / BMI changes — interpretation','textarea'],['actionStatus','Status of the DO actions','textarea',true]]},
    {title:'ACT — next steps',fields:[['nextSteps','Next steps AND durations','textarea',true]]},
    {title:'Justification & discharge',fields:[['clinicalReasons','Continued-care clinical reasons','textarea',true],['labsStatus','Laboratory findings / current clinical status','textarea',true],['recoveryNeeds','Recovery / monitoring needs','textarea',true],['externalDelays','External treatment delays','textarea',true],['estimatedDischargeDate','Estimated discharge date','date',true]]}
  ]);
  const FIELDS=SECTIONS.flatMap(s=>s.fields);
  const cleanFields = input => Object.fromEntries(FIELDS.map(([k])=>[k,String(input?.[k]??'').trim()]));
  const EXTENSION_FIELDS=Object.freeze(['clinicalReasons','labsStatus','recoveryNeeds','externalDelays']);
  // Default to the stricter extended policy when the caller has not supplied
  // an authoritative programme day. Stored older fields are never discarded.
  const validateFields = (fields,{draft=false,policyDays=120}={}) => {
    for(const [key,label,type,required] of FIELDS){
      const v=fields[key];
      if(v?.length>4000)return `${label} exceeds 4,000 characters. Keep the original form open, shorten this field or record a separate evaluation; nothing has been saved or silently truncated.`;
      if(draft)continue;
      if(required && !(Number(policyDays)<120 && EXTENSION_FIELDS.includes(key)) && !v) return `${label} is required; record not assessed / not applicable explicitly where appropriate.`;
      if(v && type==='date' && date(v)!==v) return `${label} needs a valid calendar date.`;
      if(v && type==='number' && (!Number.isFinite(Number(v)) || Number(v)<0)) return `${label} needs a non-negative number.`;
    }
    return '';
  };
  return {REVIEW_DAYS,SECTIONS,FIELDS,EXTENSION_FIELDS,date,programDate,addDays,anniversary,cycleId,cycleStart,days,lastDischarge,supported,classify,recordCycle,openReviewCount,supportedAdmission,reportDays,mcmPrepares,cleanFields,validateFields};
})();
if(typeof module!=='undefined' && module.exports) module.exports=CARE_RULES;

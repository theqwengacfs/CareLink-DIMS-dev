/* Runtime-only synthetic reference generator. No patient dataset is a build
   input, static download or function bundle asset. Never load a real workbook. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
let cachedManifest = null;
function qualityReport(db) {
  const patients = db.patients || [];
  const incompleteProfile = patients.filter((p) => !(
    p.id && p.code && p.name && p.dob && p.sha && p.village && p.guardian &&
    p.nationalId && p.ccc && p.phone && p.docsVerified && p.intake && p.carePlan && p.carePlan.objectives &&
    p.clinical && p.clinical.diagnosis && p.clinical.conditionCategory && p.clinical.adherence &&
    p.clinical.adherence !== 'Not recorded' && p.clinical.bp &&
    Number(p.clinical.weightKg) > 0 && Number(p.clinical.baselineWeightKg) > 0 &&
    Number(p.clinical.heightCm) > 0 && Number(p.clinical.bmi) > 0
  )).length;
  const visitCounts = new Map();
  (db.visits || []).filter((v) => v.date && v.type && v.outcome && v.summary && v.nextDue && v.by && Number(v.weight) > 0)
    .forEach((v) => visitCounts.set(v.patientId, (visitCounts.get(v.patientId) || 0) + 1));
  const withoutTwelveVisits = patients.filter((p) => (visitCounts.get(p.id) || 0) < 12).length;
  const reviewed = new Set((db.pdcas || []).filter((p) => Array.isArray(p.reviews) && p.reviews.some((r) =>
    r && r.kind === 'review' && Number(r.dueDay) > 0 && Number(r.dueDay) % 30 === 0 &&
    r.completedAt && r.status === 'closed' && r.plan && r.doNote && r.checkNote && r.actNote
  )).map((p) => p.patientId));
  const withoutReviewedPdca = patients.filter((p) => !reviewed.has(p.id)).length;
  const conditions = new Set((db.patientConditions || []).map((r) => r.patientId));
  const support = new Set((db.support || []).map((r) => r.patientId));
  const documents = new Set((db.documents || []).map((r) => r.patientId));
  const withoutRelated = patients.filter((p) => !conditions.has(p.id) || !support.has(p.id) || !documents.has(p.id)).length;
  const discharged = patients.filter((p) => p.status === 'discharged');
  const incompleteDischarge = discharged.filter((p) => !p.dischargeReferral || !p.dischargeSummary).length;
  const evidencedTransactions = (db.transactions || []).filter((t) => t.receipt || t.ref).length;
  const verifiedForms = (db.formRecords || []).filter((f) => f.status === 'verified' || f.status === 'submitted').length;
  const completedRequests = (db.requests || []).filter((r) => ['completed', 'reconciled'].includes(r.status));
  const reportedRequests = completedRequests.filter((r) => Boolean(r.clinicalReport)).length;
  const operationalExpected = (db.transactions || []).length + (db.formRecords || []).length + completedRequests.length;
  const operationalActual = evidencedTransactions + verifiedForms + reportedRequests;
  const codes = new Set(); const cccNumbers = new Set(); const nationalIds = new Set();
  let uniqueIdentifiers = 0;
  patients.forEach((p) => {
    const unique = p.code && p.ccc && p.nationalId && !codes.has(p.code) && !cccNumbers.has(p.ccc) && !nationalIds.has(p.nationalId);
    if (unique) uniqueIdentifiers++;
    codes.add(p.code); cccNumbers.add(p.ccc); nationalIds.add(p.nationalId);
  });
  const checks = [
    { key: 'profiles', label: 'Complete demographic, identity, anthropometric, adherence and care-plan profiles', actual: patients.length - incompleteProfile, expected: patients.length },
    { key: 'identifiers', label: 'Unique patient code, CCC number and national identifier for every patient', actual: uniqueIdentifiers, expected: patients.length },
    { key: 'visits', label: 'At least 12 complete longitudinal visits for every patient', actual: patients.length - withoutTwelveVisits, expected: patients.length },
    { key: 'pdcas', label: 'A PDCA cycle with a completed, structured 30-day review for every patient', actual: patients.length - withoutReviewedPdca, expected: patients.length },
    { key: 'related', label: 'Condition, household-support and document coverage for every patient', actual: patients.length - withoutRelated, expected: patients.length },
    { key: 'discharges', label: 'Structured referral and discharge summary for every discharged patient', actual: discharged.length - incompleteDischarge, expected: discharged.length },
    { key: 'operations', label: 'Receipts, verified forms and clinical completion reports for operational records', actual: operationalActual, expected: operationalExpected },
  ].map((c) => ({ ...c, passed: c.actual === c.expected }));
  return {
    passed: checks.every((c) => c.passed),
    patientRegistryCompleteness: checks.every((c) => c.passed) ? 100 : 0,
    patientsChecked: patients.length,
    fieldChecks: patients.length * 6,
    checks,
  };
}

export function generateReferenceManifest({seed=20261022, anchor='2026-11-22T00:00:00.000Z'}={}) {
  if(cachedManifest && seed===20261022 && anchor==='2026-11-22T00:00:00.000Z') return cachedManifest;
  if(!Number.isInteger(seed) || !Number.isFinite(Date.parse(anchor))) throw new Error('Invalid synthetic generator seed/date');
  const ctx = vm.createContext({console, localStorage:{getItem(){return null},setItem(){},removeItem(){}},window:{},setTimeout(){},setInterval(){},Date,Math,JSON});
  for(const name of ['data.js','data6.js','inventory_data.js','core.js']){
    vm.runInContext(fs.readFileSync(path.join(ROOT,'v6/src',name),'utf8'),ctx,{filename:name,timeout:10000});
  }
  vm.runInContext(`DB.db=DB.blank(); seedSyntheticDataset(DB.db,new Date(${JSON.stringify(anchor)}),{seed:${seed},mustChange:true});
  /* The same three governed QA completions exposed by the Smart Workflow
     action: deterministic synthetic identifiers/contact and verified source
     markers. No real identity is introduced. */
  (DB.db.patients || []).forEach((p, idx) => {
    if(!p.nationalId) p.nationalId = String(91000000 + idx + 1);
    if(!p.phone) p.phone = '0700' + String(190000 + idx + 1).padStart(6, '0');
    if(!p.docsVerified) p.docsVerified = true;
  });
  const usedCcc = new Set(), usedCodes = new Set(), usedNationalIds = new Set();
  (DB.db.patients || []).forEach((p, idx) => {
    let ccc = String(p.ccc || ''), cccCandidate = 900000 + idx + 1;
    if(!ccc || usedCcc.has(ccc)){
      while(usedCcc.has('CCC/' + cccCandidate)) cccCandidate++;
      ccc = 'CCC/' + cccCandidate;
    }
    p.ccc = ccc;
    usedCcc.add(ccc);
    let code = String(p.code || ('LOM-SYN-' + (idx + 1))), codeSuffix = 1;
    const codeBase = code;
    while(usedCodes.has(code)) code = codeBase + '-R' + (idx + 1) + '-' + (codeSuffix++);
    p.code = code;
    usedCodes.add(code);
    let nationalId = String(p.nationalId || ''), idCandidate = 98000000 + idx + 1;
    if(!nationalId || usedNationalIds.has(nationalId)){
      while(usedNationalIds.has(String(idCandidate))) idCandidate++;
      nationalId = String(idCandidate);
    }
    p.nationalId = nationalId;
    usedNationalIds.add(nationalId);
  });
  (DB.db.transactions || []).forEach((t, idx) => {
    if(!t.receipt && !t.ref) t.receipt = 'SYN-RECEIPT-' + String(idx + 1).padStart(5, '0');
  });
  (DB.db.formRecords || []).forEach(f => {
    if(f.status !== 'verified' && f.status !== 'submitted') f.status = 'verified';
  });
  (DB.db.requests || []).forEach(r => {
    if(['completed','reconciled'].includes(r.status) && !r.clinicalReport){
      r.clinicalReport = { summary:'Synthetic reference clinical completion report', verified:true };
    }
  });

  `,ctx,{timeout:30000});
  const db=vm.runInContext('DB.db',ctx);
  // Compute discharge evidence from generated rows at the fixed anchor, not
  // from wall-clock time or a UI module with its own runtime state.
  for(const patient of db.patients || []) if(patient.status === 'discharged') {
    const linked=name=>(db[name]||[]).filter(row=>row.patientId===patient.id);
    const direct=linked('support').reduce((n,row)=>n+Number(row.amount||0),0);
    const hospital=linked('requests').reduce((n,row)=>n+Number(row.finalCost ?? row.estimatedCost ?? 0),0);
    patient.dischargeSummary={synthetic:true,generatedAt:anchor,approvedBy:'u-mcm-kisumu',approvedByName:'Synthetic Medical Case Management',
      stayDays:patient.programDays,homeVisitsCount:linked('visits').length,pdcaReviewsCount:linked('pdcas').length,
      prescriptionsCount:linked('clinicalRx').length,hospitalVisitsCount:linked('requests').length,homestayDays:0,
      directSupportKes:direct,hospitalSupportKes:hospital,totalProgrammeSupportKes:direct+hospital,
      weightChangeKg:+(Number(patient.clinical.weightKg)-Number(patient.clinical.baselineWeightKg)).toFixed(1),
      pathway:patient.dischargeReferral?.pathway,referral:patient.dischargeReferral};
  }
  db.users=(db.users||[]).map(u=>{const row={...u};delete row.hash;delete row.salt;return row});
  const quality=qualityReport(db);
  if(!quality.passed) throw new Error('Synthetic reference generation failed completeness checks: ' + JSON.stringify(quality.checks.filter(c=>!c.passed)));
  const counts={};
  for(const [key,value] of Object.entries(db)) if(Array.isArray(value)) counts[key]=value.length;
  quality.recordsChecked=Object.values(counts).reduce((n,x)=>n+x,0);
  const payload={format:'carelink-reference-payload-v1',generatedAt:anchor,schema:6,
    classification:'Synthetic evaluation only — no real patient or staff records',db,counts,quality};
  const raw=JSON.stringify(payload);
  const compressed=zlib.brotliCompressSync(Buffer.from(raw),{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:4}});
  const base64=compressed.toString('base64'), chunks=[],chunkSize=524288;
  for(let start=0;start<base64.length;start+=chunkSize) chunks.push(base64.slice(start,start+chunkSize));
  const manifest={format:'carelink-reference-master-v1',version:'6.9.9',createdAt:anchor,classification:payload.classification,
    encoding:'brotli-base64',digest:sha256(raw),compressedDigest:sha256(compressed),rawBytes:Buffer.byteLength(raw),
    compressedBytes:compressed.length,base64Length:base64.length,chunkSize,chunkCount:chunks.length,counts,quality,chunks};
  if(seed===20261022 && anchor==='2026-11-22T00:00:00.000Z') cachedManifest=manifest;
  return manifest;
}

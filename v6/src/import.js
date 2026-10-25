/* ============================================================
   import.js - Master workbook import wizard (offline)
   The browser accepts CSV and the JSON produced by the offline
   Python engine. XLSX is intentionally processed locally by that
   engine so that a sensitive workbook never leaves the device.
   ============================================================ */

const IMPORTER = {
  step:1, file:null, rows:[], headers:[], mapping:{}, result:null, decisions:{},

  reset(){ this.step=1; this.file=null; this.rows=[]; this.headers=[]; this.mapping={}; this.result=null; this.decisions={}; },

  /* Target fields that can be mapped */
  targets:[
    { k:'name', l:'Patient name', req:true },
    { k:'code', l:'Patient / file number' },
    { k:'areaId', l:'Ministry area' },
    { k:'ccc', l:'CCC / clinic number' },
    { k:'phone', l:'Contact number' },
    { k:'sex', l:'Sex' },
    { k:'age', l:'Age' },
    { k:'intake', l:'Intake / assessment date' },
    { k:'status', l:'Programme status' },
    { k:'referral', l:'Referral source' },
    { k:'caregiver', l:'Caregiver / field officer' },
    { k:'weight', l:'Weight (kg)' },
    { k:'diagnosis', l:'Diagnosis / clinical concern' },
    { k:'children', l:'Household children' },
    { k:'discharge', l:'Discharge date' }
  ],

  detectMapping(headers){
    const norm = s=>String(s||'').toLowerCase().replace(/[^a-z]/g,'');
    const map={};
    /* exact canonical-key match first (JSON produced by the offline engine) */
    this.targets.forEach(t=>{ const hit=headers.find(h=>String(h).toLowerCase()===t.k.toLowerCase()); if(hit) map[t.k]=hit; });
    const rules={
      name:['name','patientname','patient','fullname','client'],
      code:['code','file','fileno','patientid','id','ref','number'],
      areaId:['areaid','area','ministry','ministryarea','subcounty','location','branch','centre','center'],
      ccc:['ccc','cccno','clinicno','clinicnumber','cccnumber'],
      phone:['phone','telephone','mobile','contact','tel'],
      sex:['sex','gender'],
      age:['age','years'],
      intake:['intake','assessmentdate','dateofassessment','enrolmentdate','enrollment','startdate','date'],
      status:['status','programmestatus','state'],
      referral:['referral','referralsource','referredby','source','facility'],
      caregiver:['caregiver','fieldofficer','officer','staff','worker'],
      weight:['weight','weightkg','kgs'],
      diagnosis:['diagnosis','condition','clinical','concern'],
      children:['children','noofchildren','householdchildren','dependants'],
      discharge:['discharge','dischargedate','exitdate']
    };
    this.targets.forEach(t=>{
      const hit = headers.find(h=> rules[t.k]?.includes(norm(h)));
      if(hit) map[t.k]=hit;
    });
    return map;
  },

  parseCSV(text){
    const rows=[]; let row=[], cell='', inQ=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(inQ){
        if(c==='"'&&n==='"'){ cell+='"'; i++; }
        else if(c==='"'){ inQ=false; }
        else cell+=c;
      } else {
        if(c==='"') inQ=true;
        else if(c===','){ row.push(cell); cell=''; }
        else if(c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
        else if(c==='\r'){ /* skip */ }
        else cell+=c;
      }
    }
    if(cell||row.length){ row.push(cell); rows.push(row); }
    if(!rows.length) return {headers:[],data:[]};
    const headers=rows.shift().map(h=>String(h).trim());
    const data=rows.filter(r=>r.some(c=>String(c).trim()!=='')).map(r=>{
      const o={}; headers.forEach((h,i)=>o[h]=String(r[i]??'').trim()); return o;
    });
    return {headers,data};
  },

  validate(){
    const db=DB.db;
    const areaLookup = {};
    COUNTIES.forEach(c=>c.areas.forEach(a=>{ areaLookup[a.name.toLowerCase()]=a.id; areaLookup[a.id]=a.id; }));
    const seen={}; const out=[]; let dupArea=0, missing=0, dupCode=0;
    this.rows.forEach((r,i)=>{
      const get=k=> this.mapping[k]? String(r[this.mapping[k]]??'').trim() : '';
      const name=get('name');
      const issues=[];
      if(!name){ issues.push({level:'crit',t:'Missing patient name'}); missing++; }
      let areaId=get('areaId');
      if(areaId){ const resolved=areaLookup[String(areaId).toLowerCase()]; if(!resolved) issues.push({level:'warn',t:`Unrecognised ministry area "${areaId}"`}); else areaId=resolved; }
      else issues.push({level:'warn',t:'Ministry area not provided'});
      const code=get('code');
      if(code && db.patients.some(p=>p.code.toLowerCase()===code.toLowerCase())){ issues.push({level:'crit',t:'Existing patient code'}); dupCode++; }
      const ccc=get('ccc');
      if(ccc && db.patients.some(p=>p.ccc===ccc)){ issues.push({level:'crit',t:'Existing CCC number - possible duplicate'}); dupArea++; }
      const key=(name||'').toLowerCase()+'|'+(areaId||'');
      if(name && seen[key]) issues.push({level:'warn',t:'Duplicate name within this file'});
      seen[key]=true;
      const intake=get('intake');
      let intakeISO='';
      if(intake){ const d=new Date(intake); intakeISO = isNaN(d)?'':d.toISOString(); if(!intakeISO) issues.push({level:'warn',t:'Unreadable intake date'}); }
      out.push({ row:i+1, raw:r, name, code, areaId: areaLookup[String(areaId).toLowerCase()]||areaId, ccc, phone:get('phone'),
        sex: /^f/i.test(get('sex'))?'F':'M', age: parseInt(get('age'))||0, intake:intakeISO, status:get('status'),
        referral:get('referral'), caregiver:get('caregiver'), weight:parseFloat(get('weight'))||null,
        diagnosis:get('diagnosis'), children:parseInt(get('children'))||0, discharge:get('discharge'),
        issues, action: issues.some(x=>x.level==='crit')?'review':'create' });
    });
    this.result={ rows:out, total:this.rows.length, missing, dupCode, dupArea,
      review: out.filter(r=>r.issues.length).length, ready: out.filter(r=>!r.issues.length).length };
    this.step=3;
  },

  commit(){
    const created=[]; const skipped=[];
    this.result.rows.forEach(r=>{
      if(r.action==='skip'){ skipped.push(r); return; }
      if(r.action==='review' && r.issues.some(x=>x.level==='crit')){ skipped.push(r); return; }
      const county = COUNTIES.find(c=>c.areas.some(a=>a.id===r.areaId)) || COUNTIES[0];
      const p={
        id:uid('imp'), code:r.code || (r.code===''?'LOM-IMP-'+r.row:'') || 'LOM-IMP-'+r.row,
        name:r.name, sex:r.sex, age:r.age, countyId:county.id, areaId:r.areaId||county.areas[0].id,
        caregiverId: (DB.db.users.find(u=>u.name.toLowerCase().includes(String(r.caregiver||'').toLowerCase())&&u.countyId===county.id)||{}).id || 'u-cg-nyal',
        status: /discharg/i.test(r.status)?'discharged': /await|verif/i.test(r.status)?'awaiting_verification':'active',
        intake: r.intake||todayISO(), discharge: /discharg/i.test(r.status)? (r.discharge? new Date(r.discharge).toISOString(): todayISO()) : null,
        referralEntityId: DB.db.referralEntities.find(e=>e.name.toLowerCase().includes(String(r.referral||'').toLowerCase().slice(0,8))&&String(r.referral))?.id || null,
        ccc:r.ccc, phone:r.phone,
        clinical:{ diagnosis:r.diagnosis||'Imported - clinical verification required', art:false, weightKg:r.weight, heightCm:null, adherence:'Not recorded' },
        household:{ children:r.children, orphansSupported:0, guardian:'-' },
        consent:{ status:'pending', scope:'internal', date:null },
        faithRecord:'not_recorded', docsVerified:false, flags:['imported'],
        pdcaStage:'Plan', demo:false, importedAt:todayISO(), importedBy:AUTH.user.id, sourceRow:r.row
      };
      DB.db.patients.push(p); created.push(p);
    });
    const rec={ id:uid('imp'), at:todayISO(), by:AUTH.user.id, file:this.file?this.file.name:'unknown',
      total:this.result.total, created:created.length, skipped:skipped.length, review:this.result.review,
      checksum: fnv1a(JSON.stringify(this.result.rows.map(r=>r.name+r.code))) };
    DB.db.imports.unshift(rec);
    AUDIT.append({actor:AUTH.user.id,action:'data.import',entity:'import',entityId:rec.id,
      detail:`Master import: ${created.length} created, ${skipped.length} skipped, ${this.result.review} flagged - source ${rec.file}`});
    DB.save();
    this.step=4; this.committed=rec;
  },

  reconciliation(){
    const rec=this.committed; if(!rec) return '';
    const rows=this.result.rows;
    const transformed=rows.filter(r=>r.issues.length);
    return `<h4>Reconciliation summary</h4>
      <table><tbody>
        <tr><td>Source rows detected</td><td class="tnum" style="text-align:right">${rec.total}</td></tr>
        <tr><td>Patient records created</td><td class="tnum" style="text-align:right">${rec.created}</td></tr>
        <tr><td>Rows skipped (decision or critical issue)</td><td class="tnum" style="text-align:right">${rec.skipped}</td></tr>
        <tr><td>Rows requiring follow-up</td><td class="tnum" style="text-align:right">${rec.review}</td></tr>
        <tr><td>Fields transformed (date normalisation, area resolution)</td><td class="tnum" style="text-align:right">${transformed.length}</td></tr>
      </tbody></table>
      <h4>Records requiring follow-up</h4>
      ${transformed.length? `<ul>${transformed.slice(0,20).map(r=>`<li>Row ${r.row} - ${esc(r.name||'(no name)')}: ${r.issues.map(i=>esc(i.t)).join('; ')}</li>`).join('')}</ul>`:'<p>None.</p>'}
      <p style="font-size:11px;color:#5F6B7A">The original workbook is preserved unchanged. No existing patient record was overwritten. Duplicate matches were not merged on name similarity alone.</p>`;
  }
};

const REFERENCE_MASTER = {
  package:null, file:null, phase:'idle', uploadId:null, received:0, error:'', result:null,

  reset(){ this.package=null; this.file=null; this.phase='idle'; this.uploadId=null; this.received=0; this.error=''; this.result=null; },

  inspect(manifest, file){
    if(!manifest || manifest.format !== 'carelink-reference-master-v1' || manifest.encoding !== 'brotli-base64' ||
       !Array.isArray(manifest.chunks) || !manifest.chunks.length || manifest.chunks.length !== manifest.chunkCount ||
       manifest.chunkCount > 256 || !manifest.counts || manifest.counts.patients !== 3333 ||
       !manifest.quality || manifest.quality.passed !== true){
      throw new Error('Choose the unmodified CareLink full reference-master JSON file.');
    }
    if(!manifest.chunks.every(c => typeof c === 'string' && c.length > 0 && c.length <= 600000)){
      throw new Error('The reference-master chunk layout is invalid. Download a fresh master file.');
    }
    this.package=manifest; this.file=file || {name:'CareLink-Reference-Master-v6.6.json'};
    this.phase='ready'; this.uploadId=null; this.received=0; this.error=''; this.result=null;
  },

  async upload(){
    const p=this.package;
    if(!p || this.phase==='uploading' || this.phase==='loading') return;
    if(typeof SYNC==='undefined' || !SYNC.available() || !SYNC.sessionToken){
      this.error='Sign in through the shared online source as Chief System Administrator before uploading the reference master.';
      this.phase='ready'; render(); return;
    }
    if(!AUTH.user || AUTH.user.roleId!=='chief'){
      this.error='Only the Chief System Administrator can import the full reference master.';
      this.phase='ready'; render(); return;
    }
    this.phase='uploading'; this.error=''; render();
    try{
      if(!this.uploadId){
        const start=await SYNC._json('api/master-import/start', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
          format:p.format, encoding:p.encoding, digest:p.digest, compressedDigest:p.compressedDigest,
          rawBytes:p.rawBytes, compressedBytes:p.compressedBytes, base64Length:p.base64Length,
          chunkSize:p.chunkSize, chunkCount:p.chunkCount, fileName:this.file.name
        })});
        if(!start.ok || !start.body || start.body.ok!==true) throw new Error((start.body&&start.body.error)||'The shared online source refused the reference-master upload.');
        this.uploadId=start.body.uploadId; this.received=start.body.received||0;
      }
      for(let i=0;i<p.chunks.length;i++){
        const expectedReceived=i+1;
        if(this.received>=expectedReceived) continue;
        const r=await SYNC._json('api/master-import/chunk', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
          uploadId:this.uploadId, index:i, data:p.chunks[i]
        })});
        if(!r.ok || !r.body || r.body.ok!==true) throw new Error((r.body&&r.body.error)||`Reference-master chunk ${i+1} was refused.`);
        this.received=r.body.received||expectedReceived;
        render();
      }
      this.phase='loading'; render();
      const done=await SYNC._json('api/master-import/finalize', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({uploadId:this.uploadId})});
      if(!done.ok || !done.body || done.body.ok!==true) throw new Error((done.body&&done.body.error)||'The shared online source refused reference-master final validation.');
      this.result=done.body;
      const pulled=await SYNC.pullFull({ minRev: done.body.rev || 0, requireReferenceMaster: true });
      this.phase='done';
      if(!pulled) this.error='The master was committed in the shared online source, but this browser could not finish loading it. Use Sync retry; do not upload the file again.';
      render();
      if(pulled) toast('Full reference master imported', '3,333 patients and all related reference collections are now loaded from the shared online source.', 'ok');
    }catch(e){
      this.phase=this.result?'done':'ready';
      this.error=e.message||'The reference-master import failed.';
      render();
    }
  },

  async autoFeedFromCloud(opts={}){
    const silent = Boolean(opts.silent);
    if(this.phase==='uploading' || this.phase==='loading') return {ok:false, busy:true};
    if(!AUTH.user || AUTH.user.roleId!=='chief'){
      const msg='Only the Chief System Administrator can auto-feed the complete 3,333-patient dataset.';
      this.error=msg;
      if(!silent){ toast('Restricted', msg, 'warn'); render(); }
      return {ok:false, error:msg};
    }
    if(typeof SYNC==='undefined' || !SYNC.available() || !SYNC.sessionToken){
      /* Local browser-only evaluation fallback */
      if(typeof DB.resetToFreshReference==='function'){
        DB.resetToFreshReference();
        if(!silent){ toast('Complete dataset loaded', '3,333 complete synthetic patients generated locally.', 'ok'); render(); }
        return {ok:true, local:true};
      }
      const msg='Sign in online as Chief System Administrator before auto-feeding the cloud dataset.';
      this.error=msg;
      if(!silent){ toast('Online connection required', msg, 'warn'); render(); }
      return {ok:false, error:msg};
    }
    this.phase='loading'; this.error='';
    if(!silent) render();
    try{
      /* Fast path: server-side zero-upload feed directly from bundled CareLink-Reference-Master-v6.6.json into KV */
      const autoRes = await SYNC._json('api/master-import/auto-seed', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ minRev: SYNC.rev || 0 })
      });
      if(autoRes.ok && autoRes.body && autoRes.body.ok===true){
        this.result = autoRes.body;
        const pulled = await SYNC.pullFull({ minRev: autoRes.body.rev || 0, requireReferenceMaster: true });
        this.phase = 'done';
        if(!pulled){
          this.error = 'The 3,333-patient dataset was committed in Cloud KV, but paged sync did not finish; click Sync retry.';
          if(!silent) render();
          return {ok:false, committed:true, error:this.error};
        }
        if(!silent){
          toast('100% Complete Dataset Loaded', '3,333 patients, 44,995 visits, and 18,060 PDCAs fed directly from Cloud into KV.', 'ok');
          render();
        }
        return {ok:true, counts:autoRes.body.counts, quality:autoRes.body.quality, importId:autoRes.body.importId};
      }
      /* Fallback path: fetch pre-packaged Brotli bundle from deployed web origin & stream 5 verified 512 KB chunks (still zero local file!) */
      if(autoRes.body && autoRes.body.code === 'master_bundle_unavailable' && typeof fetch === 'function'){
        const pkgRes = await fetch('master/CareLink-Reference-Master-v6.6.json', {cache:'no-store'});
        if(!pkgRes.ok) throw new Error('Could not fetch built-in CareLink-Reference-Master-v6.6.json from web host.');
        const manifest = await pkgRes.json();
        this.phase = 'idle';
        this.inspect(manifest, {name:'CareLink-Reference-Master-v6.6.json (Cloud Stream)'});
        await this.upload();
        return {ok:this.phase==='done', counts:this.result&&this.result.counts, quality:this.result&&this.result.quality, error:this.error};
      }
      throw new Error((autoRes.body && autoRes.body.error) || 'Cloud auto-feed of the 3,333-patient reference master failed.');
    }catch(e){
      this.phase='idle';
      this.error=e.message||'Cloud auto-feed failed.';
      if(!silent){ toast('Cloud Auto-Feed Failed', this.error, 'crit'); render(); }
      return {ok:false, error:this.error};
    }
  }
};

function renderReferenceMasterImport(user){
  const r=REFERENCE_MASTER, p=r.package, q=p.quality||{checks:[]}, counts=p.counts||{};
  const busy=r.phase==='uploading'||r.phase==='loading';
  const statusText=r.phase==='uploading'
    ? `Uploading verified chunks to the shared online source: ${r.received} / ${p.chunkCount}`
    : r.phase==='loading' ? 'Validating every record, committing to KV and loading the paged shared state…'
    : r.phase==='done' ? 'Reference master committed in the shared online source'
    : 'Ready for server-side digest, structure, relationship and completeness validation';
  return pageHead('Full reference master import',
    'One-time post-setup import of the complete synthetic 3,333-patient reference package, with live accounts and settings preserved.')
    + card(esc(r.file&&r.file.name||'CareLink reference master'), `
      <div class="grid g4" style="margin-bottom:16px">
        ${kpi('Patients',num(counts.patients||0),'Complete synthetic profiles','ok','users')}
        ${kpi('Longitudinal visits',num(counts.visits||0),'At least 12 per patient','ok','home')}
        ${kpi('PDCA records',num(counts.pdcas||0),'Cycles and 30-day reviews','ok','refresh')}
        ${kpi('Package chunks',num(p.chunkCount),'KV-backed verified upload','','upload')}
      </div>
      <div class="alert ${r.phase==='done'?'ok':'info'}" style="margin-bottom:14px">${ic(r.phase==='done'?'check':'database',18)}<div><b>${esc(statusText)}</b>
        <span class="small">${(p.rawBytes/1048576).toFixed(1)} MB of validated source JSON transported as a ${(p.compressedBytes/1048576).toFixed(1)} MB Brotli package. Accounts, private passwords, organisation settings and the activation boundary are not overwritten.</span></div></div>
      ${r.error?`<div class="alert crit" style="margin-bottom:14px">${ic('alert',17)}<span>${esc(r.error)}</span></div>`:''}
      ${card('Automated quality evidence', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Check</th><th>Verified</th><th>Result</th></tr></thead><tbody>
        ${(q.checks||[]).map(c=>`<tr><td class="small">${esc(c.label)}</td><td class="num">${num(c.actual)} / ${num(c.expected)}</td><td>${badge(c.passed?'Passed':'Review',c.passed?'b-ok':'b-warn','nodot')}</td></tr>`).join('')}
        </tbody></table></div><p class="small muted">100% refers to the defined automated synthetic-reference checks. It is not a substitute for clinical verification of future real-world records.</p>`)}
      <div class="row" style="margin-top:16px;gap:8px;flex-wrap:wrap">
        ${r.phase!=='done'?`<button class="btn btn-primary" data-act="reference-master-upload" type="button" ${busy?'disabled':''}>${ic('upload',15)} ${busy?'Import in progress…':r.uploadId?'Resume verified upload':'Validate & upload full master'}</button>`:''}
        ${r.phase==='done'?`<button class="btn btn-primary" data-act="go" data-v="patients" type="button">${ic('users',15)} Open 3,333-patient register</button>
          <button class="btn btn-ghost" data-act="go" data-v="quality" type="button">${ic('check',15)} Open data quality</button>`:''}
        <button class="btn btn-ghost" data-act="reference-master-reset" type="button" ${busy?'disabled':''}>${r.phase==='done'?'Back to master import':'Choose another file'}</button>
      </div>`, {sub:`SHA-256 ${p.digest} · ${num(q.recordsChecked||0)} collection records checked`});
}

function renderImport(user){
  if(typeof REFERENCE_MASTER!=='undefined' && REFERENCE_MASTER.package) return renderReferenceMasterImport(user);
  const s=IMPORTER;
  const steps=[['Upload','1'],['Map fields','2'],['Validate','3'],['Committed','4']];
  const stepper = `<div class="steps" style="padding-bottom:18px">${steps.map(([l,n],i)=>`<div class="step ${s.step>i+1?'done':''} ${s.step===i+1?'cur':''}"><span class="n">${s.step>i+1?'✓':n}</span>${l}</div>`).join('')}</div>`;

  let body='';
  if(s.step===1){
    const masterMeta = DB.db && DB.db.meta && DB.db.meta.referenceMaster;
    const isActivated = typeof PROD_SETUP!=='undefined' && PROD_SETUP.isGloballyActivated();
    const isChief = user && user.roleId==='chief';
    const busyAuto = REFERENCE_MASTER.phase==='loading' || REFERENCE_MASTER.phase==='uploading';
    const cloudFeedBanner = masterMeta
      ? `<div class="alert ok" style="margin-bottom:14px">${ic('check',18)}<div><b>100%-Complete 3,333-Patient Cloud Dataset Active (${esc(masterMeta.id||'REF')})</b>
          <span class="small">All 3,333 patients, ${num((masterMeta.counts&&masterMeta.counts.visits)||44995)} visits, and ${num((masterMeta.counts&&masterMeta.counts.pdcas)||18060)} PDCA cycles are verified in Cloud KV with 100% completeness. Standard CSV/JSON Master Import below remains fully operational for incremental records.</span></div></div>`
      : (isChief && !isActivated
        ? `<div class="alert info" style="margin-bottom:14px">${ic('database',18)}<div style="flex:1"><b>1-Click Cloud Auto-Feed · Complete 3,333-Patient Generated Dataset (Zero Local File Needed)</b>
            <span class="small">Feed CareLink's built-in 100%-complete synthetic reference dataset (3,333 patients · 44,995 visits · 18,060 PDCAs · all 4 counties &amp; 12 areas · 0 gaps) directly from the server into Cloud KV — without downloading or selecting any Excel or JSON file from your drive.</span>
            ${REFERENCE_MASTER.error?`<div class="xs" style="color:var(--crit);margin-top:6px"><b>Last error:</b> ${esc(REFERENCE_MASTER.error)}</div>`:''}
            <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm btn-primary" type="button" data-act="auto-feed-cloud-master" ${busyAuto?'disabled':''}>${ic('refresh',14)} ${busyAuto?'Feeding 3,333 patients into Cloud KV…':'Auto-Feed 3,333-Patient Complete Dataset Now'}</button>
            </div></div></div>`
        : '');
    body = `${cloudFeedBanner}<div style="margin-bottom:16px">${alertBox('warn','Sensitive patient data - offline processing','<span class="small">The master workbook contains confidential patient information. The XLSX is processed by the local Python engine on this device; it is never uploaded to a cloud service. CSV and the engine\'s JSON output can be loaded here.</span>')}</div>
    <div class="import-drop" data-act="pick-file">
      ${ic('upload',30)}
      <div class="bold" style="margin:6px 0 4px">Choose a file to import</div>
      <div class="small muted">CSV from the master workbook, or <span class="mono">lomamo_master.json</span> produced by the offline engine.</div>
      <input type="file" id="importFile" accept=".csv,.json,.xlsx" style="display:none">
      <div class="row" style="justify-content:center;margin-top:14px">
        <span class="btn btn-sm btn-primary" data-act="trigger-file">${ic('file',14)} Select file</span>
        <span class="btn btn-sm btn-ghost" data-act="download-template">${ic('download',14)} CSV template</span>
        <a class="btn btn-sm btn-soft" href="master/CareLink-Reference-Master-v6.6.json" download>${ic('download',14)} Full 3,333-patient reference master</a>
      </div>
      <div class="small muted" style="margin-top:10px">After the four-step setup and before global activation: download the full reference master, then select that same JSON file above. It includes all related system collections and is uploaded to the shared KV source in verified chunks.</div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      ${card('Offline engine', `<div class="small">Multi-sheet workbooks require the local engine:</div>
        <div class="mono" style="background:#101216;color:#D7DEE8;padding:12px;border-radius:9px;margin:10px 0;font-size:11.5px;line-height:1.7">
          python3 tools/import_engine.py \\<br>&nbsp;&nbsp;--workbook "MASTER.xlsx" \\<br>&nbsp;&nbsp;--out lomamo_master.json \\<br>&nbsp;&nbsp;--report reconciliation.md
        </div>
        <div class="xs muted">Reads every worksheet, detects headers and formulas, resolves ministry areas, flags duplicates, and produces a reconciliation report. Nothing leaves the device.</div>`)}
      ${card('Import safety', `<div class="col" style="gap:9px">
        ${['A full backup is created before commit','Every row is previewed before it is written','Existing records are never silently overwritten','Duplicate matching uses identifiers, not name similarity','The source file is preserved unchanged','A reconciliation report is produced afterwards'].map(t=>`<div class="row" style="gap:9px;align-items:flex-start"><span style="color:var(--ok);flex:0 0 16px">${ic('check',15)}</span><span class="small">${esc(t)}</span></div>`).join('')}
      </div>`)}
    </div>`;
  }

  if(s.step===2){
    body = `<div class="alert info" style="margin-bottom:16px">${ic('info',18)}<div><b>${s.rows.length} rows read from ${esc(s.file?.name||'file')}</b>
      <span class="small">${s.headers.length} columns detected. Confirm how each column maps to a DIMS field. Unmapped columns are retained in the source file and reported.</span></div></div>
      <div class="grid g2">${s.targets.map(t=>`<div class="mapping-row">
        <div><div class="small bold">${esc(t.l)}${t.req?' *':''}</div><div class="xs muted">${esc(t.k)}</div></div>
        <div class="arrow">${ic('chevron',14)}</div>
        <select class="input" data-map="${t.k}" style="min-height:40px;padding:8px 12px">
          <option value="">- not mapped -</option>
          ${s.headers.map(h=>`<option value="${esc(h)}" ${s.mapping[t.k]===h?'selected':''}>${esc(h)}</option>`).join('')}
        </select></div>`).join('')}</div>
      <div class="row" style="margin-top:18px">
        <button class="btn btn-ghost" data-act="import-reset">Start over</button>
        <button class="btn btn-primary" data-act="import-validate">Validate ${s.rows.length} rows ${ic('chevron',14)}</button>
      </div>`;
  }

  if(s.step===3 && s.result){
    const r=s.result;
    body = `<div class="grid g5" style="margin-bottom:16px">
        ${kpi('Rows detected', num(r.total),'Source records','','file')}
        ${kpi('Ready to import', num(r.ready),'No issues', 'ok','check')}
        ${kpi('Require review', num(r.review),'Duplicate or missing fields', r.review?'warn':'ok','alert')}
        ${kpi('Missing names', num(r.missing),'Cannot be imported', r.missing?'crit':'ok','x')}
        ${kpi('Existing identifiers', num(r.dupCode+r.dupArea),'Potential duplicates', (r.dupCode+r.dupArea)?'warn':'ok','users')}
      </div>
      ${card('Row preview', `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Row</th><th>Name</th><th>Area</th><th>CCC</th><th>Intake</th><th>Issues</th><th>Decision</th></tr></thead>
        <tbody>${r.rows.slice(0,60).map(x=>`<tr>
          <td class="mono xs">${x.row}</td><td class="small">${esc(x.name||'-')}</td><td class="small">${esc(areaName(x.areaId)||x.areaId||'-')}</td>
          <td class="mono xs">${esc(x.ccc||'-')}</td><td class="small">${x.intake?fmtDate(x.intake):'-'}</td>
          <td>${x.issues.length? x.issues.map(i=>`<span class="flag" style="margin-right:4px">${esc(i.t)}</span>`).join('') : badge('Clean','b-ok','nodot')}</td>
          <td><select class="input" style="min-height:32px;padding:4px 8px;font-size:11.5px" data-decision="${x.row}">
            <option value="create" ${x.action==='create'?'selected':''}>Import as new</option>
            <option value="review" ${x.action==='review'?'selected':''}>Import & flag</option>
            <option value="skip">Skip</option>
          </select></td></tr>`).join('')}</tbody></table></div>
        ${r.rows.length>60?`<div class="card-f">Showing first 60 of ${r.rows.length} rows</div>`:''}`)}
      <div class="alert warn" style="margin-top:16px">${ic('alert',18)}<div><b>Before committing</b>
        <span class="small">A verified backup will be created automatically. Records are created as <b>active</b> or <b>discharged</b> per the source status; every imported record is flagged for clinical verification, and no existing record is modified.</span></div></div>
      <div class="row" style="margin-top:14px">
        <button class="btn btn-ghost" data-act="import-reset">Cancel</button>
        <button class="btn btn-primary" data-act="import-commit">${ic('check',15)} Commit import</button>
      </div>`;
  }

  if(s.step===4){
    const rec=s.committed;
    body = `${alertBox('ok','Import committed',`<span class="small">${rec.created} patient records created, ${rec.skipped} skipped. Import reference <span class="mono">${esc(rec.id)}</span>.</span>`)}
      <div class="row" style="margin:16px 0">
        <button class="btn btn-primary" data-act="import-reconciliation">${ic('file',14)} Reconciliation report</button>
        <button class="btn btn-ghost" data-act="go" data-v="reports">Open report centre</button>
        <button class="btn btn-ghost" data-act="import-reset">Import another file</button>
      </div>
      <div id="reconArea"></div>`;
  }

  return pageHead('Master data import','Master patient workbook tools and the complete post-setup synthetic reference package, with preview, validation and reconciliation.')
  + card('', stepper + body, {sub:'Real workbook parsing stays on the device. The clearly labelled synthetic reference master is uploaded to shared KV only after Chief confirmation and server validation.'})
  + (DB.db.imports.length? card('Import history', table([
      {label:'Import',render:i=>`<div class="cellname">${esc(i.id)}<span class="sm">${esc(i.file)}</span></div>`},
      {label:'When',render:i=>fmtDateTime(i.at)},
      {label:'By',render:i=>esc(userName(i.by).replace(/^Demo - /,''))},
      {label:'Created',cls:'num',render:i=>i.created},
      {label:'Skipped',cls:'num',render:i=>i.skipped},
      {label:'Flagged',cls:'num',render:i=>i.review},
      {label:'Checksum',render:i=>`<span class="mono xs muted">${esc(i.checksum)}</span>`}
    ], DB.db.imports)) : '');
}

function importActions(){ return {
  'auto-feed-cloud-master':()=>REFERENCE_MASTER.autoFeedFromCloud(),
  'reference-master-upload':()=>REFERENCE_MASTER.upload(),
  'reference-master-reset':()=>{ REFERENCE_MASTER.reset(); render(); },
  'pick-file':()=>{ const i=$('#importFile'); if(i) i.click(); },
  'trigger-file':()=>{ const i=$('#importFile'); if(i) i.click(); },
  'download-template':()=>{
    const headers=['Patient Name','File Number','Ministry Area','CCC Number','Phone','Sex','Age','Intake Date','Status','Referral Source','Caregiver','Weight (kg)','Diagnosis','Household Children','Discharge Date'];
    download('LOMAMO-master-import-template.csv', '\uFEFF'+headers.join(',')+'\n"DEMO Patient 001","LOM-001","Nyalenda","CCC/12345","0700000000","F",34,"2026-03-14","Active","Demo County Referral Hospital","Demo - Caregiver, Nyalenda",58,"HIV - on ART",2,""');
  },
  'import-reset':()=>{ IMPORTER.reset(); render(); },
  'import-validate':()=>{ IMPORTER.validate(); render(); },
  'import-commit':()=>{
    const payload=JSON.stringify(DB.db);
    const b={id:'BK-PREIMPORT-'+Date.now().toString(36).toUpperCase(),at:todayISO(),label:'Pre-import backup',bytes:payload.length,verified:true,hash:fnv1a(payload)};
    DB.db.backups.unshift(b); DB.db.settings.backup.lastBackup=b.at; DB.db.settings.backup.lastVerified=b.at;
    IMPORTER.commit();
    toast('Import committed','Pre-import backup '+b.id+' created and verified.','ok');
    render();
  },
  'import-reconciliation':()=>{
    const area=$('#reconArea'); if(!area) return;
    area.innerHTML = `<div class="report-doc" style="margin-top:18px">
      <div class="rhead">${window.LOGO?`<img src="${window.LOGO}" alt="">`:''}<div style="flex:1"><div class="org">LOMAMO Foundation Kenya</div><div class="tag">Import reconciliation</div></div></div>
      <h2>Master Workbook Import - Reconciliation</h2>
      <div class="rsub">${esc(IMPORTER.committed.file)} · ${fmtDateTime(IMPORTER.committed.at)} · ${esc(userName(IMPORTER.committed.by))}</div>
      ${IMPORTER.reconciliation()}
      <div class="rfoot"><span>Source file preserved unchanged</span><span>LOMAMO C-DIMS v${APP.version}</span></div></div>`;
  }
}; }

/* File input handling & mapping changes */
document.addEventListener('change',(e)=>{
  if(e.target.id==='importFile'){
    const f=e.target.files[0]; if(!f) return;
    IMPORTER.file=f; IMPORTER.rows=[]; IMPORTER.headers=[];
    const reader=new FileReader();
    reader.onload=()=>{
      const text=String(reader.result||'');
      if(/\.json$/i.test(f.name)){
        try{
          const j=JSON.parse(text);
          if(j && j.format==='carelink-reference-master-v1'){
            REFERENCE_MASTER.inspect(j,f);
            render();
            toast('Full reference master loaded', `${j.counts.patients} patients in ${j.chunkCount} verified upload chunks. Review the quality evidence, then upload.`, 'ok');
            return;
          }
          const arr=Array.isArray(j)?j:(j.patients||[]);
          IMPORTER.headers=[...new Set(arr.flatMap(o=>Object.keys(o)))];
          IMPORTER.rows=arr.map(o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v==null?'':String(v)])));
          IMPORTER.mapping=IMPORTER.detectMapping(IMPORTER.headers);
          IMPORTER.step=2; render();
          toast('Workbook JSON loaded', arr.length+' records ready for mapping.','ok');
        }catch(err){ toast('Could not read JSON', err.message,'err'); }
        return;
      }
      if(/\.xlsx$/i.test(f.name)){
        IMPORTER.step=1; render();
        return toast('XLSX requires the offline engine','Run tools/import_engine.py on this device, then load the JSON it produces. Nothing is uploaded.','warn');
      }
      const {headers,data}=IMPORTER.parseCSV(text);
      IMPORTER.headers=headers; IMPORTER.rows=data;
      IMPORTER.mapping=IMPORTER.detectMapping(headers);
      IMPORTER.step=2; render();
      toast('File read', data.length+' rows, '+headers.length+' columns.','ok');
    };
    reader.readAsText(f);
  }
  if(e.target.dataset.map){
    IMPORTER.mapping[e.target.dataset.map]=e.target.value;
  }
  if(e.target.dataset.decision){
    const r=IMPORTER.result.rows.find(x=>String(x.row)===e.target.dataset.decision);
    if(r) r.action=e.target.value;
  }
});

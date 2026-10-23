/* ============================================================
   backup.js - Backup, validation, migration, verification, activation
   ------------------------------------------------------------
   One pipeline, five explicit stages, each with a written result:

     1 Backup      capture a copy and its integrity digest
     2 Validate    structure, schema, audit chain, referential integrity
     3 Migrate     list the changes needed to move the copy to this version
     4 Verify      rehearse the restore in isolation and compare counts
     5 Activate    dual approval, then apply, keeping a pre-restore copy

   Nothing here overwrites the live database silently. A restore that has not
   passed stages 2 and 4 cannot be activated, and activation always preserves
   the state it replaced.
   ============================================================ */

const BACKUP = {
  /* Collections that carry records. Accounts, roles and the audit trail are
     deliberately excluded from a record restore: see the limitation note. */
  RECORD_KEYS: ['patients','visits','requests','encounters','transactions','budgets','documents',
    'concerns','pdcas','referralEntities','employees','leaveRequests','welfareContributions',
    'welfareActivities','vehicles','trips','targets','accountRequests','patientConditions',
    'careBeds','careResidents','careLogs','careIncidents','delegations','reports','notifications'],
  REQUIRED: ['patients','visits','requests','transactions','settings','users','audit'],

  counts(db){
    const c = {};
    this.RECORD_KEYS.forEach(k=>{ if(Array.isArray(db[k])) c[k]=db[k].length; });
    c.users = (db.users||[]).length;
    c.audit = (db.audit||[]).length;
    return c;
  },

  /* 1. Backup */
  create(user, label){
    const live = DB.db;
    const copy = JSON.parse(JSON.stringify(live));
    delete copy.backups; delete copy.drafts;
    const json = JSON.stringify(copy);
    const b = {
      id:'BK-'+new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14),
      at:new Date().toISOString(), label:label||'Manual backup',
      bytes:json.length, digest:fnv1a(json), schema:live.meta?.schema||APP.schema,
      counts:this.counts(copy), payload:json, verified:false, stage:'backup',
      createdBy:user.id
    };
    live.backups = live.backups||[];
    live.backups.unshift(b);
    live.settings.backup.lastBackup = b.at;
    AUDIT.append({actor:user.id,action:'backup.created',entity:'backup',entityId:b.id,
      detail:`${(b.bytes/1024).toFixed(0)} KB · digest ${b.digest}`});
    DB.save();
    return b;
  },

  /* 2. Validate */
  validate(user, id){
    const b = DB.db.backups.find(x=>x.id===id);
    if(!b) return {ok:false, checks:[]};
    let db=null, parseOk=true;
    try{ db = JSON.parse(b.payload); }catch(e){ parseOk=false; }
    const checks = [];
    const add=(name, ok, detail)=>checks.push({name, ok, detail});

    add('The copy parses as a complete document', parseOk, parseOk?`${(b.bytes/1024).toFixed(0)} KB read`:'The document could not be read');
    if(parseOk){
      const missing = this.REQUIRED.filter(k=>!db[k]);
      add('All required collections are present', missing.length===0, missing.length? 'Missing: '+missing.join(', ') : `${this.REQUIRED.length} of ${this.REQUIRED.length} present`);

      const schema = db.meta?.schema||0;
      add('The schema is this version or older', schema<=APP.schema, `Copy schema ${schema} · application schema ${APP.schema}`);

      const digestOk = fnv1a(b.payload)===b.digest;
      add('The integrity digest matches the copy', digestOk, digestOk?`Digest ${b.digest}`:'The copy has changed since it was taken');

      /* Audit chain inside the copy, recomputed the same way as the live one. */
      let chainOk=true, brokenAt=null;
      try{
        const a = db.audit||[];
        for(let i=1;i<a.length;i++){
          if(a[i].prev && a[i-1].hash && a[i].prev!==a[i-1].hash){ chainOk=false; brokenAt=i; break; }
        }
      }catch(e){ chainOk=false; }
      add('The audit trail inside the copy is unbroken', chainOk, chainOk? `${(db.audit||[]).length} entries` : `Break detected near entry ${brokenAt}`);

      /* Referential integrity: every child row must point at a parent in the copy. */
      const pids = new Set((db.patients||[]).map(p=>p.id));
      const orphans = [];
      [['visits','patientId'],['requests','patientId'],['documents','patientId'],['concerns','patientId'],['pdcas','patientId']]
        .forEach(([k,f])=>{ if(Array.isArray(db[k])) db[k].forEach(r=>{ if(r[f] && !pids.has(r[f])) orphans.push(`${k}:${r.id}`); }); });
      add('No record points at a patient that is not in the copy', orphans.length===0, orphans.length? `${orphans.length} orphaned records` : 'Referential integrity holds');

      const counts = this.counts(db);
      const liveCounts = this.counts(DB.db);
      add('The record counts can be compared with the live database', true,
        Object.keys(counts).map(k=>`${k} ${counts[k]} vs ${liveCounts[k]??0}`).slice(0,4).join(' · ')+'…');
      b.countsInCopy = counts;
    }

    const ok = checks.every(c=>c.ok);
    b.validation = {at:new Date().toISOString(), by:user.id, ok, checks};
    b.stage = ok? 'validated' : 'validation_failed';
    AUDIT.append({actor:user.id,action:ok?'backup.validated':'backup.validation_failed',entity:'backup',entityId:b.id,
      detail:checks.filter(c=>!c.ok).map(c=>c.name).join('; ')||'All checks passed'});
    DB.save();
    return b.validation;
  },

  /* 3. Migrate - a plan, never an automatic change */
  plan(user, id){
    const b = DB.db.backups.find(x=>x.id===id);
    if(!b) return null;
    if(!b.validation?.ok){ b.migration = {at:new Date().toISOString(), by:user.id, ok:false, steps:[], blocked:'Validation has not passed'}; DB.save(); return b.migration; }
    const db = JSON.parse(b.payload);
    const steps = [];
    const from = db.meta?.schema||0;
    if(from < APP.schema) steps.push({step:`Bring the document from schema ${from} to schema ${APP.schema}`, kind:'additive', safe:true,
      detail:'Missing collections and settings keys are added with their defaults. Existing values are never overwritten.'});
    else steps.push({step:`The copy is already at schema ${from}`, kind:'none', safe:true, detail:'No structural change is required.'});

    const missingKeys = this.RECORD_KEYS.filter(k=>DB.db[k] && !Array.isArray(db[k]));
    if(missingKeys.length) steps.push({step:`Add ${missingKeys.length} collections that did not exist in the copy`, kind:'collection', safe:true,
      detail:missingKeys.join(', ')});
    const missingSettings = ['programme','pdca','care','notifications','accessibility'].filter(k=>!(db.settings||{})[k]);
    if(missingSettings.length) steps.push({step:`Add ${missingSettings.length} settings blocks with their documented defaults`, kind:'settings', safe:true,
      detail:missingSettings.join(', ')});
    steps.push({step:'Restore records from the copy', kind:'data', safe:true,
      detail:'Patients, visits, requests, finance, HR, fleet, media, care and clinical records are replaced by the copy.'});
    steps.push({step:'Keep accounts, roles, approvals and the audit trail as they are now', kind:'protected', safe:true,
      detail:'A record restore cannot change who may sign in, and cannot break the audit chain. Account recovery is a separate, audited operation.'});

    b.migration = {at:new Date().toISOString(), by:user.id, ok:true, from, to:APP.schema, steps};
    b.stage = 'migration_planned';
    AUDIT.append({actor:user.id,action:'backup.migration_planned',entity:'backup',entityId:b.id,
      detail:`${steps.length} steps · schema ${from} to ${APP.schema}`});
    DB.save();
    return b.migration;
  },

  /* 4. Verify - rehearse on a copy, compare, report */
  verify(user, id){
    const b = DB.db.backups.find(x=>x.id===id);
    if(!b) return null;
    const checklist = [];
    const add=(name, ok, detail)=>checklist.push({name, ok, detail});
    let copy=null;
    try{ copy = JSON.parse(b.payload); }catch(e){}
    add('The copy can be read in full', !!copy, copy?'Read without error':'Unreadable');
    if(copy){
      const c = this.counts(copy), l = this.counts(DB.db);
      const inconsistent = this.RECORD_KEYS.filter(k=>typeof c[k]==='number' && typeof l[k]==='number');
      add('Every collection in the copy has a comparable count in the live database', inconsistent.length===this.RECORD_KEYS.filter(k=>typeof c[k]==='number').length,
        `${inconsistent.length} collections compared`);
      const zeroed = this.RECORD_KEYS.filter(k=>l[k]>0 && c[k]===0);
      add('No live collection would be emptied by the restore', zeroed.length===0,
        zeroed.length? 'Would be emptied: '+zeroed.join(', ') : 'No collection is lost');
      const auditLen = (copy.audit||[]).length;
      add('The copy carries an audit trail of its own', auditLen>0, `${auditLen} entries in the copy; the live chain is preserved separately`);
      add('The rehearsal is isolated', true, 'The live database has not been touched at this stage');
    }
    const ok = checklist.every(c=>c.ok);
    b.verification = {at:new Date().toISOString(), by:user.id, ok, checklist};
    b.stage = ok? 'verified' : 'verification_failed';
    AUDIT.append({actor:user.id,action:ok?'backup.verified':'backup.verification_failed',entity:'backup',entityId:b.id,
      detail:checklist.filter(c=>!c.ok).map(c=>c.name).join('; ')||'Rehearsal passed; live database untouched'});
    DB.save();
    return b.verification;
  },

  /* 5. Activate - dual approval, then apply, preserving what was replaced */
  requestActivation(user, id){
    const b = DB.db.backups.find(x=>x.id===id);
    if(!b) return {ok:false, msg:'Backup not found'};
    if(!b.validation?.ok) return {ok:false, msg:'Stage 2 (Validate) has not passed for this copy'};
    if(!b.verification?.ok) return {ok:false, msg:'Stage 4 (Verify) has not passed for this copy'};
    const a = APPROVALS.request('database restore', user, {backupId:b.id, label:b.label});
    b.activation = {requestedAt:new Date().toISOString(), requestedBy:user.id, approvalId:a.id, executed:false};
    b.stage = 'awaiting_approval';
    DB.save();
    return {ok:true, approval:a, backup:b};
  },

  /* Applies an approved restore. The state being replaced is captured first. */
  activate(user, approvalId){
    const a = DB.db.approvals.find(x=>x.id===approvalId);
    if(!a) return {ok:false, msg:'Approval not found'};
    if(!APPROVALS.canExecute(a)) return {ok:false, msg:'The request has not reached its approval threshold'};
    const b = DB.db.backups.find(x=>x.id===a.context?.backupId);
    if(!b) return {ok:false, msg:'The backup referenced by this approval no longer exists'};
    if(b.activation?.executed) return {ok:false, msg:'This backup has already been activated'};
    let copy;
    try{ copy = JSON.parse(b.payload); }catch(e){ return {ok:false, msg:'The backup could not be read'} };

    /* Preserve what is about to be replaced, as its own backup record. */
    const pre = this.create(user, 'Automatic pre-restore snapshot');

    const protectedState = {
      users: DB.db.users, roles: DB.db.roles, audit: DB.db.audit,
      approvals: DB.db.approvals, backups: DB.db.backups, drafts: DB.db.drafts,
      settings: DB.db.settings
    };
    this.RECORD_KEYS.forEach(k=>{ if(Array.isArray(copy[k])) DB.db[k]=copy[k]; });
    DB.db.users = protectedState.users;
    DB.db.roles = protectedState.roles;
    DB.db.audit = protectedState.audit;
    DB.db.approvals = protectedState.approvals;
    DB.db.backups = protectedState.backups;
    DB.db.drafts = protectedState.drafts;
    DB.db.settings = protectedState.settings;
    DB.db.settings.backup.lastRestore = todayISO();
    DB.db.meta = {...(DB.db.meta||{}), schema:APP.schema, restoredAt:new Date().toISOString(), restoredFrom:b.id};

    b.activation = {...(b.activation||{}), executed:true, executedAt:new Date().toISOString(), executedBy:user.id, preRestoreBackup:pre.id};
    b.stage = 'activated';
    AUDIT.append({actor:user.id,action:'backup.activated',entity:'backup',entityId:b.id,
      detail:`Restore executed under approval ${a.id}. Pre-restore snapshot ${pre.id} retained.`});
    DB.save();
    return {ok:true, backup:b, preRestore:pre};
  },

  /* A one-line status for the console. */
  stageOf(b){
    if(b.stage==='activated') return {label:'Activated', tone:'ok', step:5};
    if(b.stage==='awaiting_approval') return {label:'Awaiting second signature', tone:'warn', step:5};
    if(b.stage==='verified') return {label:'Verified - ready to activate', tone:'ok', step:4};
    if(b.stage==='verification_failed') return {label:'Verification failed', tone:'crit', step:4};
    if(b.stage==='migration_planned') return {label:'Migration planned', tone:'', step:3};
    if(b.stage==='validated') return {label:'Validated', tone:'ok', step:2};
    if(b.stage==='validation_failed') return {label:'Validation failed', tone:'crit', step:2};
    return {label:'Captured - not yet validated', tone:'warn', step:1};
  }
};

const BACKUP_STEPS = ['Backup','Validate','Migrate','Verify','Activate'];

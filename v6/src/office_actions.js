/* ============================================================
   office_actions.js - Handlers for the v5 workspaces.

   Kept apart from app.js so that the shell stays readable: app.js owns the
   router and the core actions, this file owns the forms, pharmacy, care
   plan, leave, scheduling and export dialogues. They are merged into the
   same registries at the end of app.js and therefore behave identically.
   ============================================================ */

/* Every export says what happened. A file that the browser blocked is not
   reported as saved. */
function reportExport(r){
  if(!r) return;
  if(r.ok) toast('Exported', r.msg||'The file was saved.', 'ok');
  else toast('Not exported', r.msg||'The file could not be written.', 'err');
}

function patientOptions(user){
  return repo.patientList(user).slice(0,200).map(p=>({v:p.id,l:`${p.code} · ${p.name.slice(0,28)}`}));
}
function openPatientPicker(kind, patientId){
  const opts=patientOptions(AUTH.user);
  if(!opts.length) return toast('No patients in scope','Your role has no patient in its scope.','err');
  openModal({title:'Choose the patient', sub:FORM_KINDS[kind]?.title||'', narrow:true,
    body:`<form data-form="choose-form-patient" id="cfpForm"><input type="hidden" name="kind" value="${esc(kind)}">
      ${field('Patient','patientId','select',{options:opts,required:true,value:patientId||''})}
      <div class="note">${ic('info',14)}<span>The form opens with the patient's name and ministry area filled in. Nothing is submitted until you press Submit for verification.</span></div>
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="choose-form-go">Open the form</button>`});
}

const FORMS_ACTIONS = {
  /* ---------------- paper forms ---------------- */
  'new-form':(d)=>openPatientPicker(d.kind, d.patient),
  'new-form-for':(d)=>{
    const kinds=Object.values(FORM_KINDS);
    openModal({title:'Choose the form', sub:'The patient is already chosen.', narrow:true,
      body:`<div class="col" style="gap:8px">${kinds.map(k=>`<button class="btn btn-ghost btn-block" style="justify-content:flex-start" data-act="choose-form-type" data-kind="${k.id}" data-patient="${esc(d.patient)}">
        ${ic('clipboard',15)}<span style="text-align:left"><b>${esc(k.short)}</b><br><span class="xs muted">${esc(k.code)}</span></span></button>`).join('')}</div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>`});
  },
  'choose-form-type':(d)=>{ closeModal(true); openFormEditor(d.kind, d.patient); },
  'choose-form-go':()=>{
    const fd=new FormData(document.querySelector('#cfpForm'));
    if(!fd.get('patientId')) return toast('Choose a patient','','err');
    closeModal(true);
    openFormEditor(fd.get('kind'), fd.get('patientId'));
  },
  'open-form':(d)=>go('form',{id:d.id}),
  'open-forms':(d)=>{
    const k = d.kind || '';
    go('forms', k ? {kind:k} : {});
    if(k){
      const rows = FORMSX.records(AUTH.user, {kind:k});
      if(!rows.length && FORM_KINDS[k]){
        toast(FORM_KINDS[k].short+' opened', 'Showing the '+FORM_KINDS[k].short+' register. Use "+ New" to enter a patient record or "Blank sheet" to view/print the paper template.', 'info');
      }
    }
  },
  'preview-blank-form':(d)=>{
    const meta = FORM_KINDS[d.kind];
    if(!meta) return;
    const blankRec = { id:'BLANK-'+meta.id.toUpperCase(), kind:meta.id, title:meta.title, status:'template', enteredBy:AUTH.user?.id||'', createdAt:todayISO(), data:{} };
    printDoc(meta.title+' (Blank Physical Form Template)', formDoc(blankRec));
  },
  'proofread-form':()=>{
    const f = document.querySelector('#formDoc');
    if(!f) return;
    const fd = new FormData(f);
    const kind = fd.get('kind');
    const data = formDataFrom(fd);
    const v = FORMSX.validate(kind, data);
    const filled = formFields(kind).filter(x=>data[x.k]!==undefined && String(data[x.k]).trim()!=='');
    let box = f.querySelector('#proofreadBanner');
    if(!box){ box = document.createElement('div'); box.id='proofreadBanner'; f.prepend(box); }
    box.innerHTML = `<div class="alert ${v.ok?'ok':'warn'}" style="margin-bottom:12px">
      ${ic(v.ok?'check':'alert',16)}
      <div><b>Offline Proofread Check · ${filled.length} field(s) completed${data.bmi?` · Calculated BMI: ${esc(data.bmi)} kg/m²`:''}</b>
        <div class="xs" style="margin-top:3px">${v.ok ? 'All required Trial Report fields & skip-logic dependencies pass validation. Ready to submit for County Admin Assistant verification.' : 'Please review before submitting: '+v.errors.map(esc).join(' · ')}</div>
      </div>
    </div>`;
    box.scrollIntoView({behavior:'smooth', block:'nearest'});
  },
  'edit-form':(d)=>{
    const rec=(DB.db.formRecords||[]).find(r=>r.id===d.id);
    if(!rec) return;
    openFormEditor(rec.kind, rec.patientId, rec.id);
  },
  'save-form-draft':()=>{
    const f=document.querySelector('#formDoc');
    if(!f) return;
    const fd=new FormData(f); const kind=fd.get('kind');
    const r=FORMSX.saveDraft(AUTH.user,{kind,id:fd.get('recordId'),patientId:fd.get('patientId'),data:formDataFrom(fd)});
    if(!r.ok) return toast('Not saved',r.msg,'err');
    closeModal(true); toast('Draft saved',r.msg,'ok'); render();
  },
  'submit-form':()=>{
    const f=document.querySelector('#formDoc');
    if(!f) return;
    const fd=new FormData(f); const kind=fd.get('kind');
    const r=FORMSX.submit(AUTH.user,{kind,id:fd.get('recordId'),patientId:fd.get('patientId'),data:formDataFrom(fd)});
    if(!r.ok) return toast('Not submitted',r.msg,'err');
    closeModal(true); toast('Submitted',r.msg,'ok'); render();
  },
  'verify-form':(d)=>{
    openModal({title:'Verify against the paper copy', narrow:true,
      body:`<form data-form="verify-form" id="vfForm"><input type="hidden" name="id" value="${esc(d.id)}">
        <p class="small muted">Verifying confirms that every entered value matches the signed paper form. You cannot verify a form you entered yourself.</p>
        ${field('Note (optional)','note','textarea',{hint:'Any discrepancy that was corrected before verification'})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-verify-form">Verify</button>`});
  },
  'submit-verify-form':()=>{
    const fd=new FormData(document.querySelector('#vfForm'));
    const r=FORMSX.verify(AUTH.user, fd.get('id'), fd.get('note')||'');
    if(!r.ok) return toast('Not verified',r.msg,'err');
    closeModal(true); toast('Verified',r.msg,'ok'); render();
  },
  'return-form':(d)=>{
    openModal({title:'Return for correction', narrow:true,
      body:`<form data-form="return-form" id="rfForm"><input type="hidden" name="id" value="${esc(d.id)}">
        ${field('What must be corrected','reason','textarea',{required:true,hint:'Specific and actionable. The person who entered it sees this.'})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-return-form">Return</button>`});
  },
  'submit-return-form':()=>{
    const fd=new FormData(document.querySelector('#rfForm'));
    const r=FORMSX.returnForCorrection(AUTH.user, fd.get('id'), fd.get('reason'));
    if(!r.ok) return toast('Not returned',r.msg,'err');
    closeModal(true); toast('Returned',r.msg,'warn'); render();
  },
  'print-form':(d)=>{
    const rec=(DB.db.formRecords||[]).find(r=>r.id===d.id);
    if(!rec) return;
    printDoc(FORM_KINDS[rec.kind]?.title||'Form', formDoc(rec));
  },
  'do-print':()=>{
    document.body.classList.add('print-mode');
    const done=()=>document.body.classList.remove('print-mode');
    window.addEventListener('afterprint',done,{once:true});
    setTimeout(()=>{ try{ window.print(); }catch(e){ toast('Printing blocked','Open the file in a browser tab to print.','warn'); } finally { setTimeout(done,800); } },60);
  },
  'download-forms-csv':()=>{
    const data=FORMSX.csv(AUTH.user);
    download(`form-records-${todayISO()}.csv`, data);
    toast('Exported','The list, not the clinical content. Open a form to print its full record.','ok');
  },

  /* ---------------- pharmacy ---------------- */
  'receive-stock':()=>{
    const opts=FORMULARY.map(i=>({v:i.id,l:i.name}));
    openModal({title:'Receive stock', sub:'A receipt creates a batch and a ledger entry. Nothing is typed over an existing quantity.', wide:true,
      body:`<form data-form="receive-stock" id="rcvForm">
        <div class="grid g2">
          ${field('Medicine','itemId','select',{options:opts,required:true})}
          ${field('Batch number','batch','text',{required:true})}
          ${field('Expiry date','expiry','date',{required:true})}
          ${field('Quantity','qty','number',{required:true,min:1})}
          ${field('Supplier','supplier','text')}
          ${field('Unit cost (KES)','unitCost','number',{min:0})}
          ${field('County','countyId','select',{options:COUNTIES.map(c=>({v:c.id,l:c.name})),value:AUTH.user.countyId})}
        </div>
        ${field('Note','note','textarea',{hint:'Delivery note number or anything unusual about the batch'})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-receive-stock">Record receipt</button>`});
  },
  'submit-receive-stock':()=>{
    const fd=new FormData(document.querySelector('#rcvForm'));
    const r=RX.receive(AUTH.user,{itemId:fd.get('itemId'),batch:fd.get('batch'),expiry:fd.get('expiry'),
      qty:fd.get('qty'),supplier:fd.get('supplier'),unitCost:fd.get('unitCost'),countyId:fd.get('countyId'),note:fd.get('note')});
    if(!r.ok) return toast('Not recorded',r.msg,'err');
    closeModal(true); toast('Stock received',r.msg,'ok'); render();
  },
  'adjust-stock':(d)=>{
    const lot=(DB.db.stockLots||[]).find(l=>l.id===d.id);
    if(!lot) return;
    openModal({title:'Adjust stock', sub:`${lot.name} · batch ${lot.batch} · ${lot.qty} on hand`, narrow:true,
      body:`<form data-form="adjust-stock" id="adjForm"><input type="hidden" name="lotId" value="${esc(lot.id)}">
        ${field('Change (negative removes)','delta','number',{required:true,hint:'For a breakage enter -2, for a count correction enter the difference.'})}
        ${field('Reason','reason','textarea',{required:true,hint:'A stock adjustment without a written reason is refused.'})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-adjust-stock">Record adjustment</button>`});
  },
  'submit-adjust-stock':()=>{
    const fd=new FormData(document.querySelector('#adjForm'));
    const r=RX.adjust(AUTH.user,{lotId:fd.get('lotId'),delta:fd.get('delta'),reason:fd.get('reason')});
    if(!r.ok) return toast('Not adjusted',r.msg,'err');
    closeModal(true); toast('Stock adjusted',r.msg,'ok'); render();
  },
  'new-prescription':(d={})=>{
    const opts=patientOptions(AUTH.user);
    if(!opts.length) return toast('No patients in scope','','err');
    const itemOpts=[{v:'',l:'None'}].concat(FORMULARY.map(i=>({v:i.id,l:i.name})));
    /* The allergies travel with the name in the picker, so the person writing
       the prescription sees them before choosing a medicine, not after. */
    const allergyOpts=opts.map(o=>{
      const p=DB.db.patients.find(x=>x.id===o.v);
      const a=RX.patientAllergies(p);
      return a.length? {v:o.v, l:`${o.l} - allergy: ${a.join(', ')}`} : o;
    });
    const line=(n)=>`<div class="card" style="box-shadow:none;margin-bottom:8px"><div class="card-b">
      <div class="formgrid">
        <div class="field full"><label>Medicine ${n}</label><select class="input" name="item${n}">${itemOpts.map(o=>`<option value="${o.v}">${esc(o.l)}</option>`).join('')}</select></div>
        <div class="field"><label>Dose</label><input class="input" name="dose${n}" placeholder="e.g. 1 tablet"></div>
        <div class="field"><label>Route</label><input class="input" name="route${n}" value="Oral"></div>
        <div class="field"><label>Frequency</label><input class="input" name="frequency${n}" placeholder="e.g. twice daily"></div>
        <div class="field"><label>Days</label><input class="input" type="number" min="1" name="days${n}"></div>
        <div class="field"><label>Quantity</label><input class="input" type="number" min="1" name="qty${n}"></div>
        <div class="field full"><label>Instructions</label><input class="input" name="instructions${n}" placeholder="e.g. take with food"></div>
      </div></div></div>`;
    openModal({title:'New prescription', sub:'Allergy and interaction checks run before the prescription is recorded.', wide:true,
      body:`<form data-form="prescription" id="rxForm">
        ${allergyOpts.some(o=>/- allergy: /.test(o.l))?`<div class="alert crit" style="margin-bottom:10px">${ic('alert',16)}<div><b>Recorded allergies are shown beside the patient</b><span class="small">A medicine matching a recorded allergy cannot be prescribed. Choose a different medicine; there is no override.</span></div></div>`:''}
        ${field('Patient','patientId','select',{options:allergyOpts,required:true,value:d.patient||''})}
        ${line(1)}${line(2)}${line(3)}
        ${field('Prescribing reason','reason','textarea',{required:true,hint:'The clinical reason, in words. It prints on the prescription.'})}
        ${field('Reason for proceeding past an alert','overrideReason','textarea',{hint:'Only needed when the screen raises an interaction alert.'})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-prescription">Run the checks and prescribe</button>`});
  },
  'submit-prescription':()=>{
    const fd=new FormData(document.querySelector('#rxForm'));
    const lines=[1,2,3].map(n=>({itemId:fd.get('item'+n),dose:fd.get('dose'+n),route:fd.get('route'+n)||'Oral',
      frequency:fd.get('frequency'+n),days:fd.get('days'+n),qty:fd.get('qty'+n),instructions:fd.get('instructions'+n)}))
      .filter(l=>l.itemId);
    const r=RX.prescribe(AUTH.user,{patientId:fd.get('patientId'),lines,reason:fd.get('reason'),overrideReason:fd.get('overrideReason')});
    if(!r.ok) return toast('Not prescribed',r.msg+(r.alerts?` ${r.alerts.map(a=>a.message).join(' ')}`:''),'err');
    closeModal(true);
    toast('Prescribed',r.msg+(r.alerts.length?` ${r.alerts.length} alert(s) recorded with the prescription.`:''),'ok');
    render();
  },
  'open-rx':(d)=>{
    const rx=RX.rx(AUTH.user,d.id);
    if(!rx) return toast('Not available','That prescription is outside your scope.','err');
    const dispensed=(i)=>(rx.dispensed||[]).filter(x=>x.lineIndex===i).reduce((n,x)=>n+x.qty,0);
    openModal({title:'Prescription '+rx.no, wide:true, sub:`${rx.patientName} · ${titleCase(rx.status.replace('_',' '))}`,
      body:`<table class="tbl"><thead><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Days</th><th>Qty</th><th>Dispensed</th></tr></thead>
        <tbody>${rx.lines.map((l,i)=>`<tr><td>${esc(l.name)}</td><td>${esc(l.dose)}</td><td>${esc(l.frequency)}</td><td>${l.days}</td><td>${l.qty}</td><td>${dispensed(i)}</td></tr>`).join('')}</tbody></table>
        <div class="note" style="margin-top:10px">${ic('info',14)}<span><b>Reason.</b> ${esc(rx.reason)}</span></div>
        ${rx.alerts?.length?`<div class="alert warn" style="margin-top:10px">${ic('alert',16)}<div><b>Safety checks</b><span class="small">${rx.alerts.map(a=>esc(a.message)).join(' ')}${rx.overrideReason?` Reason for proceeding: ${esc(rx.overrideReason)}`:''}</span></div></div>`:''}
        ${(rx.dispensed||[]).length?`<div class="divider"></div><div class="small"><b>Dispensed from</b>${rx.dispensed.map(x=>`<div class="xs muted">${esc(FORMULARY_BY_ID[x.itemId]?.name||x.itemId)} · batch ${esc(x.batch)} · expires ${esc(x.expiry)} · ${x.qty}</div>`).join('')}</div>`:''}`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
        <button class="btn btn-ghost" data-act="print-rx" data-id="${rx.id}">${ic('download',14)} Print</button>
        ${!rx.allDispensed&&rx.status!=='cancelled'&&RBAC.has(AUTH.user,'clinical.dispense')?`<button class="btn btn-primary" data-act="dispense-rx" data-id="${rx.id}">Dispense</button>`:''}
        ${rx.status==='prescribed'&&RBAC.has(AUTH.user,'clinical.prescribe')?`<button class="btn btn-ghost" data-act="cancel-rx" data-id="${rx.id}">Cancel</button>`:''}`});
  },
  'dispense-rx':(d)=>{
    const r=RX.dispense(AUTH.user,d.id);
    if(!r.ok){
      if(r.short&&r.short.length){
        openModal({title:'Part of the prescription is out of stock', narrow:true,
          body:`<div class="alert warn">${ic('alert',16)}<div><b>The lot cannot cover the full quantity</b><span class="small">${r.short.map(esc).join(' ')}</span></div></div>
            <form data-form="dispense-note" id="dnForm"><input type="hidden" name="id" value="${esc(d.id)}">
              ${field('Note','note','textarea',{required:true,hint:'What was dispensed, and what the patient was asked to do for the balance.'})}</form>`,
          footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
            <button class="btn btn-primary" data-act="submit-dispense-note">Dispense what is available</button>`});
        return;
      }
      return toast('Not dispensed',r.msg,'err');
    }
    closeModal(true); toast('Dispensed',r.msg,'ok'); render();
  },
  'submit-dispense-note':()=>{
    const fd=new FormData(document.querySelector('#dnForm'));
    const r=RX.dispense(AUTH.user,fd.get('id'),fd.get('note'));
    if(!r.ok) return toast('Not dispensed',r.msg,'err');
    closeModal(true); toast('Partially dispensed',r.msg,'warn'); render();
  },
  'cancel-rx':(d)=>{
    openModal({title:'Cancel the prescription', narrow:true,
      body:`<form data-form="cancel-rx" id="cxForm"><input type="hidden" name="id" value="${esc(d.id)}">
        ${field('Reason','reason','textarea',{required:true})}</form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Back</button>
        <button class="btn btn-danger" data-act="submit-cancel-rx">Cancel prescription</button>`});
  },
  'submit-cancel-rx':()=>{
    const fd=new FormData(document.querySelector('#cxForm'));
    const r=RX.cancel(AUTH.user,fd.get('id'),fd.get('reason'));
    if(!r.ok) return toast('Not cancelled',r.msg,'err');
    closeModal(true); toast('Cancelled',r.msg,'warn'); render();
  },
  'print-rx':(d)=>{
    const rx=RX.rx(AUTH.user,d.id); if(!rx) return;
    printDoc('Prescription '+rx.no, prescriptionDoc(rx));
  },
  'download-stock-csv':()=>{
    download(`stock-${AUTH.user.countyId}-${todayISO()}.csv`, RX.csv(AUTH.user));
    toast('Exported','Stock on hand for your county.','ok');
  },
  'download-stock-xlsx':()=>reportExport(DOCEXPORT.stock(AUTH.user)),

  /* ---------------- care plans ---------------- */
  'new-careplan':(d={})=>{
    const opts=patientOptions(AUTH.user);
    openModal({title:'New care plan', sub:'The template is a starting point. The clinician edits it before approval.', wide:true,
      body:`<form data-form="new-careplan" id="cpForm">
        ${field('Patient','patientId','select',{options:opts,required:true,value:d.patient||''})}
        ${field('Template','templateId','select',{options:OMAHAS.templates().map(t=>({v:t.id,l:t.name}))})}
        ${field('Plan title','title','text',{hint:'Leave empty to use the template name'})}
        <div class="note">${ic('info',14)}<span>Every problem on the template is added with its standard interventions. Remove what does not apply when you edit the plan.</span></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-new-careplan">Create draft</button>`});
  },
  'submit-new-careplan':()=>{
    const fd=new FormData(document.querySelector('#cpForm'));
    const r=OMAHAS.create(AUTH.user,{patientId:fd.get('patientId'),templateId:fd.get('templateId'),title:fd.get('title')});
    if(!r.ok) return toast('Not created',r.msg,'err');
    closeModal(true); toast('Draft created',r.msg,'ok'); go('careplan',{id:r.plan.id});
  },
  'open-careplan':(d)=>go('careplan',{id:d.id}),
  'rate-careplan':(d)=>{
    const plan=OMAHAS.plan(AUTH.user,d.id);
    const row=plan?.problems.find(p=>p.code===d.code);
    if(!row) return;
    const sel=(name,label,val)=>`<div class="field"><label>${label}</label><select class="input" name="${name}">
      ${[1,2,3,4,5].map(n=>`<option value="${n}" ${val===n?'selected':''}>${n} · ${esc(OMAHA_RATING[name][n])}</option>`).join('')}</select></div>`;
    openModal({title:'Rate '+row.problem, sub:'One to five, from worst to best. The rating is the clinical judgement of the person recording it.', narrow:true,
      body:`<form data-form="rate-careplan" id="rcForm"><input type="hidden" name="planId" value="${esc(d.id)}"><input type="hidden" name="code" value="${esc(d.code)}">
        ${sel('knowledge','Knowledge',row.rating.knowledge)}
        ${sel('behaviour','Behaviour',row.rating.behaviour)}
        ${sel('status','Status',row.rating.status)}
        ${field('Note','note','textarea')}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-rate-careplan">Record rating</button>`});
  },
  'submit-rate-careplan':()=>{
    const fd=new FormData(document.querySelector('#rcForm'));
    const r=OMAHAS.rate(AUTH.user,fd.get('planId'),fd.get('code'),
      {knowledge:fd.get('knowledge'),behaviour:fd.get('behaviour'),status:fd.get('status')},fd.get('note'));
    if(!r.ok) return toast('Not recorded',r.msg,'err');
    closeModal(true); toast('Rating recorded','','ok'); render();
  },
  'approve-careplan':(d)=>{
    const plan=OMAHAS.plan(AUTH.user,d.id); if(!plan) return;
    const unrated=plan.problems.filter(p=>!p.rating||Object.values(p.rating).some(v=>!v));
    if(unrated.length) return toast('Not ready','Rate every problem first: '+unrated.map(p=>p.problem).join(', ')+'.','err');
    openModal({title:'Approve the care plan', narrow:true,
      body:`<form data-form="approve-careplan" id="acForm"><input type="hidden" name="id" value="${esc(d.id)}">
        <p class="small muted">Approving makes the plan active and unlocks a PDCA cycle. It is recorded against your name.</p>
        ${field('Approval note','note','textarea')}</form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-approve-careplan">Approve</button>`});
  },
  'submit-approve-careplan':()=>{
    const fd=new FormData(document.querySelector('#acForm'));
    const r=OMAHAS.approve(AUTH.user,fd.get('id'),fd.get('note'));
    if(!r.ok) return toast('Not approved',r.msg,'err');
    closeModal(true); toast('Approved',r.msg,'ok'); render();
  },
  'careplan-pdca':(d)=>{
    const r=OMAHAS.pdca(AUTH.user,d.id);
    if(!r.ok) return toast('Not opened',r.msg,'err');
    toast('PDCA opened',r.msg,'ok'); render();
  },
  'print-careplan':(d)=>{
    const plan=OMAHAS.plan(AUTH.user,d.id); if(!plan) return;
    printDoc('Care plan · '+plan.patientName, OMAHAS.doc(plan));
  },

  /* ---------------- field scheduling ---------------- */
  'propose-schedule':()=>{
    const r=SCHED.propose(AUTH.user,{});
    if(!r.ok) return toast('Not proposed',r.msg,'err');
    const saved=SCHED.save(AUTH.user,r.plan);
    if(!saved.ok) return toast('Not saved',saved.msg,'err');
    toast('Proposal ready',r.msg,'ok');
    go('schedule',{plan:saved.plan.id});
  },
  'save-schedule':(d)=>{
    const plan=(DB.db.scheduleDrafts||[]).find(p=>p.id===d.id);
    if(!plan) return;
    const r=SCHED.save(AUTH.user,plan);
    toast('Draft saved',r.msg,'ok'); render();
  },
  'accept-schedule':(d)=>{
    const r=SCHED.accept(AUTH.user,d.id);
    if(!r.ok) return toast('Not accepted',r.msg,'err');
    toast('Plan accepted',r.msg,'ok'); render();
  },
  'open-schedule':(d)=>go('schedule',{plan:d.id}),
  'download-schedule':(d)=>reportExport(DOCEXPORT.schedule(AUTH.user,d.id)),

  /* ---------------- dashboard arrangement ---------------- */
  'arrange-home':()=>DASH.modal(AUTH.user, DASH.last()),
  'widget-move':(d)=>{ DASH.move(AUTH.user,d.key,d.dir); closeModal(true); DASH.modal(AUTH.user,DASH.last()); render(); },
  'widget-toggle':(d)=>{ DASH.toggle(AUTH.user,d.key); closeModal(true); DASH.modal(AUTH.user,DASH.last()); render(); },
  'widget-reset':()=>{ DASH.reset(AUTH.user); closeModal(true); toast('Arrangement restored','The default order is back.','ok'); render(); },

  /* ---------------- exports ---------------- */
  'export-report-docx':(d)=>reportExport(DOCEXPORT.report(AUTH.user,{type:d.type,countyId:d.countyId})),
  'export-patients-xlsx':()=>reportExport(DOCEXPORT.patients(AUTH.user)),
  'export-registry-xlsx':()=>reportExport(DOCEXPORT.registry(AUTH.user)),
  'download-leave-week':()=>reportExport(DOCEXPORT.leaveWeek(AUTH.user)),

  /* ---------------- leave ---------------- */
  'apply-leave':()=>{
    const hr=RBAC.has(AUTH.user,'hr.view');
    const me=(DB.db.employees||[]).find(e=>e.userId===AUTH.user.id);
    const opts=hr? (DB.db.employees||[]).filter(e=>e.status!=='ended').map(e=>({v:e.id,l:e.name}))
      : (me?[{v:me.id,l:me.name}]:[]);
    if(!opts.length) return toast('No staff record','Your account is not linked to an employee record. Ask the HR Officer to link it.','err');
    openModal({title:'Apply for leave', sub:'The coverage check runs before the request is accepted.', wide:true,
      body:`<form data-form="apply-leave" id="alForm">
        ${field('Staff member','employeeId','select',{options:opts,required:true})}
        ${field('Leave type','type','select',{options:[{v:'annual',l:'Annual'},{v:'casual',l:'Casual'},{v:'sick',l:'Sick'},{v:'compassionate',l:'Compassionate'},{v:'unpaid',l:'Unpaid'}],required:true})}
        <div class="grid g2">${field('From','from','date',{required:true,value:todayISO()})}${field('To','to','date',{required:true,value:todayISO()})}</div>
        ${field('Reason','reason','textarea',{required:true})}
        <label class="checkline"><input type="checkbox" name="emergency"> This is an emergency and the seven-day notice could not be given</label>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-ghost" data-act="check-leave">Check coverage</button>
        <button class="btn btn-primary" data-act="submit-apply-leave">Submit request</button>`});
  },
  'check-leave':()=>{
    const fd=new FormData(document.querySelector('#alForm'));
    const chk=LEAVE.check({employeeId:fd.get('employeeId'),type:fd.get('type'),from:fd.get('from'),to:fd.get('to'),emergency:!!fd.get('emergency')});
    const lines=[...(chk.ok?[{b:'Coverage check passed.'}]:[]),
      ...chk.reasons.map(r=>({t:r})), ...chk.warnings.map(w=>({t:'Warning: '+w}))];
    openModal({title:chk.ok?'The request can be approved':'The request cannot be approved', narrow:true,
      body:`<div class="col" style="gap:8px">${lines.map(l=>`<div class="small">${l.b?`<b>${esc(l.b)}</b>`:'• '+esc(l.t)}</div>`).join('')}
        ${chk.cover.length?`<div class="divider"></div><div class="small"><b>Proposed cover</b>${chk.cover.map(c=>`<div class="xs muted">${esc(c.site)} · ${esc(fmtDate(c.date))} · ${esc(c.coveredByName)} (${esc(c.coverKind)})</div>`).join('')}</div>`:''}
        <div class="small muted">${chk.days} working day(s) in the request.</div></div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Back to the form</button>`});
  },
  'submit-apply-leave':()=>{
    const fd=new FormData(document.querySelector('#alForm'));
    const r=LEAVE.apply(AUTH.user,{employeeId:fd.get('employeeId'),type:fd.get('type'),from:fd.get('from'),
      to:fd.get('to'),reason:fd.get('reason'),emergency:!!fd.get('emergency')});
    if(!r.ok) return toast('Not submitted',r.msg,'err');
    closeModal(true); toast('Request submitted',r.msg,'ok'); render();
  },
  'review-leave':(d)=>{
    const rec=(DB.db.leaveRequests||[]).find(l=>l.id===d.id);
    if(!rec) return;
    const emp=LEAVE.employee(rec.employeeId);
    const chk=LEAVE.check({employeeId:rec.employeeId,type:rec.type,from:rec.from,to:rec.to,emergency:rec.emergency});
    openModal({title:'Leave decision', sub:`${emp?.name||''} · ${titleCase(rec.type)} · ${rec.days} day(s)`, wide:true,
      body:`<dl class="dl">
          <dt>Period</dt><dd>${esc(fmtDate(rec.from))} to ${esc(fmtDate(rec.to))}</dd>
          <dt>Reason</dt><dd>${esc(rec.reason)}</dd>
          <dt>Coverage now</dt><dd>${chk.ok?badge('Covered','b-ok'):badge('Not covered','b-crit')}</dd>
        </dl>
        ${chk.reasons.length?`<div class="alert crit" style="margin-top:10px">${ic('alert',16)}<div><b>Cannot be approved as it stands</b><span class="small">${chk.reasons.map(esc).join(' ')}</span></div></div>`:''}
        ${chk.warnings.length?`<div class="alert warn" style="margin-top:10px">${ic('info',16)}<div><b>Recorded with the decision</b><span class="small">${chk.warnings.map(esc).join(' ')}</span></div></div>`:''}
        ${chk.cover.length?`<div class="small" style="margin-top:8px"><b>Cover to be recorded</b>${chk.cover.map(c=>`<div class="xs muted">${esc(c.site)} · ${esc(fmtDate(c.date))} · ${esc(c.coveredByName)} (${esc(c.coverKind)})</div>`).join('')}</div>`:''}
        <form data-form="leave-decision" id="lvForm"><input type="hidden" name="id" value="${esc(rec.id)}">
          ${field('Decision','decision','select',{options:[{v:'approved',l:'Approve'},{v:'rejected',l:'Decline'}]})}
          ${field('Note','note','textarea',{required:true,hint:'Required for a refusal; recorded on the staff record.'})}
        </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-leave">Record decision</button>`});
  },
  'submit-leave':()=>{
    const fd=new FormData(document.querySelector('#lvForm'));
    const r=LEAVE.decide(AUTH.user, fd.get('id'), fd.get('decision'), fd.get('note'));
    if(!r.ok) return toast('Not recorded',r.msg,'err');
    closeModal(true); toast('Decision recorded',r.msg,'ok'); render();
  }
};

/* Pressing Enter inside any of these dialogues runs the same action as its
   primary button, so a keyboard never leaves a form that does nothing. */
const FORMS_FORMS = {
  'choose-form-patient':()=>ACTIONS['choose-form-go']({}),
  'form-save':()=>ACTIONS['submit-form']({}),
  'verify-form':()=>ACTIONS['submit-verify-form']({}),
  'return-form':()=>ACTIONS['submit-return-form']({}),
  'receive-stock':()=>ACTIONS['submit-receive-stock']({}),
  'adjust-stock':()=>ACTIONS['submit-adjust-stock']({}),
  'prescription':()=>ACTIONS['submit-prescription']({}),
  'cancel-rx':()=>ACTIONS['submit-cancel-rx']({}),
  'new-careplan':()=>ACTIONS['submit-new-careplan']({}),
  'rate-careplan':()=>ACTIONS['submit-rate-careplan']({}),
  'approve-careplan':()=>ACTIONS['submit-approve-careplan']({}),
  'apply-leave':()=>ACTIONS['submit-apply-leave']({}),
  'leave-decision':()=>ACTIONS['submit-leave']({})
};

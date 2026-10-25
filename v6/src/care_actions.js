/* ============================================================
   care_actions.js - Modals and form handlers for the care
   centre, condition register, delegation and care-plan reviews.
   Kept apart from app.js so the shell stays readable.
   ============================================================ */

function openCareLog(residentId){
  const user = AUTH.user;
  const residents = CARE.residents(user);
  if(!residents.length) return toast('No residents in your scope','The care centre register is empty for your role.','warn');
  const shift = new Date().getHours()<12?'Morning':new Date().getHours()<17?'Afternoon':'Evening';
  openModal({ title:'Record daily care', narrow:true,
    sub:'A written handover entry. It is signed with your name and time.',
    body:`<form id="careLogForm" data-form="care-log">
      <div class="field"><label for="clResident">Resident</label>
        <select class="input" id="clResident" name="residentId" required>
          ${residents.map(r=>`<option value="${r.id}" ${residentId===r.id?'selected':''}>${esc(r.patient.code)} · ${esc(r.bedId.replace('bed-','B'))}</option>`).join('')}
        </select></div>
      <div class="field"><label for="clShift">Shift</label>
        <select class="input" id="clShift" name="shift">
          ${['Morning','Afternoon','Evening'].map(s=>`<option ${s===shift?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="grid g2">
        <div class="field"><label for="clEaten">Meal</label>
          <select class="input" id="clEaten" name="eaten">${['All','Most','Half','Refused','Not offered'].map(v=>`<option>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="clFluids">Fluids</label>
          <select class="input" id="clFluids" name="fluids">${['Adequate','Limited','Refused','Encouraged'].map(v=>`<option>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="clMood">Mood</label>
          <select class="input" id="clMood" name="mood">${['Settled','Cheerful','Quiet','Anxious','Distressed'].map(v=>`<option>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="clHygiene">Hygiene</label>
          <select class="input" id="clHygiene" name="hygiene">${['Completed','Assisted','Declined','Not required'].map(v=>`<option>${v}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="clNote">Note</label>
        <textarea class="input" id="clNote" name="note" rows="3" placeholder="Anything the next shift must know."></textarea>
        <div class="hint">Do not record clinical findings here. Use the clinical record for those.</div></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" type="submit">Save entry</button></div>
    </form>`});
}

function submitCareLog(d){
  const r = CARE.addLog(AUTH.user, {
    residentId:d.get('residentId'), shift:d.get('shift'), eaten:d.get('eaten'),
    fluids:d.get('fluids'), hygiene:d.get('hygiene'), mood:d.get('mood'), note:d.get('note')
  });
  if(!r.ok) return toast('Entry not saved', r.msg, 'err');
  closeModal(); toast('Daily entry recorded', `${r.entry.shift} shift · ${r.entry.eaten} meal · ${r.entry.mood}`, 'ok'); render();
}

function openCareIncident(residentId){
  const residents = CARE.residents(AUTH.user);
  if(!residents.length) return toast('No residents in your scope','','warn');
  openModal({ title:'Report a safeguarding incident', narrow:true,
    sub:'This register is restricted. Reading or writing an entry is recorded.',
    body:`<form id="careIncidentForm" data-form="care-incident">
      <div class="field"><label for="ciResident">Resident</label>
        <select class="input" id="ciResident" name="residentId" required>
          ${residents.map(r=>`<option value="${r.id}" ${residentId===r.id?'selected':''}>${esc(r.patient.code)} · ${esc(r.bedId.replace('bed-','B'))}</option>`).join('')}
        </select></div>
      <div class="grid g2">
        <div class="field"><label for="ciType">Type</label>
          <select class="input" id="ciType" name="type">${['Fall','Medication error','Medication delay','Infection control','Missing person','Abuse concern','Property damage','Fire safety','Other'].map(v=>`<option>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="ciSeverity">Severity</label>
          <select class="input" id="ciSeverity" name="severity">${['low','moderate','high','serious'].map(v=>`<option>${v}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="ciActions">Action taken</label>
        <textarea class="input" id="ciActions" name="actions" rows="4" required minlength="10"
          placeholder="What was done, who was informed, and what happens next."></textarea></div>
      <div class="alert warn">${ic('alert',16)}<div><b>Report facts, not conclusions</b>
        <span class="small">Record what happened and what was done. Safeguarding decisions belong to the approved policy and the responsible officer.</span></div></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-danger" type="submit">Record incident</button></div>
    </form>`});
}

function submitCareIncident(d){
  const r = CARE.addIncident(AUTH.user, { residentId:d.get('residentId'), type:d.get('type'),
    severity:d.get('severity'), actions:d.get('actions') });
  if(!r.ok) return toast('Incident not recorded', r.msg, 'err');
  closeModal(); toast('Incident recorded', `${r.inc.type} · ${r.inc.severity}`, 'warn'); render();
}

function openCareIncidentClose(id){
  const inc = (DB.db.careIncidents||[]).find(x=>x.id===id);
  if(!inc) return;
  openModal({ title:'Close incident', narrow:true,
    body:`<form id="ciCloseForm" data-form="care-incident-close">
      <input type="hidden" name="id" value="${esc(id)}">
      <div class="sync-row"><span>Incident</span><b>${esc(inc.type)}</b></div>
      <div class="sync-row"><span>Recorded</span><b>${esc(inc.at.slice(0,10))}</b></div>
      <div class="field" style="margin-top:12px"><label for="ciRes">Resolution</label>
        <textarea class="input" id="ciRes" name="resolution" rows="4" required minlength="10"
          placeholder="What was done, by whom, and what prevents a recurrence."></textarea></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" type="submit">Close with resolution</button></div>
    </form>`});
}

function submitCareIncidentClose(d){
  const r = CARE.closeIncident(AUTH.user, d.get('id'), d.get('resolution'));
  if(!r.ok) return toast('Not closed', r.msg, 'err');
  closeModal(); toast('Incident closed','The resolution is appended; the original entry is unchanged.','ok'); render();
}

/* ---------------- Conditions ---------------- */
function openConditionRecord(patientId){
  const p = repo.patient(AUTH.user, patientId);
  if(!p) return toast('Patient not available','Outside your scope.','err');
  const mayConfirm = RBAC.has(AUTH.user,'condition.confirm');
  openModal({ title:'Record a condition', narrow:true,
    sub:`${p.code} · conditions are recorded deliberately, never inferred.`,
    body:`<form id="condForm" data-form="condition-record">
      <input type="hidden" name="patientId" value="${esc(patientId)}">
      <div class="field"><label for="cdKey">Condition</label>
        <select class="input" id="cdKey" name="key" required>
          ${CONDITION_DEFS.map(c=>`<option value="${c.key}">${esc(c.label)}${c.sensitive?' (sensitive)':''}</option>`).join('')}
        </select></div>
      <div class="field"><label for="cdStatus">Certainty</label>
        <select class="input" id="cdStatus" name="status">
          <option value="suspected">Suspected: needs clinical review</option>
          ${mayConfirm?'<option value="documented">Documented: clinician has recorded it</option><option value="confirmed">Confirmed diagnosis</option>':''}
          <option value="historical">Historical</option>
          <option value="resolved">Resolved</option>
          <option value="follow_up">Requires follow-up</option>
        </select>
        <div class="hint">${mayConfirm?'You may confirm a diagnosis. The confirmation is signed with your name.':'Only a clinician may confirm or document a diagnosis. Record what you observed as suspected.'}</div></div>
      <div class="field"><label for="cdNote">Note</label>
        <textarea class="input" id="cdNote" name="note" rows="3" placeholder="Evidence, referral or observation. Not a diagnosis."></textarea></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" type="submit">Record condition</button></div>
    </form>`});
}

function submitConditionRecord(d){
  const r = COND.record(AUTH.user, { patientId:d.get('patientId'), key:d.get('key'),
    status:d.get('status'), note:d.get('note') });
  if(!r.ok) return toast('Not recorded', r.msg, 'err');
  closeModal(); toast('Condition recorded', r.row.sensitive?'Marked sensitive. Visible only to authorised clinical roles.':'Recorded against your name.','ok');
  render();
}

/* ---------------- Delegation ---------------- */
function openDelegationIssue(){
  const user = AUTH.user;
  const candidates = DB.db.users.filter(u=>u.status==='active' && u.id!==user.id &&
    (isGlobal(user) || u.countyId===user.countyId));
  const myCaps = RBAC.expandedPerms(user.roleId).filter(c=>CAPS[c] && !CAPS[c].dual);
  const today = new Date();
  const to = new Date(today.getTime()+14*86400000);
  openModal({ title:'Issue a delegation', wide:true,
    sub:'Temporary authority for a named colleague. It expires automatically.',
    body:`<form id="delegForm" data-form="delegation-issue">
      <div class="grid g2">
        <div class="field"><label for="dlDelegate">Delegate to</label>
          <select class="input" id="dlDelegate" name="delegateId" required>
            ${candidates.map(u=>`<option value="${u.id}">${esc(u.name.replace(/^Demo - /,''))} · ${esc(u.jobTitle||u.roleId)}</option>`).join('')}
          </select></div>
        <div class="field"><label for="dlDays">Duration</label>
          <select class="input" id="dlDays" name="days">
            ${[3,7,14,30,60,90].map(d=>`<option value="${d}" ${d===14?'selected':''}>${d} days</option>`).join('')}
          </select><div class="hint">Maximum 120 days. A new delegation can follow.</div></div>
      </div>
      <div class="field"><label>Responsibilities</label>
        <div style="max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px">
          ${myCaps.map(c=>`<label class="row" style="gap:9px;padding:6px 4px;align-items:flex-start">
            <input type="checkbox" name="caps" value="${c}">
            <span><b class="small">${esc(CAPS[c].l)}</b><div class="xs muted">${esc(CAPS[c].g)} · ${esc(c)}${CAPS[c].sensitive?' · sensitive':''}</div></span></label>`).join('')}
        </div>
        <div class="hint">Only responsibilities you hold yourself can be delegated.</div></div>
      <div class="field"><label for="dlReason">Reason</label>
        <input class="input" id="dlReason" name="reason" placeholder="For example: county office travel, 20 to 28 October."></div>
      <div class="alert info">${ic('info',16)}<div><b>The audit trail records both people</b>
        <span class="small">Actions taken under delegation are recorded against the delegate's own identity, with the delegating officer named. Nobody shares a password.</span></div></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" type="submit">Issue delegation</button></div>
    </form>`});
}

function submitDelegationIssue(d){
  const caps = d.getAll('caps');
  const days = Number(d.get('days')||14);
  const from = new Date(), to = new Date(from.getTime()+days*86400000);
  const r = DELEGATION.issue(AUTH.user, { delegateId:d.get('delegateId'), caps,
    from:from.toISOString(), to:to.toISOString(), reason:d.get('reason') });
  if(!r.ok) return toast('Delegation not issued', r.msg, 'err');
  closeModal();
  toast('Delegation issued', `${caps.length} responsibilities until ${to.toISOString().slice(0,10)}.`, 'ok');
  render();
}

/* ---------------- Care-plan reviews ---------------- */
function openPdcaComplete(patientId, day){
  const p = repo.patient(AUTH.user, patientId);
  if(!p) return toast('Patient not available','Outside your scope.','err');
  const slot = PDCAX.schedule(p).find(r=>r.day===Number(day));
  if(!slot) return toast('Review not found','','err');
  const slip = Math.round((Date.now()-slot.due.getTime())/86400000);
  openModal({ title:`Complete review · day ${day}`, narrow:true,
    sub:`${p.code} · due ${slot.due.toISOString().slice(0,10)}${slip>0?` · ${slip} days late`:''}`,
    body:`<form id="pdcaForm" data-form="pdca-complete">
      <input type="hidden" name="patientId" value="${esc(patientId)}"><input type="hidden" name="day" value="${day}">
      <div class="field"><label for="pcNote">What was reviewed and agreed</label>
        <textarea class="input" id="pcNote" name="note" rows="4" placeholder="Progress against the care plan, outstanding needs, next actions."></textarea>
        <div class="hint">The original due date is kept. The completion date is recorded separately, so a late review is visible as late.</div></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" type="submit">Record completion</button></div>
    </form>`});
}

function submitPdcaComplete(d){
  const r = PDCAX.complete(AUTH.user, d.get('patientId'), d.get('day'), d.get('note'));
  if(!r.ok) return toast('Not recorded', r.msg, 'err');
  closeModal(); toast('Review recorded','Due date preserved; completion date added.','ok'); render();
}

function openPdcaExtension(patientId){
  const p = repo.patient(AUTH.user, patientId);
  if(!p) return toast('Patient not available','Outside your scope.','err');
  const days = PDCAX.daysInProgramme(p);
  openModal({ title:'Extension review', narrow:true,
    sub:`${p.code} · ${days} days in the programme, beyond the approved threshold.`,
    body:`<form id="extForm" data-form="pdca-extension">
      <input type="hidden" name="patientId" value="${esc(patientId)}">
      <div class="alert warn">${ic('alert',16)}<div><b>Not a discharge decision</b>
        <span class="small">This records why support continues. It does not set a discharge date and does not close the case.</span></div></div>
      <div class="field" style="margin-top:12px"><label for="extNote">Justification</label>
        <textarea class="input" id="extNote" name="note" rows="5" required minlength="20"
          placeholder="Clinical and social reasons the case continues, what is being done, and when it will be reviewed again."></textarea></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" type="submit">Record review</button></div>
    </form>`});
}

function submitPdcaExtension(d){
  const r = PDCAX.recordExtension(AUTH.user, d.get('patientId'), d.get('note'));
  if(!r.ok) return toast('Not recorded', r.msg, 'err');
  closeModal(); toast('Extension review recorded','The justification is in the audit trail.','ok'); render();
}

/* ---------------- AI probe ---------------- */
async function probeAI(){
  const ai = DB.db.settings.ai;
  if(typeof SYNC==='undefined' || SYNC.state!=='connected'){
    APPX.aiProbe = { ok:false, error:'The connection test must run through the served model endpoint. Open the application from its served address.' };
    render(); return;
  }
  APPX.aiProbe = { ok:false, error:'Testing…' };
  render();
  try{
    const r = await fetch('api/ai/probe',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({endpoint:ai.ollama, model:ai.model})});
    APPX.aiProbe = await r.json();
  }catch(e){
    APPX.aiProbe = { ok:false, error:'The server could not complete the test.' };
  }
  AUDIT.append({actor:AUTH.user.id, action:'ai.probe', entity:'setting', entityId:'ai.ollama',
    detail: APPX.aiProbe.ok? 'Endpoint answered' : 'Endpoint did not answer'});
  render();
}

/* Chief-owned Phase 1 security consoles. Display state is ephemeral. The API,
   never DB.devices, an IMEI or a browser fingerprint, grants device access. */
const CANONICAL_HOST = {
  origin:'https://care-link-dims-dev-three.vercel.app',
  isRetired(host){return String(host||'').toLowerCase()==='theqwengacfs.github.io';},
  enforce(){
    if(typeof location==='undefined' || !this.isRetired(location.hostname)) return false;
    const root=document.querySelector('#root');
    if(root) root.innerHTML='<main style="padding:32px;font:18px system-ui"><h1>CareLink has one official host</h1><p>Do not commission or enter staff/patient data on GitHub Pages. Existing local records are not deleted or automatically uploaded.</p><a href="'+this.origin+'/">Open the official CareLink service</a></main>';
    try{if(typeof location.replace==='function') location.replace(this.origin+'/');}catch(_){/* Keep the notice; never fall through to local commissioning. */}
    return true; // boot must stop even if navigation is blocked or offline
  }
};

const ENTRY_ADMIN = {
  devices:[],rows:[],currentDeviceId:'',deviceLoaded:false,rosterLoaded:false,busy:false,error:'',epoch:0,config:{temporaryPasswordDays:7},
  clear(){this.epoch++;this.devices=[];this.rows=[];this.currentDeviceId='';this.deviceLoaded=false;this.rosterLoaded=false;this.busy=false;this.error='';this.config={temporaryPasswordDays:7};if(typeof ENTRY_THEME!=='undefined'){ENTRY_THEME.previewed.clear();ENTRY_THEME.previewId=null;}},
  async request(route,body){
    if(!AUTH.user || AUTH.user.roleId!=='chief' || !SYNC.available()) throw new Error('Use the shared online Chief System Administrator session. Offline/browser-only approval is not supported.');
    const actor=AUTH.user.username,token=SYNC.sessionToken,epoch=this.epoch;
    const r=await SYNC._json('api/admin/'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),timeoutMs:60000});
    if(!AUTH.user || AUTH.user.roleId!=='chief' || AUTH.user.username!==actor || SYNC.sessionToken!==token || this.epoch!==epoch) throw new Error('The Chief session changed; no confidential response was retained.');
    if(!r.ok) throw new Error(r.body.error||'The shared host refused this operation.');
    return r.body;
  },
  async load(kind){
    if(this.busy) return;
    const epoch=this.epoch;
    this.busy=true; this.error='';
    try{
      if(kind==='devices'){
        const result=await this.request('devices'); if(epoch!==this.epoch)return; this.devices=result.devices; this.currentDeviceId=result.currentDeviceId;
      }else{
        const result=await this.request('staff-accounts'); if(epoch!==this.epoch)return; this.rows=result.rows; this.config=result.config;
      }
    }catch(error){if(epoch===this.epoch)this.error=error.message;}
    finally{if(epoch===this.epoch){this.busy=false;if(kind==='devices') this.deviceLoaded=true;else this.rosterLoaded=true;render();}}
  },
  async refreshAfterWrite(result){
    // Do not silently discard a form/outbox just to refresh admin status. The
    // next sync must reconcile the newer revision if local work is still held.
    if(!result.rev || APPX.dirty || SYNC._inflight || SYNC.heldOutbox()) return;
    if(!await SYNC.pullFull({minRev:result.rev})) toast('Change saved; refresh needed','The host confirmed the change. Refresh before the next workspace edit.','warn');
  },
  dialog(operation,data={}){
    if(!AUTH.user || AUTH.user.roleId!=='chief') return;
    const titles={device:'Review registered browser',export:'Confidential staff-account export',revoke:'Revoke an account password',mailbox:'Confirm an existing work mailbox'};
    const username=data.username||'',device=this.devices.find(d=>d.id===data.id);
    const trial = typeof trialEntryActive==='function' && trialEntryActive();
    const extra=operation==='device'
      ? `<input type="hidden" name="deviceId" value="${esc(data.id||'')}"><p>${esc(device?.label||'')} · ${esc(device?.requestedBy||'')} · ${esc(data.id||'')}</p><div class="field"><label>Decision</label><select class="input" name="decision"><option value="approved">Approve</option><option value="rejected">Reject</option><option value="revoked">Revoke approval</option></select></div><p class="small">Confirm the device code and requester through a trusted channel before approving. An IP address or label alone is not identity proof.</p>`
      : operation==='export'
        ? `<p>Source: ${trial?'synthetic trial accounts, not real staff':'official staff roster'}. ${username?'Only @'+esc(username):'All roster seats'}. ${trial?'':'Unconfirmed seats have no credentials. '}Existing private passwords are retained; other selected accounts get new single-use passwords, valid for ${this.config.temporaryPasswordDays} days. Re-issuing invalidates their previous temporary passwords and sessions.</p><label class="lg-check"><input type="checkbox" name="confirm" value="ISSUE TEMPORARY PASSWORDS" required> I authorize issuing temporary passwords and downloading a confidential CSV. I will give each person only their own row and remove the file from shared storage.</label>`
        : operation==='mailbox'
          ? `<p>No address is guessed from a person's name. Confirm existence in the organisation's mail administration before attesting. This does not send a verification email; provider-backed 2FA is Phase 2.</p><div class="field"><label>Existing @lomamofoundation.org mailbox (blank withdraws confirmation)</label><input type="email" class="input" name="email" autocomplete="off" value="${esc(data.email||'')}"></div><div class="field"><label>Type MAILBOX CONFIRMED when recording an existing address</label><input class="input" name="confirm" autocomplete="off"></div>`
          : `<p>Revoke the password and all online sessions for <b>@${esc(username)}</b>. The staff seat stays on the real roster and can receive a newly issued temporary password.</p>`;
    openModal({title:titles[operation],sub:'Server verified · Chief only · every change audited',body:`<form data-form="entry-admin" id="entry-admin-form" autocomplete="off"><input type="hidden" name="operation" value="${operation}"><input type="hidden" name="username" value="${esc(username)}">${extra}<div class="field"><label>Chief private password</label><input class="input" type="password" name="password" autocomplete="current-password" required></div><button class="btn btn-primary" type="submit">${operation==='export'?'Generate & download confidential CSV':'Confirm on shared host'}</button></form>`,footer:'<button class="btn btn-ghost" data-act="close-modal">Cancel</button>'});
  },
  csv(rows){
    const fields=['name','username','roleId','department','county','jobTitle','unconfirmed','email','mailboxConfirmed','credentialStatus','temporaryPassword','expiresAt'];
    const cell=value=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text)) text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    return fields.map(cell).join(',')+'\r\n'+rows.map(row=>fields.map(k=>cell(row[k])).join(',')).join('\r\n');
  }
};
function entryAdminStatus(){
  return ENTRY_ADMIN.error?`<div class="alert crit" role="alert">${esc(ENTRY_ADMIN.error)}</div>`:ENTRY_ADMIN.busy?'<p role="status">Reading the shared server register…</p>':'';
}
function renderDevicesConsole(user){
  if(user.roleId!=='chief') return deniedPanel('system.config');
  if(!ENTRY_ADMIN.deviceLoaded && !ENTRY_ADMIN.busy && AUTH.online) ENTRY_ADMIN.load('devices');
  return `${pageHead('Devices','Phase 1 · server-side approval is mandatory for every staff session. The public portal is open to everyone.')}
    <div class="card"><div class="card-b"><p>After successful account verification, new browsers are registered automatically and do not require prior approval. The Chief can review and revoke a registered browser if needed. Clearing cookies creates a new browser registration.</p><button class="btn btn-sm btn-primary" data-act="entry-admin-refresh" data-kind="devices">Refresh server register</button></div></div>${entryAdminStatus()}
    ${table([{label:'Device / code',render:d=>`<b>${esc(d.label)}</b><div class="xs mono">${esc(d.id.slice(0,12))}${d.id===ENTRY_ADMIN.currentDeviceId?' · this browser':''}</div>`},
      {label:'Type',render:d=>esc(d.type)},{label:'First seen',render:d=>esc(d.firstSeen)},{label:'Requested by',render:d=>esc(d.requestedBy)},
      {label:'Status',render:d=>badge(d.status,d.status==='approved'?'b-ok':d.status==='pending'?'b-warn':'b-crit')},
      {label:'Decision',render:d=>`<button class="btn btn-xs btn-ghost" data-act="entry-device-review" data-id="${esc(d.id)}">Review</button>`}],ENTRY_ADMIN.devices)}
    <p class="small muted">Phase 2 email/SMS one-time codes are not enabled. No mail or SMS provider credentials are stored in this repository. Lost Chief browser? Use the owner-only recovery runbook; there is no public approval bypass.</p>`;
}
function renderStaffAccountsConsole(user){
  if(user.roleId!=='chief') return deniedPanel('system.config');
  if(!ENTRY_ADMIN.rosterLoaded && !ENTRY_ADMIN.busy && AUTH.online) ENTRY_ADMIN.load('staff');
  const trial = typeof trialEntryActive==='function' && trialEntryActive();
  return `${pageHead('Staff credential export',trial?'Synthetic trial seats only · not real staff or mailbox attestations':'Official roster · @lomamofoundation.org only for explicitly confirmed existing mailboxes · no invented people')}
    <div class="card"><div class="card-b"><p>Passwords are generated by the server, stored as salted hashes and an encrypted, server-only export receipt, and shown only in the confidential download response. A temporary password is single-use, expires in the configured period, and cannot open a workspace until replaced. No pack is kept in browser storage.</p><div class="row" style="gap:12px;flex-wrap:wrap"><button class="btn btn-primary" data-act="entry-export-open">Generate roster export</button><button class="btn btn-ghost" data-act="entry-admin-refresh" data-kind="staff">Refresh roster</button></div><form data-form="entry-config" class="row" style="gap:10px;margin-top:16px;align-items:end"><div class="field"><label>Temporary-password validity (days)</label><input class="input" type="number" name="days" min="1" max="30" value="${ENTRY_ADMIN.config.temporaryPasswordDays}" required></div><button class="btn btn-sm btn-ghost" type="submit">Save system.config</button></form></div></div>${entryAdminStatus()}
    ${table([{label:trial?'Synthetic trial account':'Real roster / unconfirmed seat',render:r=>`<b>${esc(r.name)}</b><div class="xs">@${esc(r.username)} · ${esc(r.jobTitle)}</div>${r.unconfirmed?badge('Unconfirmed — no credential','b-warn'):''}`},
      {label:'Work mailbox',render:r=>trial?'<span class="muted">Not used in trial</span>':r.mailboxConfirmed?esc(r.email):'<span class="muted">Not confirmed — no address exported</span>'},
      {label:'Credential',render:r=>esc(r.credentialStatus)},
      {label:'Controls',render:r=>r.unconfirmed?'<span class="xs muted">Confirm seat through roster governance first</span>':`<div class="row" style="flex-wrap:wrap;gap:5px">${trial?'':`<button class="btn btn-xs btn-ghost" data-act="entry-mailbox-open" data-username="${esc(r.username)}" data-email="${esc(r.email)}">Mailbox</button>`}${r.roleId==='chief'?'':`<button class="btn btn-xs btn-ghost" data-act="entry-export-open" data-username="${esc(r.username)}">Issue / export</button><button class="btn btn-xs btn-ghost" data-act="entry-revoke-open" data-username="${esc(r.username)}">Revoke password</button>`}</div>`}],ENTRY_ADMIN.rows)}`;
}
Object.assign(ACTIONS,{
  'entry-admin-refresh':d=>ENTRY_ADMIN.load(d.kind),
  'entry-device-review':d=>ENTRY_ADMIN.dialog('device',d),
  'entry-export-open':d=>ENTRY_ADMIN.dialog('export',d),
  'entry-mailbox-open':d=>ENTRY_ADMIN.dialog('mailbox',d),
  'entry-revoke-open':d=>ENTRY_ADMIN.dialog('revoke',d),
  'reference-master-download':async()=>{
    try{const result=await ENTRY_ADMIN.request('reference-master');downloadText('CareLink-Synthetic-Reference.json',JSON.stringify(result.manifest),'application/json');}
    catch(error){toast('Reference not downloaded',error.message,'err');}
  }
});
Object.assign(FORMS,{
  'entry-admin':async(d,form)=>{
    const submit=form?.querySelector?.('[type="submit"]');
    if(submit?.disabled) return;
    if(submit) submit.disabled=true;
    try{
      const operation=String(d.get('operation')||''),password=String(d.get('password')||''),username=String(d.get('username')||'');
      let result;
      if(operation==='device') result=await ENTRY_ADMIN.request('devices/decision',{password,deviceId:d.get('deviceId'),decision:d.get('decision')});
      else if(operation==='export'){
        result=await ENTRY_ADMIN.request('staff-accounts/export',{password,confirm:d.get('confirm'),...(username?{usernames:[username]}:{})});
        downloadText('CareLink-confidential-staff-'+result.exportId+'.csv',ENTRY_ADMIN.csv(result.rows),'text/csv;charset=utf-8');
      }else if(operation==='revoke') result=await ENTRY_ADMIN.request('staff-accounts/revoke',{password,username});
      else if(operation==='mailbox') result=await ENTRY_ADMIN.request('staff-accounts/mailbox',{password,username,email:d.get('email'),confirm:d.get('confirm')});
      else throw new Error('Unknown security operation.');
      closeModal(true);await ENTRY_ADMIN.refreshAfterWrite(result);await ENTRY_ADMIN.load(operation==='device'?'devices':'staff');
      toast('Confirmed by shared host','The operation is recorded in the server audit trail.','ok');
    }catch(error){toast('Not completed',error.message,'err');}
    finally{if(submit) submit.disabled=false;const password=form?.querySelector?.('[name="password"]');if(password) password.value='';}
  },
  'entry-config':async d=>{
    try{const result=await ENTRY_ADMIN.request('system-config',{temporaryPasswordDays:Number(d.get('days'))});ENTRY_ADMIN.config=result.config;await ENTRY_ADMIN.refreshAfterWrite(result);render();toast('Validity saved','Applies to newly issued temporary passwords; existing expiries are unchanged.','ok');}
    catch(error){toast('Config not saved',error.message,'err');}
  }
});

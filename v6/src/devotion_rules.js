/* Provisional staff devotion workflow. The hosted API is authoritative. */
const DEVOTION_RULES=(()=>{
  const R=typeof CARE_RULES!=='undefined'?CARE_RULES:require('./care_rules.js');
  const OWNED=Object.freeze(['devotionRosters','devotionMeetings','mondaySittingMinutes','devotionCommandReceipts']);
  const STAFF=new Set(['assistant','countyadmin','caregiver','coordinator','chw','mcm','nurse','liaison','homestay','finance','procurement','hr','welfare','vehicle','depthead','me','mediahead','pr','it','auditor','president','chief','director','program.admin','program.assistant']);
  const GLOBAL=new Set(['chief','president','director','program.admin']);
  const active=u=>u&&u.status==='active'&&u.active!==false&&!u.unconfirmed&&STAFF.has(u.roleId);
  const inCounty=(user,county)=>!!user&&STAFF.has(user.roleId)&&(user.countyId===county||GLOBAL.has(user.roleId));
  const visible=(user,record,kind)=>!!record&&inCounty(user,record.countyId)&&
    (kind!=='mondaySittingMinutes'||['assistant','countyadmin','mcm'].includes(user.roleId)&&user.countyId===record.countyId)&&
    (kind!=='devotionMeetings'||record.status==='shared'||record.leaderId===user.id||user.roleId==='assistant'&&user.countyId===record.countyId);
  const pad=n=>String(n).padStart(2,'0');
  const date=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
  // Gregorian computus; these provisional observances are not an official calendar.
  function easter(y){
    const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
    const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
    const n=h+l-7*m+114;return date(y,Math.floor(n/31),n%31+1);
  }
  function specialDays(year){const e=easter(year);return {[R.addDays(e,-46)]:'Ash Wednesday',[R.addDays(e,-2)]:'Good Friday',[R.addDays(e,1)]:'Easter Monday',[date(year,12,25)]:'Christmas Day'};}
  function run(db,user,command,payload={},options={}){
    const now=options.now||new Date().toISOString(), id=options.id||(()=>`devotion-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const fail=(msg,code='devotion_policy_denied',status=400)=>({ok:false,msg,code,status,patches:[]});
    const patch=(c,row)=>({c,id:row.id,set:JSON.parse(JSON.stringify(row))});
    const success=(row,event)=>({ok:true,rec:row,event,patches:[patch(command==='generate'||command==='assign'?'devotionRosters':'devotionMeetings',row)]});
    const county=String(payload.countyId||'');
    if(!user?.id||!inCounty(user,county))return fail('This devotion is outside your staff and county scope.','devotion_scope_denied',403);
    const isAssistant=user.roleId==='assistant'&&user.countyId===county;
    if(command==='monday_minutes'){
      if(!isAssistant)return fail('Only the county assistant can record these minutes.','devotion_assistant_required',403);
      const week=String(payload.week||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||!R.date(week)||new Date(week+'T00:00:00Z').getUTCDay()!==1)return fail('Choose a valid meeting Monday.');
      const old=(db.mondaySittingMinutes||[]).find(m=>m.countyId===county&&m.week===week);
      if((old?.version||0)!==Number(payload.version||0))return fail('Minutes changed. Refresh before saving.','devotion_conflict',409);
      const fields={};
      for(const key of ['secretaryName','attendanceSummary','keyResolutions','customNotes']){
        const value=String(payload[key]||'').trim(),limit=key==='secretaryName'?200:8000;
        if(value.length>limit)return fail('A minutes field is too long; nothing was saved.');fields[key]=value;
      }
      if(!fields.secretaryName)return fail('Enter the recording secretary.');
      const revisions=old?[...(old.revisions||[]),{version:old.version,secretaryName:old.secretaryName,attendanceSummary:old.attendanceSummary,keyResolutions:old.keyResolutions,customNotes:old.customNotes,updatedAt:old.updatedAt,updatedBy:old.updatedBy}]:[];
      const rec={id:`monday-minutes-${county}-${week}`,countyId:county,week,...fields,revisions,template:'provisional-v1',version:(old?.version||0)+1,
        createdAt:old?.createdAt||now,createdBy:old?.createdBy||user.id,updatedAt:now,updatedBy:user.id};
      return {ok:true,rec,event:'monday.minutes_recorded',patches:[patch('mondaySittingMinutes',rec)]};
    }
    if(command==='generate'){
      if(!isAssistant)return fail('Only the county administrative assistant may generate a roster.','devotion_assistant_required',403);
      const year=Number(payload.year),todayYear=Number(R.programDate(now).slice(0,4));
      if(!Number.isInteger(year)||year<todayYear-1||year>todayYear+2)return fail('Choose a roster year within the supported planning window.');
      if((db.devotionRosters||[]).some(r=>r.countyId===county&&r.year===year))return fail('A roster already exists for this county and year.','devotion_roster_exists',409);
      const eligible=(db.users||[]).filter(u=>active(u)&&u.countyId===county&&u.roleId!=='director').sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      if(!eligible.length)return fail('No active eligible staff are available in this county.');
      const directors=(db.users||[]).filter(u=>active(u)&&u.roleId==='director').sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      const director=directors.length===1?directors[0]:null, holidays=specialDays(year), assignments=[];let pool=[],previous='';
      const shuffle=()=>{const a=eligible.slice();for(let i=a.length-1;i>0;i--){const j=options.randomInt?options.randomInt(i+1):Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}if(a.length>1&&a[0].id===previous)[a[0],a[1]]=[a[1],a[0]];return a;};
      for(let d=date(year,1,1);d<=date(year,12,31);d=R.addDays(d,1)){
        const day=new Date(d+'T00:00:00Z').getUTCDay();if(day===0||day===6)continue;
        const special=holidays[d]||'';let leader;
        if(special)leader=director;else{if(!pool.length)pool=shuffle();leader=pool.shift();previous=leader.id;}
        assignments.push({date:d,leaderId:leader?.id||'',special,time:day>=2&&day<=4?'08:30–09:00':'Time not specified'});
      }
      return success({id:`devotion-${county}-${year}`,countyId:county,year,version:1,assignments,createdBy:user.id,createdAt:now,rule:'provisional-weekday-round-robin-v1'},'devotion.roster_generated');
    }
    const day=String(payload.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!R.date(day))return fail('Choose a valid roster date.');
    const roster=(db.devotionRosters||[]).find(r=>r.countyId===county&&r.year===Number(day.slice(0,4)));
    const assignment=roster?.assignments?.find(a=>a.date===day);
    if(!assignment)return fail('This day does not have a generated weekday roster.');
    const previous=(db.devotionMeetings||[]).find(r=>r.countyId===county&&r.date===day);
    if(command==='assign'){
      if(!isAssistant)return fail('Only the county assistant can change an assignment.','devotion_assistant_required',403);
      if(Number(payload.version)!==roster.version)return fail('The roster changed. Refresh before updating.','devotion_conflict',409);
      if(previous)return fail('A devotion record already exists for this assignment; preserve its authorship.','devotion_conflict',409);
      const leader=(db.users||[]).find(u=>u.id===payload.leaderId);
      if(!active(leader)||!(leader.countyId===county||leader.roleId==='director'))return fail('Choose an active eligible staff member.');
      if(assignment.special&&leader.roleId!=='director')return fail('The provisional special-day assignment is reserved for the Country Director.');
      const reason=String(payload.reason||'').trim();if(!reason||reason.length>500)return fail('Record a reason of at most 500 characters.');
      const updated={...roster,version:roster.version+1,assignments:roster.assignments.map(a=>a.date===day?{...a,leaderId:leader.id,changedBy:user.id,changedAt:now,changeReason:reason}:a)};
      return success(updated,'devotion.assignment_changed');
    }
    if(command!=='save'&&command!=='share'&&command!=='closing')return fail('Unknown devotion action.');
    if(!assignment.leaderId)return fail('The roster has no assigned leader for this day.');
    if(command==='closing'?!isAssistant&&user.id!==assignment.leaderId:user.id!==assignment.leaderId)
      return fail('Only the assigned leader can prepare and share; the assistant may record closing prayer.','devotion_leader_required',403);
    if((previous?.version||0)!==Number(payload.version||0))return fail('The devotion record changed. Refresh before saving.','devotion_conflict',409);
    if(previous&&previous.leaderId!==assignment.leaderId)return fail('The recorded leader no longer matches this assignment.','devotion_conflict',409);
    const base=previous||{id:`devotion-meeting-${county}-${day}`,countyId:county,date:day,leaderId:assignment.leaderId,status:'draft',version:0,createdAt:now};
    let record={...base,version:base.version+1,updatedAt:now,updatedBy:user.id};
    if(command==='closing'){
      const closer=(db.users||[]).find(u=>u.id===payload.closingId);
      if(!active(closer)||!(closer.countyId===county||closer.roleId==='director'))return fail('Choose an active staff member who led the closing prayer.');
      record.closingId=closer.id;record.closingRecordedBy=user.id;record.closingRecordedAt=now;
    }else{
      if(command==='save'){
        if(base.status==='shared')return fail('Shared minutes are retained; record a correction through an approved amendment workflow.','devotion_shared_locked',409);
        for(const key of ['reference','prayerNotes','discussion','actions']){const val=String(payload[key]||'').trim();if(val.length>(key==='reference'?200:4000))return fail('A field is too long; nothing was saved.');record[key]=val;}
      }else{
        if(base.status==='shared')return fail('The minutes have already been shared.','devotion_shared_locked',409);
        if(!base.reference||!base.prayerNotes)return fail('Record the Bible reference and prayer notes before sharing.');
        record.status='shared';record.sharedAt=now;record.sharedBy=user.id;
      }
    }
    return success(record,command==='closing'?'devotion.closing_recorded':command==='share'?'devotion.minutes_shared':'devotion.minutes_saved');
  }
  function apply(db,patches){for(const p of patches){const rows=db[p.c]=db[p.c]||[],i=rows.findIndex(r=>r.id===p.id);if(i<0)rows.push(p.set);else rows[i]=p.set;}}
  return {OWNED,STAFF,GLOBAL,active,inCounty,visible,easter,specialDays,run,apply};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=DEVOTION_RULES;

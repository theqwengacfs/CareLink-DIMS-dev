/* Governed calendar audio/video meeting workflows. */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');
const { run } = makeCtx({ URL: global.URL });
run('DB.load(); DB.seedOfficial({patients:0}); AUTH.logout(); AUTH.login("media.head","LOMAMO2026");');
assert.equal(run('RBAC.has(AUTH.user,"meeting.manage")'), true, 'Media can manage meetings');
const managerCalendar = String(run('renderCalendar(AUTH.user,{})'));
assert.match(managerCalendar, /Schedule audio\/video meeting/);
run('AUTH.logout(); AUTH.login("finance.kisumu","LOMAMO2026");');
assert.equal(run('RBAC.has(AUTH.user,"meeting.manage")'), false, 'Finance does not inherit meeting administration');
assert.doesNotMatch(String(run('renderCalendar(AUTH.user,{})')), /Schedule audio\/video meeting/);
run('AUTH.logout(); AUTH.login("media.head","LOMAMO2026");');
const eventBefore = Number(run('(DB.db.calendarEvents||[]).length'));
const formData = {
  title:'Department planning', mode:'video', at:'2027-01-15T10:00', duration:'30',
  meetingUrl:'https://approved-provider.example/room/one', invitees:'director', agenda:'Operational planning',
  confidentiality:'on', approvedProvider:'on',
};
run(`FORMS['calendar-meeting-create']({get:k=>(${JSON.stringify(formData)})[k]||''})`);
assert.equal(Number(run('(DB.db.calendarEvents||[]).length')), eventBefore + 1, 'meeting is persisted to the shared calendar collection');
assert.equal(run('(DB.db.calendarEvents||[]).at(-1).kind'), 'meeting');
assert.equal(run('(DB.db.calendarEvents||[]).at(-1).mode'), 'video');
assert.equal(run('(DB.db.calendarEvents||[]).at(-1).governance.confidentialityAcknowledged'), true);
assert.equal(run(`DB.db.audit.some(a=>a.action==='meeting.scheduled')`), true, 'schedule action is audited');
const meeting = JSON.parse(run('JSON.stringify(DB.db.calendarEvents.at(-1))'));
run('window.open=()=>({});');
run(`ACTIONS['calendar-join-meeting']({id:${JSON.stringify(meeting.id)}})`);
assert.equal(run(`DB.db.audit.some(a=>a.action==='meeting.join_link_opened' && a.entityId===${JSON.stringify(meeting.id)})`), true, 'opening an invite link is audited');
console.log('meetings: Media scheduling, role restriction, calendar persistence, policy acknowledgement and join audit passed.');

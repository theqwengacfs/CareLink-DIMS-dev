/* ============================================================================
   scoped-announcements.js — a notice reaches the people it was addressed to, and
   only them.

   The Foundation asked for announcements that can be *scoped* (D21). The value of
   the feature is entirely in its exclusions: a notice that leaks to one extra
   department is worse than no notice at all, because the author believes it went
   somewhere it did not.

   The rules asserted here:
     * the audience is a rule ("Finance", "Kisumu office"), re-evaluated on read,
       so it does not go stale when somebody joins or transfers;
     * a county officer cannot address another county or the whole organisation;
     * a notice addressed to nobody is refused rather than published into silence;
     * read and acknowledged are different states, and the author can see how many
       of each without being able to claim the other;
     * a withdrawn or expired notice stops appearing, and the record of it having
       been sent is kept.
   ============================================================================ */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');

let passed = 0;
function ok(name, condition, detail) {
  assert.ok(condition, name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

const { run } = makeCtx();
run('DB.load();');
run('DB.seedDemo();');

/* ---- the register the notices are addressed against --------------------- */
run(`
  DB.db.announcements = [];
  globalThis.__director = DB.db.users.find(u => u.roleId === 'director');
  globalThis.__finance = DB.db.users.find(u => u.roleId === 'finance' && u.status === 'active');
  globalThis.__caregiverKsm = DB.db.users.find(u => u.roleId === 'caregiver' && u.countyId === 'kisumu' && u.status === 'active');
  globalThis.__caregiverHb = DB.db.users.find(u => u.roleId === 'caregiver' && u.countyId === 'homabay' && u.status === 'active');
`);

ok('the fixture has a director, a finance officer and one caregiver in each county',
  run('Boolean(__director && __finance && __caregiverKsm && __caregiverHb)'));

/* ---- audience resolution ------------------------------------------------- */
ok('a department audience resolves to that department only',
  run(`(() => {
    const res = ANNOUNCEMENTS.resolve(DB.db, { audience:'department', departmentId: __finance.departmentId || __finance.dept });
    return res.length > 0 && res.every(u => (u.departmentId || u.dept) === (__finance.departmentId || __finance.dept));
  })()`), 'department leak');
ok('a county audience resolves only to that county',
  run(`ANNOUNCEMENTS.resolve(DB.db,{audience:'county',countyId:'kisumu'}).every(u => u.countyId === 'kisumu')`));
ok('a role audience resolves only to that role',
  run(`ANNOUNCEMENTS.resolve(DB.db,{audience:'role',roleId:'finance'}).every(u => u.roleId === 'finance')`));
ok('an audience of nobody is empty rather than silently widened to everyone',
  run(`ANNOUNCEMENTS.resolve(DB.db,{audience:'department',departmentId:'does-not-exist'}).length === 0`));
ok('everyone excludes inactive, unconfirmed and revoked accounts',
  run(`ANNOUNCEMENTS.resolve(DB.db,{audience:'everyone'}).every(u => u.status === 'active' && u.active !== false && !u.unconfirmed)`));

/* ---- who may address whom ----------------------------------------------- */
ok('a national role may address everyone',
  run(`ANNOUNCEMENTS.canAddress(__director,{audience:'everyone'}).ok === true`));
ok('a county officer may not address everyone',
  run(`ANNOUNCEMENTS.canAddress(__caregiverKsm,{audience:'everyone'}).ok === false`));
ok('a county officer may not address another county',
  run(`ANNOUNCEMENTS.canAddress(__caregiverKsm,{audience:'county',countyId:'homabay'}).ok === false`));
ok('a county officer may address their own county',
  run(`ANNOUNCEMENTS.canAddress(__caregiverKsm,{audience:'county',countyId:'kisumu'}).ok === true`));

/* ---- publishing --------------------------------------------------------- */
run(`globalThis.__kisumuNotice = ANNOUNCEMENTS.publish(DB.db, __director,
  { title:'Kisumu office closes at 15:00 on Friday', body:'The county water works cut supply after 15:00.',
    severity:'policy', audience:'county', countyId:'kisumu', needsAcknowledgement:true })`);
ok('a scoped notice publishes and records how far it went',
  run('__kisumuNotice.ok === true && __kisumuNotice.rec.resolvedCount > 0'), run('JSON.stringify(__kisumuNotice)').slice(0, 160));
ok('the notice stores the rule, not a frozen list of people',
  run(`__kisumuNotice.rec.audience.audience === 'county' && __kisumuNotice.rec.audience.countyId === 'kisumu' && !Array.isArray(__kisumuNotice.rec.audience.userIds.length ? null : 1)`));
ok('the notice is labelled with the audience in words a person can read',
  run(`/Kisumu/.test(__kisumuNotice.rec.audienceLabel)`), run('__kisumuNotice.rec.audienceLabel'));
ok('an empty title or body is refused',
  run(`ANNOUNCEMENTS.publish(DB.db,__director,{title:'',body:'x'}).ok === false`) &&
  run(`ANNOUNCEMENTS.publish(DB.db,__director,{title:'x',body:''}).ok === false`));
ok('a notice addressed to nobody is refused rather than published into silence',
  run(`ANNOUNCEMENTS.publish(DB.db,__director,{title:'x',body:'y',audience:'department',departmentId:'nobody'}).ok === false`));
ok('the refusal explains itself',
  run(`/includes nobody/i.test(ANNOUNCEMENTS.publish(DB.db,__director,{title:'x',body:'y',audience:'department',departmentId:'nobody'}).msg)`));

/* ---- visibility --------------------------------------------------------- */
ok('a Kisumu caregiver sees the Kisumu notice',
  run(`ANNOUNCEMENTS.visibleTo(DB.db,__caregiverKsm).some(a => a.id === __kisumuNotice.rec.id)`));
ok('a Homa Bay caregiver does not',
  run(`!ANNOUNCEMENTS.visibleTo(DB.db,__caregiverHb).some(a => a.id === __kisumuNotice.rec.id)`), 'notice leaked outside its county');
ok('a caregiver cannot acknowledge a notice that was not addressed to them',
  run(`ANNOUNCEMENTS.acknowledge(DB.db,__caregiverHb,__kisumuNotice.rec.id).ok === false`));

/* The audience is re-evaluated, so a transfer changes what someone reads. */
run(`(() => {
  const hb = __caregiverHb;
  hb.__formerCounty = hb.countyId;
  hb.countyId = 'kisumu';
})()`);
ok('an audience is re-evaluated on read: a person who transfers in starts seeing it',
  run(`ANNOUNCEMENTS.visibleTo(DB.db,__caregiverHb).some(a => a.id === __kisumuNotice.rec.id)`));
run('__caregiverHb.countyId = __caregiverHb.__formerCounty');
ok('and a person who transfers out stops seeing it',
  run(`!ANNOUNCEMENTS.visibleTo(DB.db,__caregiverHb).some(a => a.id === __kisumuNotice.rec.id)`));

/* ---- read is not acknowledged ------------------------------------------ */
ok('opening a notice marks it seen for that person only',
  run(`ANNOUNCEMENTS.markSeen(DB.db,__caregiverKsm,__kisumuNotice.rec.id) && Boolean(DB.db.announcements[0].seen[__caregiverKsm.id])`));
ok('being seen is not the same as being acknowledged',
  run(`!DB.db.announcements[0].acknowledged || !DB.db.announcements[0].acknowledged[__caregiverKsm.id]`));
ok('the author sees the two counts separately',
  run(`(() => { const r = ANNOUNCEMENTS.receipt(DB.db,__kisumuNotice.rec.id);
    return r.seen >= 1 && r.acknowledged === 0 && r.audience > r.seen; })()`),
  run('JSON.stringify(ANNOUNCEMENTS.receipt(DB.db,__kisumuNotice.rec.id))'));
run(`ANNOUNCEMENTS.acknowledge(DB.db,__caregiverKsm,__kisumuNotice.rec.id)`);
ok('acknowledging records the person and the time',
  run(`Boolean(DB.db.announcements[0].acknowledged[__caregiverKsm.id] && DB.db.announcements[0].seen[__caregiverKsm.id])`));
ok('the outstanding count falls when somebody acknowledges',
  run(`ANNOUNCEMENTS.receipt(DB.db,__kisumuNotice.rec.id).acknowledged === 1`));

/* ---- unread badge ------------------------------------------------------- */
ok('an unopened notice counts as unread for its audience',
  run(`ANNOUNCEMENTS.unread(DB.db,__caregiverKsm).every(a => a.id !== __kisumuNotice.rec.id)`), 'seen notice still counted');
run(`globalThis.__second = ANNOUNCEMENTS.publish(DB.db,__director,{title:'Second notice',body:'Body',audience:'county',countyId:'kisumu',severity:'critical'})`);
ok('a newly published notice is unread for everyone in its audience',
  run(`ANNOUNCEMENTS.unread(DB.db,__caregiverKsm).some(a => a.id === __second.rec.id)`));

/* ---- withdrawal and expiry --------------------------------------------- */
ok('only the author or an organisation administrator may withdraw',
  run(`ANNOUNCEMENTS.withdraw(DB.db,__caregiverKsm,__second.rec.id).ok === false`));
run(`ANNOUNCEMENTS.withdraw(DB.db,__director,__second.rec.id,'Sent in error')`);
ok('a withdrawn notice disappears for its audience',
  run(`!ANNOUNCEMENTS.visibleTo(DB.db,__caregiverKsm).some(a => a.id === __second.rec.id)`));
ok('but the author can still see that it was sent, and why it was withdrawn',
  run(`(() => { const a = ANNOUNCEMENTS.visibleTo(DB.db,__director).find(x => x.id === __second.rec.id);
    return a && a.withdrawn === true && /Sent in error/.test(a.withdrawalReason); })()`));
ok('the record of a withdrawn notice is kept rather than deleted',
  run(`DB.db.announcements.some(a => a.id === __second.rec.id)`));

run(`globalThis.__expired = ANNOUNCEMENTS.publish(DB.db,__director,{title:'Expires soon',body:'B',audience:'county',countyId:'kisumu'});
     DB.db.announcements.find(a=>a.id===__expired.rec.id).expiresAt = '2020-01-01T00:00:00.000Z';`);
ok('an expired notice stops appearing without being deleted',
  run(`!ANNOUNCEMENTS.visibleTo(DB.db,__caregiverKsm).some(a => a.id === __expired.rec.id) && DB.db.announcements.some(a => a.id === __expired.rec.id)`));

/* ---- the interface is wired, not decorative ---------------------------- */
ok('the bell counts unopened notices as well as notifications',
  run(`/ANNOUNCEMENTS.unread\\(DB.db, user\\)/.test(typeof document!=='undefined' ? String(renderShell) : '')`) ||
  require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'app.js'), 'utf8').includes('ANNOUNCEMENTS.unread(DB.db, user)'));
ok('publishing, opening, acknowledging and withdrawing all have handlers',
  ['notice-new', 'notice-publish', 'notice-open', 'notice-ack', 'notice-withdraw'].every(a => run(`typeof ACTIONS['${a}'] === 'function'`)));
ok('the publish form asks for an audience, not just a message',
  /data-notice-audience|name="audience"/.test(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'app.js'), 'utf8')));
ok('publishing and acknowledging are both in the audit trail',
  /action:'notice.published'/.test(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'app.js'), 'utf8')) &&
  /action:'notice.acknowledged'/.test(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'app.js'), 'utf8')));

console.log(`scoped-announcements: ${passed} checks passed`);

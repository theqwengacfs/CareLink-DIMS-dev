/* ============================================================================
   announcements.js — notices addressed to a defined audience, not broadcast.

   The Foundation asked for notifications that can be *scoped* (D21): a message to
   one department, one county, one ministry area, or one named set of people, and
   nothing outside it. A global "everyone" notice is also allowed, but it has to be
   asked for explicitly and it says so on the card.

   Three rules this module enforces, because each one is a way the feature could
   quietly go wrong:

     1. **The audience is resolved on read, never on write.** A notice stores the
        rule ("everyone in Finance", "the Kisumu office", "these five people"),
        not a frozen list of ids. Somebody who joins the department tomorrow reads
        today's notice; somebody who transfers out stops reading it.
     2. **The author must be able to address the audience.** Scoping is only
        meaningful if a caregiver cannot write to the whole country, so the author
        is checked against the audience they are trying to reach.
     3. **Reading is recorded per person.** A notice that has been acknowledged is
        distinguishable from one that has merely scrolled past, which is what makes
        "everybody was told" a claim somebody can check.
   ============================================================================ */
const ANNOUNCEMENTS = (() => {
  const NEEDS_ACK = ['critical', 'policy', 'safeguarding'];
  const SEVERITY = {
    info: { label: 'Information', tone: 'info' },
    policy: { label: 'Policy', tone: 'warn' },
    safeguarding: { label: 'Safeguarding', tone: 'crit' },
    critical: { label: 'Urgent', tone: 'crit' },
  };

  function blank(db) {
    if (!db.announcements) db.announcements = [];
    return db.announcements;
  }

  /* The audience shapes a notice may use. Each is a rule, not a list. */
  const AUDIENCES = {
    everyone: { label: 'Everyone', hint: 'Every active member of staff.' },
    county: { label: 'One county office', hint: 'Active staff whose home office is that county.' },
    department: { label: 'One department', hint: 'Active staff in that department, in any county.' },
    area: { label: 'One ministry area', hint: 'The caregivers, coordinator and MCM responsible for that area.' },
    role: { label: 'One role', hint: 'Every holder of that role.' },
    people: { label: 'Named people', hint: 'Only the people you choose.' },
  };

  function normalise(a) {
    return {
      audience: AUDIENCES[a && a.audience] ? a.audience : 'everyone',
      countyId: (a && a.countyId) || '',
      departmentId: (a && a.departmentId) || (a && a.dept) || '',
      areaId: (a && a.areaId) || '',
      roleId: (a && a.roleId) || '',
      userIds: Array.isArray(a && a.userIds) ? a.userIds.filter(Boolean) : [],
    };
  }

  /* Who a rule actually reaches, evaluated against the register as it is now. */
  function resolve(db, audience) {
    const a = normalise(audience);
    const active = (db.users || []).filter(u => u && u.status === 'active' && u.active !== false && !u.unconfirmed);
    switch (a.audience) {
      case 'county': return active.filter(u => u.countyId === a.countyId);
      case 'department': return active.filter(u => (u.departmentId || u.dept) === a.departmentId);
      case 'role': return active.filter(u => u.roleId === a.roleId);
      case 'people': {
        const set = new Set(a.userIds);
        return active.filter(u => set.has(u.id) || set.has(u.username));
      }
      case 'area': {
        const ids = new Set();
        (db.patients || []).forEach(p => { if (p && p.areaId === a.areaId && p.caregiverId) ids.add(p.caregiverId); });
        return active.filter(u => ids.has(u.id)
          || (u.roleId === 'coordinator' && (u.areaIds || []).includes(a.areaId))
          || (u.roleId === 'mcm' && (db.patients || []).some(p => p && p.areaId === a.areaId && p.countyId === u.countyId)));
      }
      default: return active;
    }
  }

  /* The audience has to be one the author could actually be trusted to define.
     A county officer may address their own county or a subset of it; only a
     global role may address everybody or another county. */
  function canAddress(user, audience) {
    if (!user) return { ok: false, msg: 'No author.' };
    const a = normalise(audience);
    const global = (() => {
      try { return (typeof isGlobal === 'function' ? isGlobal(user) : false) || (roleObj(user.roleId) || {}).scope?.geo === 'global'; } catch (_e) { return false; }
    })();
    if (global) return { ok: true };
    if (a.audience === 'everyone') return { ok: false, msg: 'Only a national role may address everyone.' };
    if (a.audience === 'county' && a.countyId && a.countyId !== user.countyId) {
      return { ok: false, msg: 'You may only address your own county office.' };
    }
    if (a.audience === 'department' && a.departmentId && user.departmentId && a.departmentId !== user.departmentId) {
      return { ok: false, msg: 'You may only address your own department.' };
    }
    return { ok: true };
  }

  /* Publish a notice. The resolved audience size is stored with it so a reader can
     see how far it went, and so a shrinking audience is visible rather than silent. */
  function publish(db, user, input = {}, opts = {}) {
    const title = String(input.title || '').trim();
    const body = String(input.body || '').trim();
    if (!title) return { ok: false, msg: 'Give the notice a title.' };
    if (title.length > 160) return { ok: false, msg: 'The title is too long; nothing was published.' };
    if (!body) return { ok: false, msg: 'Give the notice a body.' };
    if (body.length > 4000) return { ok: false, msg: 'The body is too long; nothing was published.' };
    const audience = normalise(input);
    const allowed = canAddress(user, audience);
    if (!allowed.ok) return { ok: false, msg: allowed.msg };
    const reached = resolve(db, audience);
    if (!reached.length) return { ok: false, msg: 'That audience currently includes nobody, so nothing was published.' };
    const severity = SEVERITY[input.severity] ? input.severity : 'info';
    const now = opts.now || new Date().toISOString();
    const rec = {
      id: opts.id || `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title, body, severity,
      audience,
      audienceLabel: label(db, audience),
      resolvedCount: reached.length,
      needsAcknowledgement: NEEDS_ACK.includes(severity) || Boolean(input.needsAcknowledgement),
      authorId: user.id, authorName: String(user.name || '').replace(/^Demo - /, ''),
      authorRole: (() => { try { return (roleObj(user.roleId) || {}).name || ''; } catch (_e) { return ''; } })(),
      publishedAt: now,
      withdrawn: false,
      /* Read receipts are per person, added as people open the notice. */
      seen: {}, acknowledged: {},
    };
    blank(db).unshift(rec);
    if (db.announcements.length > 500) db.announcements.length = 500;
    return { ok: true, rec };
  }

  function label(db, audience) {
    const a = normalise(audience);
    let name = '';
    try {
      if (a.audience === 'county') name = countyName(a.countyId);
      if (a.audience === 'department') name = (deptObj(a.departmentId) || {}).name || a.departmentId;
      if (a.audience === 'area') name = areaName(a.areaId);
      if (a.audience === 'role') name = (roleObj(a.roleId) || {}).name || a.roleId;
      if (a.audience === 'people') name = `${a.userIds.length} named ${a.userIds.length === 1 ? 'person' : 'people'}`;
    } catch (_e) { name = ''; }
    if (a.audience === 'everyone') return 'Everyone';
    return `${AUDIENCES[a.audience].label}${name ? ' · ' + name : ''}`;
  }

  /* The notices one person may see right now. Withdrawn notices stay visible to
     their author (so they can see the withdrawal took effect) and vanish for
     everybody else. An expired notice stops appearing without being deleted,
     because a notice that was sent is part of the record. */
  function visibleTo(db, user, now = new Date().toISOString()) {
    if (!db || !user) return [];
    return blank(db).filter(a => {
      if (!a) return false;
      if (a.withdrawn) return a.authorId === user.id;
      if (a.expiresAt && String(a.expiresAt) < now) return false;
      return resolve(db, a.audience).some(u => u.id === user.id);
    });
  }

  function markSeen(db, user, id, now = new Date().toISOString()) {
    const rec = blank(db).find(a => a && a.id === id);
    if (!rec || !user) return false;
    if (!resolve(db, rec.audience).some(u => u.id === user.id)) return false;
    rec.seen = rec.seen || {};
    if (!rec.seen[user.id]) rec.seen[user.id] = now;
    return true;
  }

  function acknowledge(db, user, id, now = new Date().toISOString()) {
    const rec = blank(db).find(a => a && a.id === id);
    if (!rec || !user) return { ok: false, msg: 'That notice is no longer available.' };
    if (!resolve(db, rec.audience).some(u => u.id === user.id)) return { ok: false, msg: 'That notice was not addressed to you.' };
    rec.seen = rec.seen || {};
    rec.acknowledged = rec.acknowledged || {};
    rec.seen[user.id] = rec.seen[user.id] || now;
    rec.acknowledged[user.id] = now;
    return { ok: true, rec };
  }

  function withdraw(db, user, id, reason = '') {
    const rec = blank(db).find(a => a && a.id === id);
    if (!rec) return { ok: false, msg: 'That notice no longer exists.' };
    if (rec.authorId !== user.id && !RBAC.has(user, 'org.manage')) {
      return { ok: false, msg: 'Only the author or an organisation administrator may withdraw a notice.' };
    }
    rec.withdrawn = true;
    rec.withdrawnAt = new Date().toISOString();
    rec.withdrawalReason = String(reason || '').slice(0, 300);
    return { ok: true, rec };
  }

  /* How far a notice actually reached, for the author's own view and for audit.
     "Sent to 40 people" and "read by 31" are different statements. */
  function receipt(db, id) {
    const rec = blank(db).find(a => a && a.id === id);
    if (!rec) return null;
    const audience = resolve(db, rec.audience);
    const seen = audience.filter(u => rec.seen && rec.seen[u.id]).length;
    const acknowledged = audience.filter(u => rec.acknowledged && rec.acknowledged[u.id]).length;
    return {
      audience: audience.length,
      seen,
      acknowledged,
      outstanding: rec.needsAcknowledgement ? audience.length - acknowledged : audience.length - seen,
      needsAcknowledgement: rec.needsAcknowledgement,
    };
  }

  /* What the bell shows: unread notices, not unread notification rows. A notice is
     unread until that person has opened it, whatever else they have read. */
  function unread(db, user) {
    return visibleTo(db, user).filter(a => !(a.seen && a.seen[user.id]));
  }

  return { AUDIENCES, SEVERITY, NEEDS_ACK, resolve, canAddress, publish, label, visibleTo,
    markSeen, acknowledge, withdraw, receipt, unread, normalise, blank };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ANNOUNCEMENTS;

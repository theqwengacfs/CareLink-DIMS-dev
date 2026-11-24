/* Server-owned coordination policy. No client-supplied memberships are trusted. */
export function executiveMember(db, sess, defaults=[]) {
  const user=(db.users||[]).find(u=>u.username===sess.username);
  return Boolean(user && user.active!==false && user.status==='active' &&
    (['chief','director','president'].includes(sess.roleId)||user.execTeam===true||defaults.includes(sess.username)));
}
export function referralVisible(record,sess,db) {
  if(!record)return false;
  if(sess.roleId==='ccc.clinician')return record.referredByUsername===sess.username;
  if(!['mcm','nurse','liaison','countyadmin','assistant','caregiver','coordinator','chw'].includes(sess.roleId))return false;
  if(sess.roleId==='mcm'&&sess.username==='mcm.kisumu')return ['kisumu','homabay'].includes(record.countyId);
  if(record.countyId!==sess.countyId)return false;
  const user=(db.users||[]).find(u=>u.username===sess.username);
  return !['caregiver','coordinator','chw'].includes(sess.roleId)||(user?.areaIds||[]).includes(record.areaId);
}
export function canSubmitMasterReport(record,sess,db){
  return ['mcm','nurse','liaison','countyadmin','assistant'].includes(sess.roleId)&&referralVisible(record,sess,db);
}

export const BOARD_ROLES=new Set(['founder','cofounder','board.member','intl.advisory','intl.finance','intl.legal','intl.data']);
export function boardSnapshot(db,sess){
 const member=(db.users||[]).find(u=>u.username===sess.username)||{};
 const counties=(Array.isArray(member.oversightCounties)?member.oversightCounties:[sess.countyId]).filter(c=>['kisumu','homabay'].includes(c));
 const patients=(db.patients||[]).filter(p=>counties.includes(p.countyId));
 const users=(db.users||[]).filter(u=>BOARD_ROLES.has(u.roleId)&&u.status==='active'&&u.active!==false).map(u=>({id:u.id,name:u.name,username:u.username,roleId:u.roleId,status:u.status,countyId:u.countyId}));
 const presence={};for(const user of users){const p=db.presence?.[user.id];if(p)presence[user.id]={at:p.at,state:p.state};}
 return {...Object.fromEntries(Object.entries(db).filter(([,v])=>Array.isArray(v)).map(([k])=>[k,[]])),meta:{version:db.meta?.version},users,presence,settings:{landingTheme:db.settings?.landingTheme},personalPrefs:db.personalPrefs?.[sess.userId]?{[sess.userId]:db.personalPrefs[sess.userId]}:{},oversightSummary:{counties,registered:patients.length,active:patients.filter(p=>['active','extension'].includes(p.status)).length},messages:[],notifications:[],teamCalls:[]};
}

const assert=require('node:assert/strict');
const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.db=DB.blank();');
const landing=run('renderLanding6()');
assert.ok(!landing.includes('ld-department-list'));
assert.ok(!landing.includes('Explore all 11'));
assert.ok(landing.includes('11 Major Departments'));
const directory=run('renderArchitecture6()');
for(const name of JSON.parse(run('JSON.stringify(MAJOR_DEPARTMENTS.map(d=>esc(d.name)))'))) assert.ok(directory.includes(name),name);
assert.ok(directory.includes('aria-label="All 11 major departments"'));
const svg=run('renderLandingWorkflow6()');
const nodes=[...svg.matchAll(/data-workflow-node="([^"]+)"[\s\S]*?<rect x="([\d.]+)" y="([\d.]+)" width="112" height="26" rx="13"\/>\s*<circle cx="([\d.]+)" cy="([\d.]+)" r="2.6"[^>]*\/>\s*<text x="([\d.]+)" y="([\d.]+)" dy=".35em" text-anchor="start">/g)];
assert.equal(nodes.length,8);
for(const [,name,rx,ry,cx,cy,tx,ty] of nodes){
 assert.equal(+cx-(+rx),12,name+' marker inset');
 assert.equal(+tx-(+cx),10,name+' consistent marker/text spacing');
 assert.equal(+cy,+ty,name+' vertical alignment');
 assert.equal(+cy-(+ry),13,name+' centred marker');
}
const centres=nodes.map(n=>[+n[2]+56,+n[3]+13]);
for(const [x,y] of centres) assert.ok(centres.some(([xx,yy])=>xx===460-x&&yy===224-y),'point symmetry for '+x+','+y);
console.log('Landing polish: uncluttered graphic, relocated 11-department directory, eight equal marker gaps and symmetric node geometry passed.');

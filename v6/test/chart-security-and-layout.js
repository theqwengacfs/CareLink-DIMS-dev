/* Synthetic output checks: user-supplied labels and formatted values stay text. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {run}=require('./dom').makeCtx();
const payload='\" data-injected=\"yes <svg onload=alert(1)>';
const input=JSON.stringify(payload);
const expressions=[
  `chartDonut([{label:${input},value:42}],{title:${input},fmt:()=>${input}})`,
  `chartShare([{label:${input},value:42}],{title:${input},fmt:()=>${input}})`,
  `chartStacked({labels:['One'],series:[{label:'Test',values:[42]}],fmt:()=>${input}})`,
  `chartGrouped({labels:['One'],series:[{label:'Test',values:[42]}],fmt:()=>${input}})`,
  `chartGauge(42,100,{label:'Test',fmt:()=>${input}})`,
  `chartWaterfall([{label:'Test',value:42}],{fmt:()=>${input}})`
];
for(const expression of expressions){
  const html=run(expression);
  assert(!html.includes(payload),'untrusted text must never appear as raw HTML or attribute syntax');
  assert(html.includes('&lt;svg onload=alert(1)&gt;'),'escaped values remain visible to the user');
}
for(const expression of [
  "chartBars({rows:[{label:'Synthetic',value:42}]})",
  "chartLine({labels:['One'],series:[{label:'Synthetic',values:[42]}]})",
  "chartStacked({labels:['One'],series:[{label:'Synthetic',values:[42]}]})",
  "chartGrouped({labels:['One'],series:[{label:'Synthetic',values:[42]}]})",
  "chartWaterfall([{label:'Synthetic',value:42}])"
]){
  const html=run(expression);
  assert.match(html,/class="chart-plot" tabindex="0" role="region"/,'chart plot is keyboard-scrollable');
  assert.match(html,/details class="chart-table/,'complete data table remains available');
}
const css=fs.readFileSync('v6/src/carelink63.css','utf8');
assert.match(css,/@container \(max-width: 460px\)/);
assert.match(css,/@media print\{\s*\.chart-plot\{overflow:visible;\}/);
assert.match(css,/\.gov67-sec-meta\{display:flex; flex-wrap:wrap/);
run('DB.db=DB.blank();APPX.params={};');
const policy=run(`CARELINK_GOVERNANCE.renderGovernancePolicyCenter({id:'synthetic',roleId:'mediahead',countyId:'kisumu'},{tab:'charter'})`);
assert.match(policy,/gov67-sec-meta/);assert.match(policy,/gov67-sec-visibility/);
console.log('Chart safety and layout: malicious labels/formatters escaped, keyboard plots, tables, responsive printing and policy metadata passed.');

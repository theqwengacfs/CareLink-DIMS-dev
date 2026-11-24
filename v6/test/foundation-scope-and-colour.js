const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync('v6/src/'+name,'utf8');
const c={};vm.createContext(c);vm.runInContext(read('portal_content.js'),c);
const portal=vm.runInContext('PORTAL_CONTENT',c);
assert(!portal.pillars.some(p=>p.id==='education'));
assert(portal.pillars.some(p=>p.id==='nutrition'));
assert(!portal.gallery.some(p=>p.key==='children_school'));
assert(!read('media_portal.js').includes('"children_school":'));
assert(!fs.readFileSync('v6/tools/pack_portal_media.py','utf8').includes('children_school'));
assert(!/school support for children|Keeping children in school|Children kept in school/.test(JSON.stringify(portal)));
for(const file of ['data.js','data6.js','handover_partners6.js','omaha.js','strategic_governance67.js']) {
 assert(!/school(?:ing)? continuity|education continuity|retained in school|school re-entry|school support|schooling protection/.test(read(file)),file+' has no schooling-care claims');
}
// Health education and clinical demographic history are not schooling support.
assert(read('care_rules.js').includes('educationCounselling'));
assert(read('forms.js').includes('Education history'));
assert(read('themes.js').includes("const WT_DEFAULT = 'foundation'"));
const css=read('entry_theme.css').split('/* Foundation White / vivid workspace accents.')[1];
assert(css.includes('html[data-wt="foundation"]'));
assert(css.includes('.ws67-greeting'));assert(css.includes('.rc68-tile-ic'));assert(css.includes('.modal .modal-h'));
assert(css.includes('.ws67-qcard:not(.is-alert)'));assert(css.includes(':focus-visible'));
// Each decorative solid fill uses white text with WCAG AA normal-text contrast.
function lum(hex){const v=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;}
for(const fill of ['1e40af','0f655d','6d28a8','a51d4c','854d0e','14233e']) assert(1.05/(lum(fill)+.05)>=4.5,fill+' contrast');
console.log('Foundation scope, default theme, accent coverage, alert exclusions and solid-fill contrast checks passed.');

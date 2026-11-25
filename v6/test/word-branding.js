const assert=require('node:assert/strict'),fs=require('node:fs');
const {run}=require('./dom').makeCtx();
const logo=fs.readFileSync('v6/assets/lomamo-logo.png');
run(`window.LOGO=${JSON.stringify('data:image/png;base64,'+logo.toString('base64'))};DB.load();DB.seedDemo();AUTH.user=DB.db.users.find(u=>u.roleId==='mcm');`);
run(`globalThis.fixture={fields:CARE_RULES.cleanFields({patientName:'Synthetic <Patient>',plan:'Synthetic plan'}),report:{version:1},patient_code:'SYN-1',report_title:'Synthetic PDCA',cycleId:'synthetic',status:'draft',mode:'120day'};`);
function unzip(bytes){const b=Buffer.from(bytes),out={};let i=0;while(b.readUInt32LE(i)===0x04034b50){const n=b.readUInt16LE(i+26),e=b.readUInt16LE(i+28),size=b.readUInt32LE(i+18),start=i+30+n+e;out[b.toString('utf8',i+30,i+30+n)]=b.subarray(start,start+size);i=start+size;}return out;}
for(const expression of ['CARE_REVIEW.wordBytes(fixture)',`DOCX.fromHtml('Synthetic report','<p>Synthetic findings</p>')`]){
 const files=unzip(run(expression)),xml=files['word/document.xml'].toString();
 assert.deepEqual(files['word/media/logo.png'],logo);assert(xml.includes('r:embed="rId2"'));assert(xml.includes('LOMAMO FOUNDATION KENYA'));
 assert(files['word/_rels/document.xml.rels'].toString().includes('Target="media/logo.png"'));assert(files['[Content_Types].xml'].toString().includes('ContentType="image/png"'));
}
const pdca=unzip(run('CARE_REVIEW.wordBytes(fixture)'))['word/document.xml'].toString();
assert.equal((pdca.match(/<w:drawing /g)||[]).length,2);assert(pdca.includes('Synthetic &lt;Patient&gt;'));
run(`window.LOGO='data:image/png;base64,c3ludGhldGlj';`);
assert(!unzip(run('CARE_REVIEW.wordBytes(fixture)'))['word/media/logo.png']);
console.log('Word branding: real foundation PNG embedded in PDCA and shared Word exports, relationships, MIME type, escaping and invalid-image fallback passed.');

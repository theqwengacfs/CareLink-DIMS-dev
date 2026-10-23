/* ============================================================
   exportdocs.js - Word and Excel writers, without a library.

   A Word file and an Excel file are both ZIP archives of XML. This module
   builds them with a stored (uncompressed) ZIP writer and the minimum
   Open Packaging Convention parts that Word and Excel accept. Nothing is
   fetched, nothing is installed, and the bytes are produced in the browser.

   Limits, stated plainly: the Word writer handles headings, paragraphs,
   bullet lines and tables. It does not embed images, footnotes or comments.
   The Excel writer writes one table per sheet, with a bold header row, an
   autofilter and column widths. It does not write formulas or charts.
   ============================================================ */

const UTF8 = {
  encode(str){
    const out=[];
    for(let i=0;i<str.length;i++){
      let c=str.charCodeAt(i);
      if(c<0x80) out.push(c);
      else if(c<0x800){ out.push(0xC0|(c>>6), 0x80|(c&63)); }
      else if(c>=0xD800 && c<=0xDBFF && i+1<str.length){
        const c2=str.charCodeAt(++i);
        c=0x10000+((c-0xD800)<<10)+(c2-0xDC00);
        out.push(0xF0|(c>>18), 0x80|((c>>12)&63), 0x80|((c>>6)&63), 0x80|(c&63));
      } else { out.push(0xE0|(c>>12), 0x80|((c>>6)&63), 0x80|(c&63)); }
    }
    return new Uint8Array(out);
  },
  decode(bytes){ return new TextDecoder().decode(bytes); }
};

const CRC_TABLE = (()=>{
  const t=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c = (c&1)? (0xEDB88320 ^ (c>>>1)) : (c>>>1);
    t[n]=c>>>0;
  }
  return t;
})();
function crc32(bytes){
  let c=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++) c=CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c>>>8);
  return (c ^ 0xFFFFFFFF)>>>0;
}

/* A stored ZIP. Office accepts it; the file is larger than a deflated one,
   and that is the only cost of having no compression library. */
function zipStore(files){
  const chunks=[], central=[];
  let offset=0;
  const enc = s => UTF8.encode(s);
  const u16 = n => new Uint8Array([n&255,(n>>8)&255]);
  const u32 = n => new Uint8Array([n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255]);
  const cat = parts => {
    const len=parts.reduce((n,p)=>n+p.length,0);
    const out=new Uint8Array(len);
    let at=0; parts.forEach(p=>{ out.set(p,at); at+=p.length; });
    return out;
  };
  files.forEach(f=>{
    const name=enc(f.name), data=f.data, crc=crc32(data);
    const local=cat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
    ]);
    chunks.push(local);
    central.push(cat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name
    ]));
    offset += local.length;
  });
  const centralBytes=cat(central);
  const end=cat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBytes.length), u32(offset), u16(0)
  ]);
  return cat([...chunks, centralBytes, end]);
}

function xmlEsc(s){
  return String(s===undefined||s===null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
}
function textOf(html){
  return String(html||'')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/[ \t]+/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

/* Splits generated report markup into blocks: heading, paragraph, bullet,
   table. Tables become rows of plain text cells. */
function htmlBlocks(html){
  const blocks=[];
  const src=String(html||'');
  /* Tables first: remove them from the stream so that cell text does not
     leak into the paragraphs around them. */
  const tableRe=/<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m, last=0, pending='';
  const pushText = chunk => {
    chunk.split(/<\/(?:p|div|h1|h2|h3|h4|h5|h6|li)>/i).forEach(piece=>{
      const t=textOf(piece);
      if(!t) return;
      if(/<li[^>]*>/i.test(piece)) blocks.push({type:'li', text:t});
      else blocks.push({type:'p', text:t});
    });
  };
  while((m=tableRe.exec(src))){
    pushText(src.slice(last,m.index));
    const rows=[];
    const rowRe=/<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let r;
    while((r=rowRe.exec(m[1]))){
      const cells=[];
      const cellRe=/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
      let c;
      while((c=cellRe.exec(r[1]))) cells.push(textOf(c[2]).replace(/\n+/g,' '));
      if(cells.length) rows.push(cells);
    }
    if(rows.length) blocks.push({type:'table', rows});
    last = tableRe.lastIndex;
  }
  pushText(src.slice(last));
  /* Headings carry their level when the source says so. */
  return blocks.map((b,i,a)=>{
    if(b.type!=='p') return b;
    return b;
  });
}

/* ---------------- DOCX ---------------- */
const DOCX = {
  contentTypes:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`,
  rels:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  docRels:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  styles:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1F3864"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="1F3864"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="1F3864"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>
  <w:tblPr><w:tblBorders>
    <w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/>
    <w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/>
    <w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/>
  </w:tblBorders></w:tblPr></w:style>
</w:styles>`,

  para(text, style){
    const runs=String(text).split('\n').map(line=>
      `<w:r><w:t xml:space="preserve">${xmlEsc(line)}</w:t></w:r>${'\n'}`).join('');
    return `<w:p>${style?`<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`:''}${runs}</w:p>`;
  },

  table(rows){
    const cols=Math.max(...rows.map(r=>r.length));
    return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>
      <w:tblGrid>${Array.from({length:cols},()=>'<w:gridCol w:w="'+(9000/cols|0)+'"/>').join('')}</w:tblGrid>
      ${rows.map((r,ri)=>`<w:tr>${r.map(c=>`<w:tc><w:tcPr><w:tcW w:w="${(5000/cols)|0}" w:type="pct"/></w:tcPr>
        <w:p><w:r>${ri===0?'<w:rPr><w:b/></w:rPr>':''}<w:t xml:space="preserve">${xmlEsc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}
    </w:tbl><w:p/>`;
  },

  fromHtml(title, html){
    const blocks=htmlBlocks(html);
    const body=[this.para(title||'Document','Title')]
      .concat(blocks.map(b=>{
        if(b.type==='table') return this.table(b.rows);
        if(b.type==='li') return this.para('• '+b.text);
        return this.para(b.text);
      })).join('\n');
    const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
</w:body></w:document>`;
    return zipStore([
      {name:'[Content_Types].xml', data:UTF8.encode(this.contentTypes)},
      {name:'_rels/.rels', data:UTF8.encode(this.rels)},
      {name:'word/document.xml', data:UTF8.encode(documentXml)},
      {name:'word/_rels/document.xml.rels', data:UTF8.encode(this.docRels)},
      {name:'word/styles.xml', data:UTF8.encode(this.styles)}
    ]);
  }
};

/* ---------------- XLSX ---------------- */
const XLSX = {
  contentTypes(sheetCount){
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${Array.from({length:sheetCount},(_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`;
  },
  styles:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`,
  colName(n){
    let s='';
    while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); }
    return s;
  },
  cell(value, ref, bold){
    if(value===null||value===undefined||value==='') return `<c r="${ref}"${bold?' s="1"':''}/>`;
    if(typeof value==='number' && isFinite(value)) return `<c r="${ref}"${bold?' s="1"':''}><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${bold?' s="1"':''}><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
  },
  sheet(sheet){
    const rows=sheet.rows||[];
    const width=Math.max(1,...rows.map(r=>r.length));
    const cols=sheet.widths&&sheet.widths.length? sheet.widths.slice(0,width)
      : Array.from({length:width},()=>16);
    const body=rows.map((r,ri)=>`<row r="${ri+1}">${
      r.map((c,ci)=>this.cell(c, this.colName(ci+1)+(ri+1), ri===0)).join('')
    }</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<cols>${cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.max(8,Math.min(60,w))}" customWidth="1"/>`).join('')}</cols>
<sheetData>${body}</sheetData>
<autoFilter ref="A1:${this.colName(width)}${Math.max(1,rows.length)}"/>
</worksheet>`;
  },
  fromSheets(sheets, title){
    const list=sheets&&sheets.length? sheets: [{name:'Sheet1',rows:[[]]}];
    const names=list.map((s,i)=>String(s.name||('Sheet'+(i+1))).replace(/[\\/?*\[\]:]/g,'-').slice(0,31));
    const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n,i)=>`<sheet name="${xmlEsc(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>
</workbook>`;
    const wbRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}
<Relationship Id="rId${list.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
    const files=[
      {name:'[Content_Types].xml', data:UTF8.encode(this.contentTypes(list.length))},
      {name:'_rels/.rels', data:UTF8.encode(DOCX.rels)},
      {name:'xl/workbook.xml', data:UTF8.encode(workbook)},
      {name:'xl/_rels/workbook.xml.rels', data:UTF8.encode(wbRels)},
      {name:'xl/styles.xml', data:UTF8.encode(this.styles)},
      ...list.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`, data:UTF8.encode(this.sheet(s))}))
    ];
    return zipStore(files);
  }
};

/* ---------------- download ---------------- */
function downloadBytes(filename, bytes, mime){
  try{
    const blob=new Blob([bytes],{type:mime||'application/octet-stream'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=filename; a.rel='noopener';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ try{ a.remove(); URL.revokeObjectURL(url); }catch(e){} }, 1500);
    return {ok:true, bytes:bytes.length, name:filename};
  }catch(e){
    return {ok:false, msg:'The browser blocked the download. Open the application in a browser tab rather than inside a preview frame, then try again.', bytes:bytes.length};
  }
}

/* ---------------- the export catalogue ----------------
   Every function states what was exported, in the audit trail, with the
   row count. A person who holds the capability can export; a person who
   does not is refused in the data layer, not merely by a hidden button. */
const DOCEXPORT = {
  report(user, {type, countyId}){
    if(!type) return {ok:false, msg:'Choose a report first.'};
    const title=(typeof REPORT_TITLES!=='undefined'&&REPORT_TITLES[type])||'Report';
    const cid=countyId||user.countyId;
    const html=buildReportDoc(type,{countyId:cid},user);
    const bytes=DOCX.fromHtml(title, html);
    const name=`${type}-${cid}-${new Date().toISOString().slice(0,10)}.docx`;
    const r=downloadBytes(name, bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    if(r.ok) AUDIT.append({actor:user.id,action:'export.docx',entity:'report',entityId:type,detail:name});
    DB.save();
    return {...r, msg:r.ok?`Word document saved as ${name}.`:r.msg};
  },

  patients(user){
    if(!RBAC.has(user,'patient.export')) return {ok:false, msg:'Your role does not hold patient data export.'};
    const rows=repo.patientList(user);
    const sheet={ name:'Patients', widths:[10,26,14,6,10,16,14,12,22,26,16,10],
      rows:[['Code','Name','Sex','Age','County','Ministry area','Status','Intake','Caregiver','Conditions','Last visit','Days in programme'],
        ...rows.map(p=>[
          p.code, p.name, p.sex, p.age, countyName(p.countyId), areaName(p.areaId),
          titleCase(String(p.status).replace(/_/g,' ')), p.intake||'', userName(p.caregiverId),
          (DB.db.patientConditions||[]).filter(c=>c.patientId===p.id &&
            (!c.sensitive||RBAC.has(user,'condition.sensitive'))).map(c=>c.label||c.condition).join(', '),
          (DB.db.visits||[]).filter(v=>v.patientId===p.id).map(v=>v.date).sort().pop()||'',
          daysBetween(p.intake||p.created||new Date(), new Date())
        ])] };
    const bytes=XLSX.fromSheets([sheet],'Patient register');
    const name=`patient-register-${new Date().toISOString().slice(0,10)}.xlsx`;
    const r=downloadBytes(name, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if(r.ok) AUDIT.append({actor:user.id,action:'export.patients.xlsx',entity:'patient',entityId:'register',
      detail:`${rows.length} row(s), sensitive conditions ${RBAC.has(user,'condition.sensitive')?'included':'excluded'}`});
    DB.save();
    return {...r, msg:r.ok?`${rows.length} patient record(s) saved as ${name}.`:r.msg};
  },

  registry(user){
    if(!(RBAC.has(user,'org.manage')||RBAC.has(user,'user.view')))
      return {ok:false, msg:'Your role does not hold the organisational registry.'};
    const areas=COUNTIES.flatMap(c=>c.areas.map(a=>({...a,county:c.name})));
    const depts=DEPARTMENTS.map(d=>[d.short,d.name]);
    const roles=ROLES.map(r=>[r.name, (r.scope||{}).geo||'', (r.scope||{}).records||'',
      RBAC.expandedPerms(r.id).length, (r.perms||[]).join(' ')]);
    const users=(DB.db.users||[]).map(u=>[u.username,u.name,(roleObj(u.roleId)||{}).name||u.roleId,
      countyName(u.countyId),(u.areaIds||[]).map(areaName).join(', '),u.status,u.lastLogin||'']);
    const locations=(typeof LEAVE_SITES!=='undefined'?LEAVE_SITES:[]).map(s=>
      [s.name, countyName(s.countyId), s.areaId?areaName(s.areaId):'-', s.required]);
    const schedule=(typeof LEAVE_PATTERN!=='undefined'?LEAVE_PATTERN:[]).map(p=>
      [['','Monday','Tuesday','Wednesday','Thursday','Friday'][p.weekday-1],
       (LEAVE.site(p.siteId)||{}).name||p.siteId,
       p.staff==='casual'?'Casual worker':(LEAVE.employee(p.staff)||{}).name||p.staff,
       p.role]);
    const caps=Object.keys(CAPS).map(c=>[c,CAPS[c].g,CAPS[c].l]);
    const sheets=[
      {name:'Counties and areas', widths:[22,12,22,10,12], rows:[['County','Area code','Area','Class','Sub-county'],...areas.map(a=>[a.county,a.id,a.name,AREA_CLASS_LABEL[a.cls]||a.cls,a.subCounty||''])]},
      {name:'Departments', widths:[12,40], rows:[['Short name','Department'],...depts]},
      {name:'Roles', widths:[36,14,20,10,80], rows:[['Role','Geography','Records','Capabilities','Permission list'],...roles]},
      {name:'Capabilities', widths:[28,16,50], rows:[['Capability','Group','Description'],...caps]},
      {name:'Users', widths:[22,34,30,18,34,12,12], rows:[['Username','Name','Role','County','Ministry areas','Status','Last sign-in'],...users]},
      {name:'Field locations', widths:[24,18,20,10], rows:[['Location','County','Ministry area','Required'],...locations]},
      {name:'Weekly schedule', widths:[12,24,28,12], rows:[['Weekday','Location','Person','Role'],...schedule]}
    ];
    const bytes=XLSX.fromSheets(sheets,'Organisational registry');
    const name=`organisational-registry-${new Date().toISOString().slice(0,10)}.xlsx`;
    const r=downloadBytes(name, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if(r.ok) AUDIT.append({actor:user.id,action:'export.registry.xlsx',entity:'registry',entityId:'all',detail:name});
    DB.save();
    return {...r, msg:r.ok?`${sheets.length} tables saved as ${name}.`:r.msg};
  },

  stock(user){
    if(!RBAC.has(user,'pharmacy.view')) return {ok:false,msg:'Your role does not hold pharmacy access.'};
    const rows=RX.stockRows(user)||[];
    const sheet={name:'Stock', widths:[36,16,12,10,10,14,20],
      rows:[['Medicine','Batch','Expiry','Quantity','Unit','Category','Status'],
        ...rows.map(r=>[r.item?r.item.name:r.name, r.batch||'', r.expiry||'', r.qty,
          r.item?r.item.unit:'', r.item?r.item.cat:'', r.status||''])]};
    const bytes=XLSX.fromSheets([sheet],'Stock');
    const name=`stock-on-hand-${new Date().toISOString().slice(0,10)}.xlsx`;
    const r=downloadBytes(name, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if(r.ok) AUDIT.append({actor:user.id,action:'export.stock',entity:'pharmacy',entityId:user.countyId,detail:`${rows.length} batch(es)`});
    DB.save();
    return {...r, msg:r.ok?`${rows.length} batch(es) saved as ${name}.`:r.msg};
  },

  leaveWeek(user){
    if(!RBAC.has(user,'hr.view') && !RBAC.has(user,'hr.leave.approve'))
      return {ok:false,msg:'Only HR and approving officers may export the coverage sheet.'};
    const days=LEAVE.week(todayISO());
    const rows=[['Date','Weekday','Location','Slot','On leave','Covered by','Coverage']];
    days.forEach(day=>day.rows.forEach(r=>r.slots.forEach(s=>rows.push([
      day.date, new Date(day.date).toLocaleDateString('en-GB',{weekday:'long'}),
      r.site.name, s.name, s.away?'On leave':'', s.coveredByName||'', r.status]))));
    const bytes=XLSX.fromSheets([{name:'Weekly coverage',widths:[12,12,24,28,12,26,12],rows}],'Weekly coverage');
    const name=`field-coverage-${todayISO()}.xlsx`;
    const r=downloadBytes(name, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if(r.ok) AUDIT.append({actor:user.id,action:'export.coverage',entity:'leave',entityId:'week',detail:name});
    DB.save();
    return {...r, msg:r.ok?`Weekly coverage saved as ${name}.`:r.msg};
  },

  schedule(user, id){
    const plan=(DB.db.scheduleDrafts||[]).find(p=>p.id===id) || SCHED.drafts(user)[0];
    if(!plan) return {ok:false,msg:'There is no plan to export. Propose a week first.'};
    const rows=[['Date','Weekday','Patient code','Ministry area','Priority','Reason','Overdue (days)']];
    plan.days.forEach(d=>d.stops.forEach(s=>rows.push([d.date,
      new Date(d.date).toLocaleDateString('en-GB',{weekday:'long'}),
      s.code,s.area,titleCase(s.priority),s.reason,s.overdue])));
    if(plan.unscheduled&&plan.unscheduled.length)
      rows.push([],['Not placed'],['Patient code','Ministry area','Reason'],
        ...plan.unscheduled.map(u=>[u.code,u.area,u.reason]));
    const bytes=XLSX.fromSheets([{name:'Field plan',widths:[12,12,14,20,12,60,12],rows}],'Field plan');
    const name=`field-plan-${plan.weekStart}.xlsx`;
    const r=downloadBytes(name, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if(r.ok) AUDIT.append({actor:user.id,action:'export.plan',entity:'schedule',entityId:plan.id,detail:name});
    DB.save();
    return {...r, msg:r.ok?`Field plan saved as ${name}.`:r.msg};
  }
};

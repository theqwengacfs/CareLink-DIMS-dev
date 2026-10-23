/* ============================================================
   files.js - Document storage on the central database host.

   A document record without its file is a promise, not a record. This module
   puts the bytes where the database lives: on the host computer, inside the
   same SQLite file, with a SHA-256 digest, a retention class and the person
   who uploaded it. A tablet with no host connection is refused rather than
   told a file was kept when it was not.

   What is deliberately not done here:
   - no file is ever put in the JSON database document, because that document
     is mirrored to every device;
   - no file is readable without a live host session;
   - a file is never deleted by this interface. Retention classes and a
     legal hold are recorded so that disposal is a deliberate, audited act.
   ============================================================ */

const RETENTION = [
  { id:'clinical',   label:'Clinical record',       years:7,  note:'Kept for seven years after the last episode of care.' },
  { id:'employment', label:'Employment record',     years:7,  note:'Kept for seven years after the end of employment.' },
  { id:'finance',    label:'Finance record',        years:7,  note:'Kept for seven years for audit.' },
  { id:'permanent',  label:'Permanent record',      years:null, note:'Never destroyed without a recorded authority.' },
  { id:'standard',   label:'General document',      years:3,  note:'Kept for three years, then reviewed.' }
];
const RETENTION_BY_ID = Object.fromEntries(RETENTION.map(r=>[r.id,r]));

/* The classification on the document record decides the retention class,
   unless a person with authority chooses otherwise. */
const RETENTION_FOR_CLASS = {
  clinical:'clinical', identification:'permanent', hospital:'clinical',
  internal_photo:'standard', story_material:'standard', restricted:'permanent'
};

function bytesToBase64(bytes){
  let out='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i+chunk)));
  }
  return btoa(out);
}

const FILEVAULT = {
  available(){
    const hosted=/^https?:/.test(location.protocol||'');
    const session=typeof SYNC!=='undefined' && SYNC.sessionToken;
    return hosted && !!session;
  },

  headers(){
    const h={'Content-Type':'application/json','Accept':'application/json'};
    if(typeof SYNC!=='undefined' && SYNC.sessionToken) h['X-CareLink-Session']=SYNC.sessionToken;
    return h;
  },

  /* Read a File chosen in a form into bytes, with a size check before it
     leaves the device. */
  async read(file, limitMb=8){
    if(!file || !file.size) return {ok:false, msg:'Choose a file first.'};
    if(file.size > limitMb*1024*1024) return {ok:false, msg:`The file is ${(file.size/1048576).toFixed(1)} MB. The limit is ${limitMb} MB.`};
    const buffer=await file.arrayBuffer();
    return {ok:true, bytes:new Uint8Array(buffer), name:file.name||'document', mime:file.type||'application/octet-stream'};
  },

  async digest(bytes){
    try{
      if(typeof crypto==='undefined' || !crypto.subtle) return null;
      const hash=await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(e){ return null; }
  },

  async store(file, meta={}){
    if(!/^https?:/.test(location.protocol||''))
      return {ok:false, msg:'The application is open as a file, so there is no host to store the document on. Open it from the address the host prints.'};
    if(typeof SYNC==='undefined' || !SYNC.sessionToken)
      return {ok:false, msg:'No live session with the host. Reconnect under Central database, then upload again.'};
    const read=await this.read(file);
    if(!read.ok) return read;
    const sha=await this.digest(read.bytes);
    const retention = meta.retention || RETENTION_FOR_CLASS[meta.classification] || 'standard';
    try{
      const r=await fetch('/api/files',{method:'POST',headers:this.headers(),
        body:JSON.stringify({name:read.name, mime:read.mime, data:bytesToBase64(read.bytes),
          patient:meta.patientId||null, kind:meta.kind||'document', retention,
          note:meta.note||''})});
      const body=await r.json().catch(()=>({}));
      if(!r.ok) return {ok:false, msg:body.error||'The host refused the file.'};
      return {ok:true, id:body.id, sha256:body.sha256||sha, bytes:body.bytes, retention, name:read.name, mime:read.mime};
    }catch(e){
      return {ok:false, msg:'The host could not be reached while the file was being sent.'};
    }
  },

  /* Opens the stored file through the host, with the session header. A plain
     link would not carry the header, so the bytes are fetched and shown from
     a local object URL. */
  async open(id){
    if(!this.available()) return {ok:false, msg:'No live session with the host.'};
    try{
      const r=await fetch('/api/files/'+encodeURIComponent(id),{headers:{'X-CareLink-Session':SYNC.sessionToken}});
      if(!r.ok) return {ok:false, msg:'The file could not be read. It may have been removed by an administrator.'};
      const blob=await r.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.target='_blank'; a.rel='noopener'; a.download=id;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ try{ a.remove(); URL.revokeObjectURL(url); }catch(e){} }, 30000);
      return {ok:true};
    }catch(e){ return {ok:false, msg:'The file could not be read.'}; }
  },

  async list(){
    if(!this.available()) return [];
    try{
      const r=await fetch('/api/files',{headers:{'X-CareLink-Session':SYNC.sessionToken}});
      const body=await r.json();
      return r.ok && Array.isArray(body.files)? body.files : [];
    }catch(e){ return []; }
  },

  label(retention){ return (RETENTION_BY_ID[retention]||RETENTION_BY_ID.standard).label; }
};

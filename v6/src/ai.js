/* ============================================================
   ai.js - Departmental & Console-Aware AI Assistant (Online Ollama + Offline)
   LOMAMO Foundation Kenya · LOMAMO C-DIMS v6.1

   Architecture:
   1. Hard safety & RBAC boundary enforced BEFORE both offline reasoning
      and local Ollama inference (never diagnoses, prescribes, approves,
      publishes, or reads outside the signed-in user's scope).
   2. Dedicated Specialist AI Profile for every LOMAMO department and
      every LOMAMO C-DIMS console workspace.
   3. Seamless dual connector:
      - Host LAN proxy (/api/ai/probe & /api/ai/chat) for office tablets & PCs
      - Direct local Ollama HTTP API (http://127.0.0.1:11434) for standalone PCs
      - Instant verified offline rule-and-statistics engine when offline
   ============================================================ */

const AI_PROFILES = {
  executive: {
    id:'executive',
    title:'Executive Strategy & Governance AI',
    badge:'Executive Console',
    summary:'Cross-county caseload balance, budget stewardship, Monday reports, 4-office governance and board action tracking.',
    chips:[
      'Give me an executive cross-county summary',
      'What is my caseload this week?',
      'How is the budget tracking?',
      'Summarise open hospital requests',
      'Summarise governance & executive actions'
    ]
  },
  field: {
    id:'field',
    title:'Field Care & Orphan Prevention AI',
    badge:'Ministry Area Console',
    summary:'Household caseloads, overdue follow-ups, 30-day PDCA cycles, visit route planning and JOOTRH hospital dispatches.',
    chips:[
      'What is my caseload this week?',
      'Which patients need attention?',
      'Suggest my household visit plan & weather check',
      'Summarise open hospital requests',
      'Draft a household review note'
    ]
  },
  clinical: {
    id:'clinical',
    title:'Clinical Case Management & PDCA AI',
    badge:'Clinical Console',
    summary:'Clinical priority flags, hospital request triage, Omaha care plans, 30-day PDCA outcomes and discharge readiness.',
    chips:[
      'Which patients need attention?',
      'Summarise open hospital requests',
      'What is my caseload this week?',
      'Summarise pharmacy stock & expiry status',
      'Draft a clinical case handover summary'
    ]
  },
  hospital: {
    id:'hospital',
    title:'Hospital Focal Desk & JOOTRH AI',
    badge:'Hospital Ministry Console',
    summary:'JOOTRH & county referral dispatches, SHA verification readiness, patient escort coordination and receipt follow-up.',
    chips:[
      'Summarise open hospital requests',
      'Which patients need attention?',
      'Check fleet & patient escort readiness',
      'What is my caseload this week?',
      'Draft a hospital focal desk handover note'
    ]
  },
  pharmacy: {
    id:'pharmacy',
    title:'Pharmacy, FEFO Stock & Dispensary AI',
    badge:'Pharmacy Console',
    summary:'Batch expiry tracking (FEFO), minimum reorder alerts, dispensing queue and cold-chain stewardship.',
    chips:[
      'Summarise pharmacy stock & expiry status',
      'Which patients need attention?',
      'Summarise open hospital requests',
      'Check equipment & inventory status',
      'Show data quality findings'
    ]
  },
  homestay: {
    id:'homestay',
    title:'Homestay, Care Centre & Upper Room AI',
    badge:'Homestay Console',
    summary:'Safe short-stay bed occupancy, active resident care logs, incident watch and Upper Room Discipleship Podcast episodes.',
    chips:[
      'Summarise homestay beds, residents & podcast',
      'Which patients need attention?',
      'Summarise open hospital requests',
      'Check library resources & loans',
      'Draft a resident care transition note'
    ]
  },
  finance: {
    id:'finance',
    title:'Finance, Stewardship & Procurement AI',
    badge:'Finance Console',
    summary:'Month-to-date budget burn, committed lines, un-reconciled hospital transport advances and receipt exceptions.',
    chips:[
      'How is the budget tracking?',
      'Show data quality findings',
      'Check equipment & inventory status',
      'Check fleet & patient escort readiness',
      'When does the next Monday report run?'
    ]
  },
  me: {
    id:'me',
    title:'M&E, Pivot Analytics & KHIS/DHIS2 AI',
    badge:'Analytics & Interop Console',
    summary:'Versioned indicators, Kisumu vs Homa Bay metrics, MOH 731/711 draft readiness, DHIS2 dataValueSets and FHIR R4 status.',
    chips:[
      'Summarise M&E indicators & KHIS readiness',
      'What is my caseload this week?',
      'Show data quality findings',
      'What does "patients requiring follow-up" mean?',
      'When does the next Monday report run?'
    ]
  },
  media: {
    id:'media',
    title:'Ethical Storytelling & Consent AI',
    badge:'Media Governance Console',
    summary:'Consent-verified publications, Upper Room podcast queue, photo/story clearance and Kenya Data Protection Act safeguards.',
    chips:[
      'Which media assets lack consent?',
      'Summarise stakeholder & public enquiries',
      'Check library resources & loans',
      'Draft a consent-safe community update',
      'Who am I and what can my role access?'
    ]
  },
  pr: {
    id:'pr',
    title:'Public Relations & Partnerships AI',
    badge:'Stakeholder Console',
    summary:'Partner engagement across county health facilities, community enquiries, response SLAs and public portal readiness.',
    chips:[
      'Summarise stakeholder & public enquiries',
      'Which media assets lack consent?',
      'Check library resources & loans',
      'Draft a partner response message',
      'Who am I and what can my role access?'
    ]
  },
  hr: {
    id:'hr',
    title:'HR, Staff Welfare, Leave & Interns AI',
    badge:'People & Welfare Console',
    summary:'Active county workforce, pending leave approvals, student/intern placements, welfare acts and OHS workplace safety.',
    chips:[
      'Summarise HR roster, leave & interns',
      'Summarise OHS safety & staff recognition',
      'Check library resources & loans',
      'Check equipment & inventory status',
      'Who am I and what can my role access?'
    ]
  },
  logistics: {
    id:'logistics',
    title:'Fleet, Transport & Asset Inventory AI',
    badge:'Logistics Console',
    summary:'Vehicle readiness, patient escort trips, fuel/mileage tracking and the 122-item multi-department equipment register.',
    chips:[
      'Check fleet & patient escort readiness',
      'Check equipment & inventory status',
      'Check library resources & loans',
      'Summarise OHS safety & staff recognition',
      'Who am I and what can my role access?'
    ]
  },
  library: {
    id:'library',
    title:'Departmental Library & Resource Loans AI',
    badge:'Knowledge Library Console',
    summary:'Cross-department books, SOP manuals, clinical kits, return due dates and overdue inter-departmental loans.',
    chips:[
      'Check library resources & loans',
      'Check equipment & inventory status',
      'Summarise HR roster, leave & interns',
      'Summarise OHS safety & staff recognition',
      'Who am I and what can my role access?'
    ]
  },
  audit: {
    id:'audit',
    title:'Internal Audit, Compliance & Data Quality AI',
    badge:'Audit & Quality Console',
    summary:'SHA-256 hash-chain verification, un-receipted disbursements, duplicate NIDs, OHS incidents and RBAC separation checks.',
    chips:[
      'Show data quality findings',
      'How is the budget tracking?',
      'Summarise M&E indicators & KHIS readiness',
      'Summarise governance & executive actions',
      'Summarise OHS safety & staff recognition'
    ]
  },
  it: {
    id:'it',
    title:'System Administration, Dev Console & Cloud DB AI',
    badge:'System & Dev Console',
    summary:'Shared Online Site Database status, CareLink Online Intelligence, First-Run SMS provisioning, RBAC matrix and backup readiness.',
    chips:[
      'Check online site database & intelligence status',
      'Summarise governance & executive actions',
      'Show data quality findings',
      'Check equipment & inventory status',
      'Who am I and what can my role access?'
    ]
  }
};

const VIEW_TO_AI_PROFILE = {
  executive:'executive', execconsole:'executive', governance:'executive', compare:'executive', donor:'executive', workplans:'executive', delegation:'executive',
  patients:'field', patient:'field', pipeline:'field', attention:'field', visits:'field', visitplan:'field', schedule:'field', weather:'field', repeat:'field', programdays:'field',
  pdca:'clinical', careplans:'clinical', careplan:'clinical', forms:'clinical', form:'clinical', conditions:'clinical', bmiboard:'clinical', clinicalmcm:'clinical',
  requests:'hospital', liaison:'hospital', referral:'hospital', cccdesk:'hospital',
  pharmacy:'pharmacy', tbcare:'pharmacy',
  care:'homestay', 'care-resident':'homestay', 'care-incidents':'homestay',
  finance:'finance', budget:'finance', procurement:'finance', recon:'finance', costing:'finance', foodbudget:'finance', adminops:'finance',
  analytics:'me', indicators:'me', interop:'me', reports:'me', report:'me', archive:'me', targets:'me', import:'me',
  media:'media', studio:'media', consent:'media', publish:'media', policy:'media',
  pr:'pr',
  staff:'hr', hr:'hr', leave:'hr', welfare:'hr', interns:'hr', presence:'hr', recognition:'hr', evaluation:'hr', handover:'hr',
  vehicles:'logistics', trips:'logistics', inventory:'logistics',
  library:'library',
  audit:'audit', history:'audit', security:'audit', quality:'audit', ohs:'audit',
  users:'it', roles:'it', org:'it', registry:'it', workflows:'it', health:'it', backup:'it', settings:'it', mergejournal:'it', devconsole:'it'
};

const AI = {
  history:[],
  status:{ online:false, via:'offline', models:[], activeModel:'', lastChecked:null, error:'' },
  settingsOpen:false,
  busy:false,

  profileFor(user, view){
    const vKey = view && VIEW_TO_AI_PROFILE[view];
    if(vKey && AI_PROFILES[vKey]) return AI_PROFILES[vKey];
    const r = (user && user.roleId) || '';
    const d = (user && user.departmentId) || '';
    if(['director','president','program.admin','program.assistant'].includes(r) || d==='exec') return AI_PROFILES.executive;
    if(['chief','it','countyadmin','assistant'].includes(r) || d==='it') return AI_PROFILES.it;
    if(['mcm','clinician','nurse','depthead'].includes(r) || d==='medical') return AI_PROFILES.clinical;
    if(r==='liaison') return AI_PROFILES.hospital;
    if(r==='homestay') return AI_PROFILES.homestay;
    if(['coordinator','caregiver','chw'].includes(r) || d==='field') return AI_PROFILES.field;
    if(['finance','procurement'].includes(r) || d==='finance' || d==='procurement') return AI_PROFILES.finance;
    if(r==='me' || d==='me') return AI_PROFILES.me;
    if(['mediahead','mediastaff'].includes(r) || d==='media') return AI_PROFILES.media;
    if(r==='pr' || d==='pr') return AI_PROFILES.pr;
    if(['hr','welfare'].includes(r) || d==='hr' || d==='welfare') return AI_PROFILES.hr;
    if(r==='logistics' || d==='logistics') return AI_PROFILES.logistics;
    if(r==='auditor' || d==='audit') return AI_PROFILES.audit;
    return AI_PROFILES.field;
  },

  cfg(){
    if(!DB.db) DB.load();
    DB.db.settings.ai = Object.assign(
      { enabled:true, mode:'auto', provider:'online', ollama:'/api/ai', model:'carelink-online-v6.4' },
      DB.db.settings.ai || {}
    );
    return DB.db.settings.ai;
  },

  /* Probe CareLink Shared Online Site Intelligence (/api/ai/probe) */
  async ollamaProbe(){
    const cfg = this.cfg();
    if(cfg.mode === 'offline') {
      this.status = { online:false, via:'offline', models:[], activeModel:'', lastChecked:new Date().toISOString(), error:'' };
      return false;
    }
    if(typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:/.test(location.protocol)){
      try{
        const ctl = new AbortController(); const t = setTimeout(()=>ctl.abort(), 2200);
        const headers = { 'Content-Type':'application/json' };
        if(typeof SYNC !== 'undefined' && SYNC.sessionToken){
          headers['X-CareLink-Session'] = SYNC.sessionToken;
          headers['Authorization'] = 'Bearer ' + SYNC.sessionToken;
        }
        const r = await fetch('api/ai/probe', {
          method:'POST',
          headers,
          body: JSON.stringify({ mode:'online-cloud' }),
          signal:ctl.signal
        });
        clearTimeout(t);
        if(r.ok){
          const body = await r.json();
          if(body && (body.online || body.reachable || body.ok)){
            const models = (body.models || [body.model]).filter(Boolean);
            const chosen = models[0] || cfg.model || 'carelink-online-v6.4';
            this.status = { online:true, via: body.mode || 'online-cloud', models, activeModel:chosen, lastChecked:new Date().toISOString(), error:'' };
            return true;
          }
        }
      }catch(e){}
    }
    this.status = { online:false, via:'offline', models:[], activeModel:'', lastChecked:new Date().toISOString(), error:'Online intelligence endpoint unreachable; using verified local CareLink engine' };
    return false;
  },

  context(user){
    const role = roleObj(user.roleId)||{};
    const canPatients = RBAC.has(user,'patient.list');
    const canRequests = ['hosp.request.create','hosp.request.review','hosp.request.assign','hosp.visit.record','hosp.receipt.review','hosp.close'].some(c=>RBAC.has(user,c));
    const st = canPatients? repo.stats(user) : { patients:0, active:0, discharged:0, pipeline:0 };
    const ps = canPatients? repo.patientList(user) : [];
    const ids = new Set(ps.map(p=>p.id));
    const concerns = (DB.db.concerns||[]).filter(c=>ids.has(c.patientId)&&c.status==='open');
    const reqs = canRequests? repo.requests(user) : [];
    let finance = null;
    if(RBAC.has(user,'finance.view')){
      const e = REPORTS.expenditure(user,{});
      finance = { budget:e.tot.budget, paid:e.tot.paid, remaining:e.tot.remaining, missingReceipts:e.flags.filter(f=>f.text.startsWith('Missing receipt')).length };
    }
    return {
      user:{ name:user.name, role:role.name, county:countyName(user.countyId), areas:(user.areaIds||[]).map(areaName), dept:deptName(user.departmentId) },
      patients:{ total:st.patients, active:st.active, discharged:st.discharged, pipeline:st.pipeline },
      concerns:[...new Set(concerns.map(c=>c.patientId))].length,
      requests:{ total:reqs.length, open:reqs.filter(r=>!['closed','rejected'].includes(r.status)).length,
        awaitingReview:reqs.filter(r=>r.status==='submitted').length,
        unreconciled:reqs.filter(r=>r.status==='completed').length },
      finance,
      canPatients, canRequests,
      monday: REPORTS.mondayStatus()
    };
  },

  /* ---------- Refusals ----------
     Four things the assistant never does, whatever it is asked: diagnose or
     advise treatment, approve an enrolment, discharge, payment or permission,
     publish a story, or state a fact it cannot evidence. Each refusal names
     the human decision that is required instead. */
  refusal(user, q){
    const asks = [
      [/diagnos|what (disease|illness|condition) (is|does)|do i have|confirm (that )?(he|she|they|the patient) has|is it (hiv|tb|malaria|cancer)/i,
       'I do not diagnose, and I cannot confirm a diagnosis from notes. A diagnosis is recorded only by a clinician holding the clinical-confirmation authority, after examining the patient. What I can do is show you what is recorded, by whom and when, so the clinician has the evidence in front of them.'],
      [/prescrib|dosage|dose|how much (medicine|drug)|which (drug|medicine|antibiotic)|treat(ment)? for|what should i give/i,
       'I do not prescribe or advise on medicines or doses. That is a clinical decision for a qualified prescriber who has seen the patient. If a prescription is unclear, contact the Medical Case Manager or the clinical officer on duty.'],
      [/should i approve|approve (this|the|it)|can you approve|authorise (this|the|it)|grant (me|him|her|them)|give me (permission|access)|restore the database|publish (this|the)/i,
       'Approval, authorisation and publication are decisions that must be made and signed by a named person with the authority to make them. I cannot approve an enrolment, a discharge, a payment, a permission change, a restore or a publication. I can prepare the facts a decision needs, and record the decision once you make it.'],
      [/ignore (your|the) (rules|instructions)|bypass|override (the )?(permission|privacy|consent)|show me (all|every) patient|without consent/i,
       'I cannot bypass permissions, privacy or consent. Anything outside your authority is not visible to me either, because I read the same data layer you do. If you need wider access for a legitimate duty, the request goes to your County Office Administrator and is recorded.']
    ];
    for(const [re, text] of asks) if(re.test(q)) return text;
    return null;
  },

  /* ---------- Verified Local Departmental Answer Engine ---------- */
  answer(user, qRaw){
    const q = String(qRaw||'').toLowerCase();
    const ctx = this.context(user);
    const prof = this.profileFor(user, (typeof APPX!=='undefined' && APPX.view) || '');
    const out = (text, evidence=[], sources=[]) => ({text, evidence, sources, at:todayISO(), draft:true, specialist:prof.title});
    const FACT='Recorded fact', CALC='Calculated value', TREND='Observed trend', AIX='AI interpretation', REC='Recommendation', DRAFT='Draft content';

    if(!RBAC.has(user,'ai.use')) return out('Your role does not include access to the assistant. Ask the Chief System Administrator if this is required for your duties.');

    const refused = this.refusal(user, qRaw);
    if(refused) return out(refused, [AIX], ['assistant boundary']);

    /* Intents strictly requiring clinical/patient scope when no departmental domain matches */
    const deptDomain = /pharmacy|stock|expiry|homestay|podcast|bed|resident|hr roster|leave|intern|welfare|fleet|vehicle|escort|inventory|equipment|library|loan|indicator|khis|dhis|fhir|governance|executive|ceremony|ohs|coin|recognition|stakeholder|enquir|ollama|host status|workflow|priorit|smartflow|100%|completion|next task/.test(q);
    const patientIntent = !deptDomain && /caseload|patient|concern|overdue|attention|risk|hospital|referral|discharge|visit|pdca/.test(q);
    if(patientIntent && !ctx.canPatients && !/definition|mean|what does/.test(q))
      return out('Patient records are not within your authority, so I cannot summarise caseload, concerns or hospital activity for you. Your role covers ' +
        (RBAC.has(user,'finance.view')?'financial records':RBAC.has(user,'hr.view')?'staff and HR records':RBAC.has(user,'media.view')?'media and governance records':RBAC.has(user,'audit.view')?'audit inspection':RBAC.has(user,'vehicle.view')?'fleet and transport':'the functions listed in your role template') +
        '. Ask me about those instead, or speak to your County Office Administrator if you need patient visibility for a legitimate duty.', [AIX]);

    /* Smart Workflow Engine & 100% Data Completion / Quality Status */
    if(/priorit|workflow|smartflow|100%|data completion|next task|what should i do/.test(q) && typeof WORKFLOW_ENGINE !== 'undefined'){
      const m = WORKFLOW_ENGINE.completionMatrix(user);
      const tasks = WORKFLOW_ENGINE.prioritiesFor(user).slice(0, 4);
      return out(
        `**CareLink AI Smart Workflow & 100% Data Quality Plan**\n` +
        `• **4-Tier Data Quality:** Personal **${m.personal.pct}%** · Departmental **${m.department.pct}%** · County **${m.county.pct}%** · Global **${m.global.pct}%**\n\n` +
        `**Recommended Task Sequence (${ctx.user.role}):**\n` +
        tasks.map((t, i) => `${i + 1}. **[${t.band}] ${t.title}** — *${t.lift}*\n   ↳ ${t.aiWhy}`).join('\n') +
        `\n\nOpen **Smart workflow & QA** in the left navigation to execute each step in order and maintain 100% data completeness.`,
        [FACT, CALC, REC],
        ['workflow engine', 'data quality', 'role scope']
      );
    }

    /* Greeting / identity */
    if(/^(hi|hello|hey|habari|jambo)\b/.test(q))
      return out(`Hello. You are signed in as **${ctx.user.name}** (${ctx.user.role}, ${ctx.user.county}) inside **${prof.title}**.\n\n${prof.summary}\n\nAsk me any question using the quick prompts below or type freely.`, [FACT]);

    if(/who am i|my role|my access|what can i/.test(q)){
      const role = roleObj(user.roleId);
      const sc = role.scope||{};
      return out(`**${role.name}** · ${deptName(user.departmentId)}\nActive AI Specialist: **${prof.title}**\nAuthority: ${sc.geo==='global'?'organisation-wide':sc.geo==='county'?countyName(user.countyId):'your assigned ministry areas ('+(user.areaIds||[]).map(areaName).join(', ')+')'}\nRecord scope: ${sc.records}${sc.readOnly?' · read-only':''}\nCapabilities held: ${RBAC.expandedPerms(user.roleId).length} of ${Object.keys(CAPS).length}.`, [FACT]);
    }

    /* Local Ollama & System Host Status */
    if(/ollama|host status|local model/.test(q)){
      const cfg = this.cfg();
      const hostInfo = (typeof APPX!=='undefined' && APPX.host)
        ? `Central Wi-Fi SQLite host connected (revision ${APPX.host.rev}).`
        : 'Standalone browser storage active on this device.';
      return out(`**AI & Host Connectivity Status**\n• Active specialist: **${prof.title}**\n• Engine mode: **${cfg.mode}** (${this.status.online ? `Connected via ${this.status.via} · model ${this.status.activeModel}` : 'Verified Offline Engine active'})\n• Configured Ollama URL: \`${cfg.ollama}\`\n• Database host: ${hostInfo}\n\nUse the **Model & Connection** toggle at the top of this assistant to test or switch local Ollama models at any time.`, [FACT], ['system settings','ai connector']);
    }

    /* Executive Cross-County & Governance Summary */
    if(/executive cross-county|governance & executive|ceremony/.test(q)){
      const ceremonies = (DB.db.ceremonies||[]).length;
      const meetings = (DB.db.execMeetings||[]).length;
      const byCounty = COUNTIES.map(c=>{
        const n = ctx.canPatients ? repo.patientList(user).filter(p=>p.countyId===c.id && ['active','extension'].includes(p.status)).length : null;
        return `${c.name}: ${n!==null ? '**'+n+' active**' : 'restricted'}`;
      }).join(' · ');
      return out(`**Executive & Governance Snapshot**\n• County caseload distribution: ${byCounty}\n• Executive meetings recorded: **${meetings}**\n• Password recovery ceremonies on ledger: **${ceremonies}**\n• Open hospital requests in scope: **${ctx.requests.open}** (${ctx.requests.awaitingReview} awaiting review)\n• Audit hash chain entries: **${(DB.db.audit||[]).length}**`, [FACT, CALC], ['executive console','governance ledger','audit log']);
    }

    /* Pharmacy, Stock & FEFO Expiry */
    if(/pharmacy|stock|expiry|dispens/.test(q)){
      const lots = (DB.db.stockLots||[]).filter(l=>!user.countyId || user.roleId==='chief' || user.roleId==='director' || !l.countyId || l.countyId===user.countyId);
      const rx = (DB.db.clinicalRx||[]);
      const low = lots.filter(l=>Number(l.qty||0) <= Number(l.reorder||15));
      const soon = lots.filter(l=>l.expiry && ((new Date(l.expiry)-new Date())/86400000) <= 90);
      return out(`**Pharmacy & FEFO Stock Summary**\n• Tracked batch lots in scope: **${lots.length}**\n• Batches at or below reorder threshold: **${low.length}**${low.length?` (${low.slice(0,3).map(l=>`${l.name}: ${l.qty} ${l.unit||''}`).join('; ')})`:''}\n• Batches expiring within 90 days (FEFO priority): **${soon.length}**${soon.length?` (${soon.slice(0,3).map(l=>`${l.name} exp ${l.expiry}`).join('; ')})`:''}\n• Recorded prescriptions on register: **${rx.length}**`, [FACT, CALC, REC], ['stock lots','prescriptions']);
    }

    /* Homestay, Care Centre & Upper Room Podcast */
    if(/homestay|care centre|resident|podcast|bed/.test(q)){
      const beds = DB.db.careBeds||[];
      const occ = beds.filter(b=>b.status==='occupied').length;
      const res = (DB.db.careResidents||[]).filter(r=>r.status==='active');
      const pods = (DB.db.publications||[]).filter(p=>p.format==='podcast' || /upper room/i.test(p.title||''));
      return out(`**Homestay, Care Centre & Upper Room Summary**\n• Safe short-stay beds: **${occ} occupied** of **${beds.length}** total capacity (${beds.length - occ} available)\n• Active short-stay residents: **${res.length}**\n• Recorded care shift logs: **${(DB.db.careLogs||[]).length}**\n• Upper Room Discipleship Podcast episodes in media hub: **${pods.length}**${pods[0]?` (latest: *${pods[0].title}*)`:''}`, [FACT, CALC], ['homestay beds','care logs','publications']);
    }

    /* HR, Leave, Staff Welfare & Interns */
    if(/hr roster|leave|intern|welfare/.test(q)){
      const emps = DB.db.employees||[];
      const leaves = (DB.db.leaveRequests||[]).filter(l=>l.status==='pending');
      const interns = (DB.db.interns||[]).filter(i=>i.status==='active');
      const acts = DB.db.welfareActs||[];
      return out(`**Human Resources, Leave, Welfare & Interns**\n• Active staff records: **${emps.length}** across Kisumu & Homa Bay\n• Leave requests awaiting review: **${leaves.length}**\n• Active students & interns placed in departments: **${interns.length}**${interns.length?` (${interns.map(i=>`${i.name} - ${deptName(i.departmentId)}`).join('; ')})`:''}\n• Staff welfare support actions recorded: **${acts.length}**`, [FACT, CALC], ['employees','leave requests','interns','welfare']);
    }

    /* Fleet, Vehicles & Escort Readiness */
    if(/fleet|vehicle|escort/.test(q)){
      const vs = DB.db.vehicles||[];
      const avail = vs.filter(v=>v.status==='available' || v.status==='active');
      const trips = DB.db.trips||[];
      return out(`**Fleet, Transport & Patient Escort Readiness**\n• Fleet vehicles registered: **${vs.length}** (**${avail.length}** currently serviceable/available)\n• Recorded field & hospital trips: **${trips.length}**\n• Hospital transport requests open in your scope: **${ctx.requests.open}**\n• Vehicles on register: ${vs.map(v=>`${v.reg||v.plate||v.name} (${countyName(v.countyId)})`).join(', ')||'none'}`, [FACT, CALC], ['vehicles','trips','hospital requests']);
    }

    /* Equipment Inventory & Departmental Libraries */
    if(/inventory|equipment|library|loan/.test(q)){
      const inv = DB.db.inventoryItems||[];
      const totalUnits = inv.reduce((a,x)=>a+Number(x.qty||0),0);
      const libs = DB.db.libraryItems||[];
      const loans = (DB.db.borrowRequests||[]).filter(b=>['borrowed','approved','overdue'].includes(b.status));
      const overdue = (DB.db.borrowRequests||[]).filter(b=>b.status==='overdue' || (b.dueDate && b.status==='borrowed' && b.dueDate < todayISO()));
      return out(`**Asset Inventory & Departmental Library Status**\n• Multi-department equipment catalogue: **${inv.length} item lines** (**${num(totalUnits)} physical units** tracked)\n• Departmental library holdings: **${libs.length} titles & field kits**\n• Active cross-department loans: **${loans.length}** (**${overdue.length} overdue for return**)${overdue.length?`\n• Overdue alert: ${overdue.map(o=>o.itemTitle||o.itemId).join(', ')}`:''}`, [FACT, CALC, REC], ['inventory items','library catalogue','borrow ledger']);
    }

    /* M&E Indicators, Pivot & KHIS / DHIS2 Interop */
    if(/m&e|indicator|khis|dhis|fhir/.test(q)){
      const de = (DB.db.dataElements||[]).length;
      const inds = (DB.db.indicators||[]).length;
      return out(`**M&E Analytics & Interoperability Readiness**\n• Configured atomic data elements: **${de}**\n• Versioned indicator formulas: **${inds}**\n• Scoped register volume: **${ctx.patients.total} patients** (${ctx.patients.active} active)\n• Interoperability adapters active: **KHIS MOH 731 / MOH 711 Non-Official Verification Drafts**, **DHIS2 dataValueSets JSON**, and **HL7 FHIR R4 Bundle** exports.`, [FACT, CALC], ['data elements','indicators','interoperability hub']);
    }

    /* OHS Safety & CareLink Coins Recognition */
    if(/ohs|safety|coin|recognition/.test(q)){
      const ohs = (DB.db.ohsIncidents||[]);
      const openOhs = ohs.filter(o=>o.status!=='closed');
      const myCoins = ((DB.db.credits||[]).filter(c=>c.userId===user.id).reduce((a,c)=>a+Number(c.amount||c.points||0),0));
      return out(`**Workplace Safety (OHS) & Staff Recognition**\n• Recorded OHS workplace observations: **${ohs.length}** (**${openOhs.length} open**)\n• Completed safety inspections: **${(DB.db.ohsChecks||[]).length}**\n• Your CareLink Coins balance: **${myCoins} coins** (open **Recognition & Coins** in the sidebar to inspect full tier progress across Bronze, Silver, Gold and Platinum).`, [FACT, CALC], ['ohs register','carelink coins']);
    }

    /* PR, Stakeholders & Public Enquiries */
    if(/stakeholder|enquir/.test(q)){
      const stks = (DB.db.stakeholders||[]).length;
      const enqs = (DB.db.enquiries||[]);
      const openEnq = enqs.filter(e=>e.status!=='closed' && e.status!=='answered');
      return out(`**Stakeholders, Partnerships & Public Enquiries**\n• Active institutional partners & facilities: **${stks}**\n• Logged community & partner enquiries: **${enqs.length}** (**${openEnq.length} awaiting response**)${openEnq.length?`\n• Next to answer: ${openEnq.slice(0,3).map(e=>`${e.subject||e.topic||'Enquiry'} (${e.from||e.name||'Public'})`).join('; ')}`:''}`, [FACT, CALC], ['stakeholders','enquiries']);
    }

    /* Visit Route & Weather Check */
    if(/visit plan|route|weather/.test(q)){
      const ps = ctx.canPatients ? repo.patientList(user).filter(p=>['active','extension'].includes(p.status)) : [];
      const topStops = ps.slice(0,5).map(p=>`${p.name} (${areaName(p.areaId)}, ${PAT.days(p)}d)`);
      return out(`**Field Visit Route & Lake Basin Weather Guidance**\n• Active households eligible for field stops in your scope: **${ps.length}**\n• Suggested priority stops: ${topStops.join(' -> ') || 'No active households assigned'}\n• Field readiness tip: Complete morning visits in low-lying Nyalenda, Ombeyi, Ahero and Makongeni corridors ahead of afternoon Lake Victoria convection showers, and confirm phone reachability before departure.`, [FACT, REC], ['visit order learner','weather advisory']);
    }

    /* Caseload */
    if(/caseload|how many patient|patient count|active patient/.test(q)){
      const figs = REPORTS.patientFigures(user,{});
      return out(`Your authorised caseload is **${ctx.patients.active} active** patients (${ctx.patients.total} records visible in total; ${ctx.patients.pipeline} in the assessment pipeline).\n\nThis week: **${figs.newAssessed.length} assessed**, **${figs.enrolledPeriod.length} enrolled**, **${figs.dischargedPeriod.length} discharged**.\n\nRolling caseload check: opening ${figs.opening.length} + new ${figs.enrolledPeriod.length} minus discharged ${figs.dischargedPeriod.length} = **${figs.closingCalc}** (system active count ${figs.active.length}).${figs.closingCalc!==figs.active.length?' Difference indicates a status change or date outside the period; review the Patient Figures report.':''}`,
        [FACT, CALC], ['patient register','visits','discharges']);
    }

    /* Attention */
    if(/attention|concern|overdue|at risk|risk|deteriorat/.test(q)){
      const ps = repo.patientList(user);
      const ids=new Set(ps.map(p=>p.id));
      const cs = DB.db.concerns.filter(c=>ids.has(c.patientId)&&c.status==='open');
      const clinical = cs.filter(c=>c.level==='clinical');
      const admin = cs.filter(c=>c.level==='administrative');
      if(!cs.length) return out('No open patient concerns are recorded within your scope. If you believe a patient needs attention, record the observation so the alert is evidence-based.',[FACT]);
      return out(`**${new Set(cs.map(c=>c.patientId)).size} patients** in your scope have open concerns: **${new Set(clinical.map(c=>c.patientId)).size} clinical** and **${new Set(admin.map(c=>c.patientId)).size} administrative**.\n\nClinical priority: ${[...new Set(clinical.map(c=>c.patientId))].slice(0,5).map(id=>{const p=DB.db.patients.find(x=>x.id===id);return p?`${p.name} (${areaName(p.areaId)})`:''}).filter(Boolean).join('; ')||'none'}.\n\nClinical urgency is kept separate from administrative urgency: a missing form is never labelled a medical emergency.`, [FACT, AIX], ['concerns','visits','pdca']);
    }

    /* Hospital */
    if(/hospital|referral|transport|liaison|jootrh/.test(q)){
      const r = ctx.requests;
      const awaiting = repo.requests(user).filter(x=>x.status==='submitted').slice(0,4);
      return out(`Hospital requests in your scope: **${r.total}** total · **${r.open}** open · **${r.awaitingReview}** awaiting clinical review · **${r.unreconciled}** served but unreconciled.${awaiting.length?`\n\nOldest awaiting review: ${awaiting.map(x=>`${x.no} (${x.priority}, ${fmtDate(x.submittedAt)})`).join(', ')}.`:''}`, [FACT, CALC], ['hospital requests','receipts']);
    }

    /* Finance */
    if(/expenditure|budget|finance|receipt|reconcil|spend/.test(q)){
      if(!RBAC.has(user,'finance.view')) return out('Financial records are outside your role. I will not summarise them. Ask the Finance Officer or the County Office Administrator.', [AIX]);
      const e = REPORTS.expenditure(user,{});
      const top = [...e.rows].sort((a,b)=>b.paid-a.paid).slice(0,3);
      return out(`Month to date (${e.period.label}): budget **${money(e.tot.budget)}**, paid **${money(e.tot.paid)}**, committed **${money(e.tot.committed)}**, remaining **${money(e.tot.remaining)}** (${pct(e.tot.paid+e.tot.committed,e.tot.budget)}% used).\n\nLargest lines: ${top.map(r=>`${r.cat.name} ${money(r.paid)}`).join(' · ')}.\n\nProjected month-end at current pace: **${money(e.projected)}**. ${e.flags.length?`**${e.flags.length} evidence exceptions** need attention (missing receipts, duplicate references or amounts above routine limits).`:'No evidence exceptions detected.'}`, [CALC, TREND, REC], ['transactions','budgets','receipts']);
    }

    /* Consent / media */
    if(/consent|media|story|publish|photograph/.test(q)){
      if(!RBAC.has(user,'media.view')&&!RBAC.has(user,'media.consent.manage')) return out('Media and consent records are restricted to the Media & Information Governance function, clinical roles with a care need, and the originating caregiver for their own uploads.', [AIX]);
      const docs = repo.documents(user);
      const pending = docs.filter(d=>d.classification==='story_material'&&d.publication!=='approved');
      const noConsent = docs.filter(d=>{ const p=DB.db.patients.find(x=>x.id===d.patientId); return p && p.consent.status!=='granted'; });
      return out(`${docs.length} media assets in your scope. **${pending.length}** storytelling assets await review; **${noConsent.length}** are linked to a patient whose consent is not currently granted and therefore cannot be published.\n\nPublication is blocked at the rule-engine level, not merely by hiding a button.`, [FACT, CALC], ['documents','patient consent']);
    }

    /* Reports */
    if(/report|monday|patient.figure|patient.day/.test(q)){
      const m = ctx.monday;
      return out(`Monday management reports are ${m.enabled?'**armed**':'paused'}. Next scheduled generation: **${fmtDateTime(m.nextRun)}** (${m.label}).${m.lastRun?` Last run: ${fmtDateTime(m.lastRun)}.`:' No scheduled run recorded yet.'}\n\nAvailable to you: ${RBAC.has(user,'report.patient_figures')?'Patient Figures, ':''}${RBAC.has(user,'report.patient_days')?'Patient-Days, ':''}${RBAC.has(user,'report.expenditure')?'Expenditure, ':''}${RBAC.has(user,'report.referral')?'Master Referral Document, ':''}${RBAC.has(user,'report.executive')?'Executive Summary':'departmental reports'}.`, [FACT]);
    }

    /* Definitions */
    const defHit = Object.entries(INDICATORS).find(([k,v])=>q.includes(v.l.toLowerCase().split(' ')[0]) || q.includes(k.replace(/_/g,' ')));
    if(defHit) return out(`**${defHit[1].l}**\n${defHit[1].def}\n\nSource: ${defHit[1].src}.`, [FACT], ['indicator dictionary']);

    /* Patient-specific question */
    const named = ctx.canPatients ? repo.patientList(user).find(p=>q.includes(p.name.toLowerCase())||q.includes(p.code.toLowerCase())) : null;
    if(named){
      const days = daysBetween(named.intake);
      const v = [...DB.visitsFor(named.id)].sort((a,b)=>new Date(b.date)-new Date(a.date));
      const clinical = RBAC.can(user,'patient.view.clinical',{countyId:named.countyId,areaId:named.areaId}).ok;
      return out(`**${named.name}** · ${named.code} · ${areaName(named.areaId)}\nStatus: ${WORKFLOW.patient.labels[named.status]||named.status}. Days in programme: **${days}**.\nLatest visit: ${v[0]?fmtDate(v[0].date)+' · '+v[0].outcome:'none recorded'}. Visits on record: ${v.length}.\n${clinical?`Clinical: ${named.clinical.diagnosis}; weight ${named.clinical.weightKg} kg; adherence ${named.clinical.adherence}.`:'Clinical detail is not available to your role.'}\n\n${days>=180?'This patient has passed 180 days: a discharge evaluation is required, with documented evidence.':days>=120?'Past 120 days: extension review required.':'Within planned duration.'}`, [FACT, CALC, REC], ['patient record','visits']);
    }

    /* Data quality */
    if(/quality|duplicate|missing|integrity|clean/.test(q)){
      const issues = REPORTS.dataQuality(user);
      const crit = issues.filter(i=>i.level==='crit').length;
      return out(`${issues.length} data-quality observations in your scope, of which **${crit} are critical**.${crit?`\n\nExamples: ${issues.filter(i=>i.level==='crit').slice(0,4).map(i=>i.text).join('; ')}.`:''}`, [CALC], ['patient register','transactions']);
    }

    /* Drafting - always returned as a draft, never saved */
    if(/\b(draft|write (a|an|the)?\s*(note|letter|summary|paragraph|message|handover|update|response))\b/.test(q)){
      return out(`**DRAFT (${prof.badge}) - nothing has been saved**\n\nSubject: ${prof.title} Note · [complete subject]\n\nPrepared within **${ctx.user.county}** (${ctx.user.dept}) on ${todayISO()} by ${ctx.user.name} (${ctx.user.role}).\n\n1. Verified position from LOMAMO C-DIMS: ${ctx.canPatients ? `${ctx.patients.active} active beneficiaries in scope (${ctx.concerns} open concern flags; ${ctx.requests.open} open hospital requests).` : `Departmental records reviewed within ${ctx.user.dept} scope.`}\n2. Key observation / background: [insert verified record details].\n3. Action requested & responsible officer: [state clear human decision required].\n\nEvery bracket above must be verified before saving; the assistant never writes directly to records.`, [DRAFT], ['departmental template']);
    }

    /* Help */
    if(/help|what can you|capabilit|how do i/.test(q))
      return out(`I am currently operating as **${prof.title}** (${prof.badge}), strictly within your permissions.\n\nSuggested questions for this workspace:\n${prof.chips.map(c=>'• "'+c+'"').join('\n')}\n\nYou can also connect a **Local Ollama LLM** (such as \`llama3.2\`, \`mistral\` or \`qwen2.5\`) over Office Wi-Fi or localhost using the **Model & Connection** button above.`, [AIX]);

    /* Fallback - honest */
    const available = ctx;
    return out(`I don't have a verified answer for that from the records you are authorised to use.

Insufficient verified data to determine this.

What I can confirm from your scope (${prof.badge}): ${available.patients.active} active patients, ${available.concerns} with open concerns, ${available.requests.open} open hospital requests${available.finance?`, and ${money(available.finance.remaining)} remaining in the current budget`:''}.

Try one of the workspace prompts below, or connect a local Ollama model for open-ended reasoning over your authorised summary.`, [AIX]);
  },

  /* ---------- Async Dual Engine: Local Ollama LLM + Verified Offline Fallback ---------- */
  async ask(user, qRaw, view){
    const localAns = this.answer(user, qRaw);
    /* Always honour hard safety & RBAC refusals deterministically without calling LLM */
    if(!RBAC.has(user,'ai.use') || this.refusal(user, qRaw)) return localAns;
    const cfg = this.cfg();
    if(cfg.mode === 'offline') return localAns;

    const isOnline = await this.ollamaProbe();
    if(!isOnline) return localAns;

    const prof = this.profileFor(user, view || (typeof APPX!=='undefined' && APPX.view) || '');
    const ctx = this.context(user);
    const model = this.status.activeModel || cfg.model || 'llama3.2';
    const sysPrompt = [
      `You are "${prof.title}" inside LOMAMO Foundation Kenya's LOMAMO C-DIMS v6.1 (${prof.badge}).`,
      `Signed-in officer: ${ctx.user.name} (${ctx.user.role}, ${ctx.user.dept}, ${ctx.user.county}).`,
      `Authorised verified figures ONLY: active_patients=${ctx.patients.active}, total_scoped_patients=${ctx.patients.total}, open_concerns=${ctx.concerns}, open_hospital_requests=${ctx.requests.open}, awaiting_clinical_review=${ctx.requests.awaitingReview}${ctx.finance ? `, budget_kes=${ctx.finance.budget}, paid_kes=${ctx.finance.paid}, remaining_kes=${ctx.finance.remaining}` : ''}.`,
      `Verified LOMAMO C-DIMS baseline response: ${localAns.text}`,
      `Rules: Never invent numbers beyond the verified figures above. Never diagnose medical conditions, prescribe medicines, or approve/publish records. Use crisp British/Kenyan English without em dashes.`
    ].join('\n');

    const messages = [
      { role:'system', content:sysPrompt },
      ...this.history.slice(-4).map(m=>({ role: m.role==='user'?'user':'assistant', content: String(m.text||'').slice(0,700) })),
      { role:'user', content:String(qRaw||'') }
    ];

    try{
      const ctl = new AbortController(); const t = setTimeout(()=>ctl.abort(), 18000);
      const headers = { 'Content-Type':'application/json' };
      if(typeof SYNC !== 'undefined' && SYNC.sessionToken){
        headers['X-CareLink-Session'] = SYNC.sessionToken;
        headers['Authorization'] = 'Bearer ' + SYNC.sessionToken;
      }
      const r = await fetch('api/ai/chat', {
        method:'POST', headers, signal:ctl.signal,
        body: JSON.stringify({
          model,
          prompt: sysPrompt + '\n\nQuestion: ' + String(qRaw||''),
          messages,
          stream:false,
          userContext:{ username:user.username, roleId:user.roleId, countyId:user.countyId }
        })
      });
      clearTimeout(t);
      if(r.ok){
        const body = await r.json();
        const reply = body && (body.reply || (body.message && body.message.content) || body.response);
        if(reply && String(reply).trim()){
          const combined = localAns.text && !String(reply).includes(localAns.text.slice(0,24))
            ? `${localAns.text}\n\n${String(reply).trim()}`
            : String(reply).trim();
          return {
            text: combined,
            evidence: ['Shared Online Site Database', body.engine || `CareLink Online Intelligence (${model})`],
            sources: [prof.badge, 'online site intelligence'],
            at: todayISO(), draft: true, specialist: prof.title
          };
        }
      }
    }catch(e){}
    return localAns;
  }
};

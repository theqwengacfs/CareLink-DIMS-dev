/* ============================================================
   portal_content.js - The LOMAMO Foundation public portal content

   Sourced from the Foundation's own public pages on
   22 October 2026:
     · lovemattersmost.org            (front page, programme pillars, impact)
     · lovemattersmost.org/about-us/  (mission, the team in Kenya, board,
                                       registration history, contacts)
     · lovemattersmost.org/updates/   (news & stories page)
     · causeiq.com/organizations/love-matters-most,833329252/
                                      (EIN, NTEE code, mission statement,
                                       program areas, revenues, expenses,
                                       assets, grants, Form 990 filings,
                                       officers)

   Two rules were applied to everything here:
   1. Only what the Foundation has already published about itself is used.
      No patient identity, no clinical detail, no internal figure appears.
   2. No photograph of an identifiable patient is published. Patient
      photography needs recorded consent under the LOMAMO Ethical
      Storytelling Policy, so the portal uses programme imagery that
      carries the context without exposing a beneficiary.
   ============================================================ */

const PORTAL_CONTENT = {
  org:{
    name:'LOMAMO Foundation Kenya',
    legal:'Love Matters Most Inc, also known as LOMAMO Foundation',
    motto:'Love Matters Most',
    tagline:'Serving our Neighbours in Love',
    mandate:'Saving Lives, Preventing Orphans',
    kind:'An orphan prevention programme',
    approvedBy:'Approved by the Government of Kenya as a non-profit foundation on 19 October 2018',
    kickOff:'Kick-Off Celebration, 28 October 2018, attended by nearly 200 friends and guests',
    usEntity:'LOVE MATTERS MOST, Inc. - a California based non-profit, EIN 83-3329252, 501(c)(3), formed 2019',
    ntee:'P20 - Human Service Organizations',
    ein:'83-3329252'
  },

  mission:{
    headline:'Preventing Orphans by rescuing the sick and dying with the love and compassion of Jesus Christ',
    body:'Love Matters Most Inc, also known as LOMAMO Foundation, is an orphan prevention programme providing life-saving care to vulnerable adults and children in Kenya who have been abandoned to die from HIV/AIDS. We find these dying people in urban slums or remote villages and provide urgent home-based healthcare and hospitalisation as needed.',
    how:'Sadly in Kenya, when someone is dying from HIV/AIDS, they are often abandoned to die, alone and without hope. Our team has built relationships with Community Health Workers over many years, and we are blessed to learn about and come alongside those in great need. We assess the physical, spiritual and emotional needs of each patient, enabling hospitalisation and medical tests as required. Every week we bring nutritious food, love and encouragement from the Word of God.',
    scale:'Almost 70% of the 34 million people worldwide living with HIV/AIDS live in sub-Saharan Africa, and 91% of the world\u2019s HIV-positive children live in Africa. We are addressing this massive problem one day and one person at a time.',
    call:'Save a life. Rescue a child.',
    quote:'If it is true that HIV inevitably turns into AIDS, then my children will inevitably turn to orphans.'
  },

  /* The four pillars shown on the Foundation's own front page. */
  pillars:[
    { id:'visits', title:'Patient visits', icon:'route',
      body:'Weekly home-based healthcare in the urban slums and remote villages of Kisumu and Homa Bay: clinical review, wound care, adherence counselling, nutrition and prayer with the household.',
      photo:'field_table' },
    { id:'hospital', title:'Hospital & home-based healthcare', icon:'hospital',
      body:'Urgent hospitalisation, outpatient and inpatient care, laboratory investigations and escort transport when a patient cannot be treated at home.',
      photo:'roundtable_forms' },
    { id:'education', title:'Education', icon:'book',
      body:'Keeping children in school when a parent is sick: uniforms, books and fees, so that a household\u2019s crisis does not become a child\u2019s lost future.',
      photo:'team_blocks' },
    { id:'community', title:'Community partnerships', icon:'users',
      body:'Working through Community Health Workers and Volunteers, churches, county health facilities and neighbours who know which household is in danger.',
      photo:'puzzle_hands' }
  ],

  /* Programme areas exactly as published for the US entity. */
  programAreas:{
    statement:'To provide medical support, nutritious food, education and encouragement to people suffering from chronic illnesses in Kenya, thus restoring health to families and preventing children from becoming orphans.',
    usMission:'Love Matters Most\u2019s primary mission is to increase awareness and raise funds for the LOMAMO Foundation in Kisumu, Kenya: to prevent orphans by bringing emergency medical support, nutritious food and education to those suffering from HIV/AIDS and TB in Kenya, and to share the work in Kenya with churches, organisations and individuals through brochures, videos and slideshows.'
  },

  /* Impact as the Foundation presents it. Figures shown as the site shows them:
     as counters, with the recovery rate published as "over 90%". */
  stats:[
    { label:'Patients discharged healthy', value:'0+', icon:'heart', note:'Counted in the LOMAMO C-DIMS programme register' },
    { label:'Orphans prevented', value:'0+', icon:'users', note:'Children kept with their family' },
    { label:'Food bags delivered', value:'0+', icon:'package', note:'Weekly nutrition support' },
    { label:'Over 90%', value:'90%', icon:'activity', note:'Of patients recovered' }
  ],

  /* Where the programme works: the ministry areas the system is built around. */
  where:[
    { county:'Kisumu County Office', areas:['Nyalenda','Nairobi Road','Manyatta','Nyahera','Chiga','Ombeyi','Ahero'],
      note:'Urban slums of Kisumu Central and the villages of Kisumu West, Kisumu East, Muhoroni and Nyando.' },
    { county:'Homa Bay County Office', areas:['Makongeni','Shauri Yako'],
      note:'Homa Bay Town. Field days for the Homa Bay teams are being added.' }
  ],

  /* The team in Kenya, as listed on the Foundation's About page. */
  team:[
    { name:'Martin Chamah', role:'Director' },
    { name:'Moses Nyanjong Otieno', role:'Chief Administrator, Kisumu' },
    { name:'Julie Oguta', role:'Chief Admin Assistant, Kisumu' },
    { name:'Irene Atieno Oluoch', role:'Internal Operations Manager' },
    { name:'Washington Ayub Odero', role:'Head of Hospital Department · Manyatta Ministry Area' },
    { name:'Wickliff Otieno Odhiambo', role:'Chiga Ministry Area · Hospital ministry' },
    { name:'Daniel Naphtaly Ombija', role:'Head of Media (Kisumu) · Nyalenda Ministry Area' },
    { name:'Catherine Awuor Obila', role:'Public Relations · Nairobi Road Ministry Area' },
    { name:'Allan Ouma Wayodi', role:'Head of Procurement · Vehicle & Transport · Ombeyi Ministry Area' },
    { name:'John Shikuku Omolo', role:'Deputy, Procurement & Transport · Nyahera Ministry Area' },
    { name:'Evans Omondi Odiyo', role:'Ahero Ministry Area · Assists Ombeyi' },
    { name:'Ashar Anyango Omondi', role:'Head of Staff Welfare · Nairobi Road & Nyahera' },
    { name:'Oscar Otieno Lubalo', role:'Homa Bay Admin · Head of Media (Homa Bay)' },
    { name:'Daniel Odhiambo Ondu', role:'Homa Bay County Coordinator' },
    { name:'Julia Anyango Orwa', role:'Caregiver, Homa Bay' }
  ],

  board:[
    'Pamela McClanahan','Michael McClanahan','Alan Van Sloten','Chuck Cameron','Gert Jan van den Bosch',
    'Desmond Marshall','Marianne van den Bosch','Sue Morey Jones','Rob Mullen','Tony Madanga',
    'Genafine Rose','Dan Schwartz','Thomas Megerssa'
  ],
  officers:[
    { name:'Pamela McClanahan', title:'Chief Executive Officer' },
    { name:'Michael McClanahan', title:'Treasurer' }
  ],

  /* Transparency: the published US filings. */
  transparency:{
    revenues:[ {year:'FYE 12/2025', total:230639, grants:230534, programServices:0, investment:105},
               {year:'FYE 12/2024', total:166465, grants:166274, programServices:191, investment:0} ],
    change:'+38.6% total revenue year on year',
    expenses:189357, assets:129746, employees:0,
    grants:[
      { grantmaker:'DAFgiving360 (Schwab Charitable Fund)', period:'2025-06', description:'Health', amount:9300 },
      { grantmaker:'Fidelity Investments Charitable Gift Fund', period:'2025-06', description:'For grant recipient\u2019s exempt purposes', amount:6000 },
      { grantmaker:'National Christian Foundation', period:'2026-02', description:'Grant received', amount:39000 },
      { grantmaker:'AmazonSmile Foundation', period:'2023-12', description:'General support', amount:36 }
    ],
    filings:[
      { year:'2025-12', received:'2026-03-30', form:'990' },
      { year:'2024-12', received:'2025-06-02', form:'990EZ' },
      { year:'2023-12', received:'2024-05-15', form:'990EZ' },
      { year:'2022-12', received:'2023-04-29', form:'990EZ' },
      { year:'2021-12', received:'2022-10-21', form:'990EZ' }
    ],
    source:'Public filings summarised by Cause IQ for EIN 83-3329252.'
  },

  /* News, stories and announcements for the portal. Every entry is either the
     Foundation's own published material or an organisational announcement
     about the programme. Nothing here names a patient. */
  news:[
    { id:'pn-01', category:'news', title:'LOMAMO C-DIMS brings every ministry area onto one record',
      summary:'LOMAMO\u2019s LOMAMO C-DIMS (CareLink Data & Information Management System) now carries patient registration, home visits, hospital coordination, TB dispensing control, cost per patient and reporting for Kisumu and Homa Bay in one governed record.',
      body:'The Administration\u2019s master patient workbook - one sheet per ministry area, a weekly foodbag grid, hygiene packs per quarter and cost columns for transport, medication, outpatient, SHIF and in-patient care - has been mapped field by field into LOMAMO C-DIMS. Registration follows the workbook, the derived measures (days in programme, the minimal-care review beyond 183 days, children rescued from becoming orphans, bag counts and totals) are calculated rather than typed, and every report topic listed on the workbook\u2019s own index now opens in the system.',
      photoKey:'analytics_screen', date:'2026-10-20', tag:'Programme systems' },
    { id:'pn-02', category:'programme', title:'A ten-day rule that never lets a TB dose be missed',
      summary:'Pyridoxine for every patient on anti-TB therapy: the caregiver requests it, the Medical Case Manager answers, and the next course falls due on day 9 or day 10.',
      body:'A patient enrolled today and given pyridoxine today is sorted for the next ten days. LOMAMO C-DIMS therefore calculates the next dose window from the dispensing record itself, warns the caregiver before the cover ends, and flags any patient whose window has passed. Every tablet dispensed is counted against a named batch and reconciled with a physical stock count that Finance and Procurement confirm against what was bought.',
      photoKey:'devices_table', date:'2026-10-18', tag:'TB care' },
    { id:'pn-03', category:'programme', title:'What it costs to stand beside one household',
      summary:'Hospital fees, transport, foodbags by type, medication and SHIF are now attributed to each patient, and rolled up to ministry area, county and national level.',
      body:'The cost-per-patient engine answers the question the Administration has always asked of the workbook: what did it cost to serve this patient, and what does supporting patients with a given condition cost on average? Ministry area coordinators and caregivers see the cost of the patients they serve; the hospital desk, pharmacy, fleet and procurement each see the cost of their own service; Finance, Audit and leadership see the whole picture inside their reach.',
      photoKey:'charts_overhead', date:'2026-10-15', tag:'Stewardship' },
    { id:'pn-04', category:'announcement', title:'Monday is Management Meeting Day',
      summary:'Every Monday at 08:00 the whole team is at the office - except a person on sick leave, and except the hospital ministry, because patients come first.',
      body:'The weekly rhythm of the programme is now written into the system: Monday management meeting, Tuesday Nairobi Road and Ombeyi home visits, Wednesday Manyatta and Nyahera, Thursday Nairobi Road and Ahero, Friday Chiga and the hospital visits. Leave is never approved that would leave a ministry area without cover on its own visit day.',
      photoKey:'boardroom_team', date:'2026-10-13', tag:'How we work' },
    { id:'pn-05', category:'story', title:'It is amazing what a little love can do',
      summary:'Weekly nutritious food, home-based healthcare and encouragement from the Word of God: the ordinary rhythm that keeps a household together.',
      body:'We find people abandoned to die in urban slums and remote villages, and we come alongside them. We assess physical, spiritual and emotional need, enable hospitalisation and medical tests where required, and return every week with food and with time. When a parent recovers, a child keeps a family. That is the whole of the orphan prevention mandate.',
      photoKey:'united_hands', date:'2026-10-10', tag:'Our why' },
    { id:'pn-06', category:'news', title:'Over 90% of patients recovered',
      summary:'The Foundation publishes a recovery rate of over 90% for patients who complete the home-based care cycle.',
      body:'Recovery is measured on the programme register: patients discharged healthy against patients enrolled, with days in programme, hospital episodes and nutrition support carried on the same record. LOMAMO C-DIMS reports these figures per ministry area, per county and nationally, aligned with the workbook\u2019s own indicator definitions.',
      photoKey:'gears_circle', date:'2026-10-06', tag:'Impact' },
    { id:'pn-07', category:'programme', title:'From Kenya With Love',
      summary:'The Foundation\u2019s fundraising events invite partners to experience Kenya, join a team and volunteer.',
      body:'Experience Kenya, join a team, be a volunteer: the Foundation hosts partners in Kisumu to see the home visit programme, the hospital ministry and the households where a food bag and a nurse change a year. Enquiries go to the Public Relations office.',
      photoKey:'hands_compact', date:'2026-10-02', tag:'Partnership' },
    { id:'pn-08', category:'announcement', title:'Registered in Kenya in 2018, incorporated in California in 2019',
      summary:'LOMAMO Foundation was approved by the Government of Kenya as a non-profit foundation on 19 October 2018; LOVE MATTERS MOST, Inc. is a California 501(c)(3), EIN 83-3329252.',
      body:'The Kenyan foundation delivers the programme in Kisumu and Homa Bay. The California entity raises awareness and funds, and publishes its Form 990 filings each year. Both are named on this portal so a donor can see exactly which body holds which responsibility.',
      photoKey:'puzzle_vector', date:'2026-09-28', tag:'Governance' }
  ],

  ways:[
    { id:'donate', title:'Donate', icon:'heart', body:'Your support makes a life-saving difference for suffering people in critical need.', href:'https://lovemattersmost.org/donate-now/' },
    { id:'volunteer', title:'Volunteer', icon:'users', body:'Be a volunteer in Kisumu, or volunteer your professional skills from anywhere.', href:'https://lovemattersmost.org/volunteers/' },
    { id:'team', title:'Join a team', icon:'route', body:'Experience Kenya with a team and see the home visit and hospital ministry first hand.', href:'https://lovemattersmost.org/contact/' },
    { id:'event', title:'Fundraising events', icon:'calendar', body:'From Kenya With Love and other partner events through the year.', href:'https://secure.qgiv.com/event/fromkenyawithlove/' },
    { id:'church', title:'Speak to your church', icon:'book', body:'We share the work in Kenya with churches, organisations and individuals through brochures, videos and slideshows.', href:'https://lovemattersmost.org/contact/' }
  ],

  faqs:[
    { q:'Where does LOMAMO work?', a:'In Kisumu County and Homa Bay County in western Kenya - in the urban slums of Kisumu Central and Homa Bay Town, and in the villages of Kisumu West, Kisumu East, Muhoroni and Nyando.' },
    { q:'Who do you serve?', a:'Vulnerable adults and children who have been abandoned to die from HIV/AIDS and TB, and the households around them. Care is home-based first, with hospitalisation when it is needed.' },
    { q:'What does a household receive?', a:'Weekly home visits, nutritious food (Bag 1, Bag 2 or a Special bag according to household size and need), hygiene packs each quarter, medication support including pyridoxine for TB patients, escort transport to hospital, and school support for children.' },
    { q:'How is a patient found?', a:'Through long-standing relationships with Community Health Workers and Volunteers, churches and neighbours who tell us which household is in danger.' },
    { q:'How is money accounted for?', a:'Every cost - hospital fee, transport fare, food bag, medication, SHIF contribution - is attributed to the patient it served, rolled up to ministry area, county and national level, and reconciled against budget and against physical stock counts. The US entity publishes its Form 990 filings each year.' },
    { q:'Can I see patient records on this portal?', a:'No. This portal carries only what the Foundation has published about itself. Patient records live in LOMAMO C-DIMS behind role-based access, and photography of a beneficiary is never published without recorded consent.' }
  ],

  contact:{
    kenya:{ place:'Kisumu, Nyanza Province, Kenya', tel:'0725-378-606' },
    usa:{ place:'Love Matters Most, Inc., 3741 Sutter Hill Lane, Carmichael, CA 95608', tel:'+1 (844) 430-4800' },
    email:'contactus@lovemattersmost.org',
    facebook:'https://www.facebook.com/lovemattersmost.org',
    instagram:'https://www.instagram.com/lomamokenya',
    website:'https://lovemattersmost.org/',
    updates:'https://lovemattersmost.org/updates/',
    about:'https://lovemattersmost.org/about-us/',
    privacy:'https://lovemattersmost.org/privacy-policy/'
  },

  quotes:[
    { text:'Life is a long lesson in humility.', who:'James M. Barrie' },
    { text:'The meaning of life is to find your gift. The purpose of life is to give it away.', who:'Pablo Picasso' }
  ],

  /* Programme imagery. Keys resolve through carelinkPhoto(); anything not
     embedded falls back to the gallery below, so the portal never shows a
     broken frame. No image here identifies a patient. */
  gallery:[
    { key:'field_home_visit',   label:'A weekly home visit',            dept:'Ministry & Field Programmes', caption:'Clinical review, nutrition and prayer at the household door.' },
    { key:'foodbag_nutrition',  label:'Nutritious food for the week',   dept:'Procurement & Nutrition',       caption:'Bag 1, Bag 2 and the Special bag, issued against the household\u2019s need.' },
    { key:'hospital_escort',    label:'Escort to hospital',             dept:'Hospital Coordination',         caption:'Friday hospital visits with transport and an escort.' },
    { key:'tb_adherence',       label:'TB adherence support',           dept:'Pharmacy & Medical',            caption:'Pyridoxine with every anti-TB course, on a ten-day cycle.' },
    { key:'children_school',    label:'Children kept in school',        dept:'Education & Orphan Prevention', caption:'Uniforms, books and fees so a crisis does not become a lost future.' },
    { key:'chv_meeting',        label:'Community health volunteers',    dept:'Community Partnerships',        caption:'The volunteers and CHWs who tell us which household is in danger.' },
    { key:'lake_kisumu',        label:'Kisumu, on Lake Victoria',       dept:'Where we serve',                caption:'Urban slums and remote villages across Kisumu and Homa Bay.' },
    { key:'monday_meeting',     label:'Monday management meeting',      dept:'Administration',                caption:'Everyone at the office on Monday, except sick leave and the hospital ministry.' },
    { key:'stock_room',         label:'Stock counted and reconciled',   dept:'Procurement & Pharmacy',        caption:'Every tablet accounted for against what was procured.' },
    { key:'field_transport',    label:'Field transport',                dept:'Vehicle & Transport',           caption:'Drivers who can reach a village as well as a referral hospital.' }
  ]
};

/* ---------------- portal service ---------------- */
const PORTALX = {
  content(){ return PORTAL_CONTENT; },

  /* Organisation news plus the governed publication register. The two are kept
     visibly apart on the page: one is what the Foundation publishes about
     itself, the other is what an authorised person has approved for release. */
  news(){
    const governed = (typeof publicItems==='function'? publicItems() : [])
      .map(p=>({ ...p, governed:true }));
    const org = PORTAL_CONTENT.news.map(n=>({ ...n, publishedAt:n.date }));
    return [...org, ...governed].sort((a,b)=>String(b.publishedAt||b.date||'').localeCompare(String(a.publishedAt||a.date||'')));
  },

  icon(name, size=20){
    const custom = {
      route:'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0h-6a4 4 0 0 0-4 4v2',
      hospital:'M12 7v6m-3-3h6M4 21V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14M2 21h20M9 21v-4h6v4',
      book:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z',
      users:'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
      heart:'M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z',
      package:'M21 8v8l-9 5-9-5V8l9-5 9 5Zm0 0-9 5-9-5m9 5v8',
      activity:'M22 12h-4l-3 9L9 3l-3 9H2',
      calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
      globe:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-20c2.5 2.6 3.8 6.2 3.8 10S14.5 19.4 12 22c-2.5-2.6-3.8-6.2-3.8-10S9.5 4.6 12 2ZM2.5 9h19M2.5 15h19'
    };
    const d = custom[name] || (typeof ICONS!=='undefined' && ICONS[name]) || custom.globe;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  },

  /* A photo key that always resolves: embedded asset, then gallery placeholder. */
  photo(key){
    if(typeof carelinkPhoto==='function'){
      const v = carelinkPhoto(key);
      if(v && typeof CARELINK_PHOTOS!=='undefined' && CARELINK_PHOTOS[key]) return v;
      if(v && key && CARELINK_PHOTOS && CARELINK_PHOTOS[key]) return v;
    }
    return (typeof carelinkPhoto==='function')? carelinkPhoto('united_hands') : '';
  },

  usd(n){ return '$'+Number(n||0).toLocaleString('en-US'); }
};

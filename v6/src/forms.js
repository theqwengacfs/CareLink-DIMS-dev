/* ============================================================
   forms.js - The six LOMAMO paper forms, digitised field for field.

   The paper form remains the primary field record. This module lets a
   caregiver or an administrative assistant enter the same fields, keeps a
   draft, submits it for verification and prints a branded copy that matches
   the paper layout, including the printed numbering gaps and the
   "Page 4 of 3" anomaly on the minor assessment form.

   Nothing is inferred. A field that was not on the supplied scan is not
   invented: the form says so, and the record carries a data-quality note.
   ============================================================ */

const FORM_KINDS = {
  patient_assessment: {
    id:'patient_assessment', code:'LMMK 001', formNo:'LMMK 001',
    title:'LOMAMO Patient Assessment Form', short:'Patient assessment',
    pages:4, verifiedBy:'form.verify',
    source:'LOMAMO PATIENT ASSESSMENT FORM.pdf, 4 pages, edited 11 December 2025',
    notes:['Fields follow the supplied four-page scan exactly.'],
    subtitle:'LOVE MATTERS MOST MINISTRY KISUMU'
  },
  minor_assessment: {
    id:'minor_assessment', code:'LMMK 004', formNo:'LMMK 004',
    title:'LOMAMO Minor Child Assessment / Intake Form', short:'Minor assessment',
    pages:4, verifiedBy:'form.verify',
    source:'LOMAMO MINOR ASSESSMENT FORM.pdf, 4 pages, edited 19 July 2022-P',
    notes:['The paper copy prints "Page 4 of 3" on its last page. The reproduction keeps that anomaly; this system records four pages.'],
    subtitle:'LOVE MATTERS MOST MINISTRY KISUMU'
  },
  home_visit: {
    id:'home_visit', code:'LMMK-', formNo:'LMMK-',
    title:'LOMAMO Home Visit Form', short:'Home visit',
    pages:2, verifiedBy:'form.verify',
    source:'LOMAMO HOME VISIT FORM.pdf, 2 pages, edited 1 July 2024',
    notes:['The form number is printed as "LMMK-" with no number on the supplied scan.'],
    subtitle:''
  },
  hospital_outpatient: {
    id:'hospital_outpatient', code:'LMMK 020', formNo:'LMMK 020',
    title:'LOMAMO Outpatient Hospital Visit Form', short:'Hospital outpatient',
    pages:2, verifiedBy:'form.verify',
    source:'LOMAMO HOSPITAL OUTPATIENT VISIT FORM.pdf, 2 pages, edited 19 July 2022-P',
    notes:['The supplied scan numbers its second page 10, 12, 13 and 14. Questions 6 to 9 and 11 are not on the scan and have not been invented.'],
    subtitle:''
  },
  hospital_inpatient: {
    id:'hospital_inpatient', code:'LMMK 020', formNo:'LMMK 020',
    title:'LOMAMO Inpatient Hospital Visit Form', short:'Hospital inpatient',
    pages:2, verifiedBy:'form.verify',
    source:'LOMAMO HOSPITAL INPATIENT VISIT FORM.pdf, 2 pages, edited 1 July 2024',
    notes:['The supplied scan jumps from question 6 to 9 and has no question 7, 8 or 11. They have not been invented.',
           'Both hospital forms share the printed number LMMK 020. They are separate records here.'],
    subtitle:''
  },
  discharge: {
    id:'discharge', code:'DISCHARGE', formNo:'',
    title:'Patient Discharge Form', short:'Discharge',
    pages:2, verifiedBy:'form.verify',
    source:'LOMAMO PATIENT DISCHARGE FORM.pdf, 1 page supplied; the form prints "Page 1 of 2"',
    notes:['Only page 1 of 2 was supplied. Page 2 is not in the upload and has not been invented; the record is marked PARTIAL.'],
    subtitle:'THIS FORM IS TO BE PREPARED IN ADVANCE OF PATIENT DISCHARGE VISIT',
    partial:true
  }
};

const YESNO  = ['Yes','No'];
const YNN    = ['Yes','No','N/A'];
const SEX    = ['Male','Female'];
const MARITAL= ['Married','Single','Widowed','Separated'];
const FREQ   = ['Every week','Every other week','Food ONLY','Medical ONLY'];
const ARVS   = ['TDL','CTX','Lamivudine','Zidovudine','Efavirenz','Tenofovir','ACT','3CT','Aluvir'];
const EXTRA  = ['Bible','Saved','Equipment','Blanket','Mattress','Mackintosh'];

/* A field: {k:key, l:label, t:type, o:options, req:required, hint, half}
   Types: text, date, number, area, select, radio, checks, textarea, computed */
function F(k,l,t='text',o={}){ return {k,l,t,...o}; }

const FORM_SPECS = {
  patient_assessment: [
    { page:1, section:'Assessment', fields:[
      F('assessmentDate','Assessment date','date',{req:true,half:true}),
      F('intakeDate','Intake date','date',{half:true}),
      F('reintakeDate','Re-intake date','date',{half:true}),
      F('referredBy','Referred by','text',{half:true}),
      F('referralDate','Referral date','date',{half:true}),
      F('name','Patient name','text',{req:true,full:true}),
      F('photoTaken','Photo taken','select',{o:YESNO}),
      F('sex','Sex','select',{o:SEX}),
      F('age','Age (years)','number',{min:0,max:120,half:true}),
      F('weightKg','Weight (kg)','number',{min:0.5,max:250,step:'0.1',half:true}),
      F('heightCm','Height (cm)','number',{min:30,max:250,step:'0.1',half:true}),
      F('bmi','BMI (calculated)','computed',{half:true}),
      F('education','Education history','text',{full:true}),
      F('phones','Phone numbers','text',{half:true}),
      F('idNumber','ID number','text',{half:true}),
      F('areaLocation','Area / location','area',{req:true})
    ]},
    { page:1, section:'Family', fields:[
      F('maritalStatus','Marital status','select',{o:MARITAL}),
      F('spouseName','Spouse name','text',{half:true}),
      F('spouseId','Spouse ID number','text',{half:true}),
      F('child1','Child 1 (name / age / HIV pos or neg / vaccinated)','text',{full:true}),
      F('child2','Child 2','text',{full:true}),
      F('child3','Child 3','text',{full:true}),
      F('child4','Child 4','text',{full:true}),
      F('totalPersonsHome','Total persons living in the home today','number',{min:0,max:40,half:true}),
      F('relationship','Relationship','text',{half:true})
    ]},
    { page:1, section:'Physical health', fields:[
      F('chiefComplaints','Chief complaints and duration','textarea',{req:true,full:true}),
      F('doctorDiagnosis','Doctor diagnosis','text',{half:true}),
      F('lastSawDoctor','Date last saw doctor','date',{half:true})
    ]},
    { page:2, section:'Treatment', fields:[
      F('currentTreatment','Current treatment','text',{half:true}),
      F('medicationsToDate','Medications up to date','text',{half:true}),
      F('chronicDiagnosed','Date chronic condition was diagnosed','date',{half:true})
    ]},
    { page:2, section:'HIV information', fields:[
      F('hivPositive','HIV positive','select',{o:YESNO}),
      F('dateConfirmed','Date HIV confirmed','date',{half:true}),
      F('dateMedsStarted','Date HIV medication started','date',{half:true}),
      F('cardNumber','Card number','text',{half:true}),
      F('clinicName','Clinic name','text',{half:true}),
      F('arvs','ARVs in use','checks',{o:ARVS,full:true}),
      F('otherArvMeds','List other medications','text',{full:true}),
      F('septrin','Septrin','select',{o:YESNO,half:true}),
      F('takingMedsCorrectly','Taking medication correctly','select',{o:YESNO,half:true}),
      F('medicationSchedule','Medication schedule','text',{half:true})
    ]},
    { page:2, section:'TB information', fields:[
      F('tbDiagnosis','TB diagnosis','select',{o:YESNO}),
      F('tbDiagnosisDate','TB diagnosis date','date',{half:true}),
      F('tbType','Type','select',{o:['Pulmonary','Extrapulmonary']}),
      F('pmhTb','Past medical history of TB','select',{o:YESNO,half:true}),
      F('tbMedication','TB medication prescribed','text',{full:true}),
      F('tbStarted','TB medication started','date',{half:true}),
      F('takingTbProperly','Taking TB medication properly','select',{o:YESNO,half:true})
    ]},
    { page:2, section:'Allergies and hospitalisation', fields:[
      F('medicationAllergies','Medication allergies','select',{o:YESNO}),
      F('allergyList','If yes, list the allergies','text',{full:true}),
      F('hospitalised','Ever hospitalised','select',{o:YESNO,half:true}),
      F('hospitalName','Hospital name','text',{half:true}),
      F('hospitalDiagnosis','Diagnosis','text',{full:true}),
      F('dateAdmitted','Date admitted','date',{half:true}),
      F('daysInHospital','Number of days in hospital','number',{min:0,half:true}),
      F('dischargePapers','Discharge papers or letter','select',{o:YESNO,half:true}),
      F('hospitalDischargeDate','Discharge date','date',{half:true})
    ]},
    { page:2, section:'Wound care', fields:[
      F('woundBegan','Date the wound began','date',{half:true}),
      F('woundLocation','Wound location','text',{half:true}),
      F('doctorSeenWound','Patient has seen a doctor about the wound','select',{o:YESNO}),
      F('woundPicture','Wound picture taken','select',{o:YESNO,half:true}),
      F('woundDoctorDiagnosis','Doctor diagnosis','text',{full:true})
    ]},
    { page:3, section:'Wound treatment and schedule', fields:[
      F('woundTreatmentPrescribed','Medication or dressings prescribed and used','select',{o:YESNO}),
      F('woundMeds','List medications','text',{full:true}),
      F('tetanusRabies','Vaccinated against tetanus or rabies','select',{o:YESNO,half:true}),
      F('visitationSchedule','Visitation schedule','select',{o:['Every week (EW)','Every other week (EOW)']}),
      F('foodBag','Food bag','select',{o:YESNO,half:true}),
      F('foodBagType','Bag type','select',{o:['Family bag','Couple bag','Normal bag'],half:true}),
      F('livingSituation','Living situation','select',{o:['Rental','Own home']}),
      F('costSharing','Financial situation: cost sharing','select',{o:YESNO,half:true})
    ]},
    { page:3, section:'NHIF', fields:[
      F('nhif','NHIF','select',{o:YESNO,half:true}),
      F('nhifRegistration','Registration','select',{o:YESNO,half:true}),
      F('nhifNumber','NHIF number','text',{half:true}),
      F('nhifRegDate','Registration date','date',{half:true}),
      F('nhifSponsored','Sponsored by another organisation for NHIF','text',{full:true,hint:'Yes, with the organisation name'}),
      F('nhifHospital','NHIF hospital assignment','select',{o:['JOOTRH','KCH','Other']}),
      F('nhifHospitalOther','If other, name the facility','text',{half:true})
    ]},
    { page:3, section:'Spiritual health', fields:[
      F('religion','Religious affiliation','text',{half:true}),
      F('church','Church attending','text',{half:true}),
      F('saved','Saved','select',{o:YESNO,half:true}),
      F('hasBible','Has a Bible','select',{o:YESNO,half:true}),
      F('wantsBible','Wants a Bible','select',{o:YESNO,half:true}),
      F('bibleLanguage','Language for Bible','text',{half:true}),
      F('notes','Additional notes','textarea',{full:true})
    ]},
    { page:4, section:'Consent and signatures', fields:[
      F('policyExplained','LOMAMO policies explained to the patient and family by','text',{full:true,hint:'Name of the person who explained them'}),
      F('photoConsent','Patient authorises photographs, video and story use','select',{o:YESNO}),
      F('patientSignature','Patient name and signature','text',{full:true}),
      F('guardianSignature','Signed by patient or guardian','text',{full:true}),
      F('rep1Name','Name of LOMAMO representative 1','text',{half:true}),
      F('rep1Signature','Signature of representative 1','text',{half:true}),
      F('rep2Name','Name of LOMAMO representative 2','text',{half:true}),
      F('rep2Signature','Signature of representative 2','text',{half:true}),
      F('dateSigned','Date signed','date',{half:true}),
      F('dataEnteredBy','Data entered by (name and date)','text',{half:true})
    ]}
  ],

  minor_assessment: [
    { page:1, section:'Assessment', fields:[
      F('assessmentDate','Assessment date','date',{req:true,half:true}),
      F('intakeDate','Intake date','date',{half:true}),
      F('reintakeDate','Re-intake date','date',{half:true}),
      F('areaLocation','Area / location','area',{req:true,half:true}),
      F('name','Child name','text',{req:true,full:true}),
      F('photoTaken','Photo taken','select',{o:YESNO,half:true}),
      F('sex','Sex','select',{o:SEX,half:true}),
      F('age','Age (years)','number',{min:0,max:17,half:true}),
      F('weightKg','Weight (kg)','number',{min:0.5,max:120,step:'0.1',half:true}),
      F('heightCm','Height (cm)','number',{min:30,max:220,step:'0.1',half:true}),
      F('birthCertificate','Birth certificate','select',{o:YESNO,half:true}),
      F('birthCertCopy','Birth certificate copy','select',{o:YESNO,half:true}),
      F('immunisationCardCopy','Immunisation card copy','select',{o:YESNO,half:true})
    ]},
    { page:1, section:'Family and guardian', fields:[
      F('parentName','Parent or guardian name','text',{req:true,half:true}),
      F('parentId','Parent or guardian ID number','text',{half:true}),
      F('maritalStatus','Marital status','select',{o:MARITAL}),
      F('spouseName','Spouse name','text',{half:true}),
      F('spouseId','Spouse ID number','text',{half:true}),
      F('childrenHousehold','Children in the household','textarea',{full:true,hint:'Names and ages'}),
      F('schedule','LOMAMO schedule','select',{o:['Every week (EW)','Every other week (EOW)']}),
      F('foodBag','Food bag','select',{o:['Family bag'],half:true}),
      F('extraMilk','Extra food: milk','number',{min:0,half:true}),
      F('extraPorridge','Extra food: porridge','number',{min:0,half:true}),
      F('extraFruit','Extra food: fruit','number',{min:0,half:true}),
      F('livingSituation','Parent living situation','select',{o:['Rental','Own home'],half:true}),
      F('costSharing','Financial situation: cost sharing','select',{o:YESNO,half:true})
    ]},
    { page:1, section:'NHIF', fields:[
      F('nhif','NHIF','select',{o:YESNO,half:true}),
      F('nhifRegistration','Registration','select',{o:YESNO,half:true}),
      F('shifNumber','SHIF number','text',{half:true}),
      F('nhifRegDate','Registration date','date',{half:true}),
      F('nhifSponsored','Sponsored by another organisation for NHIF','text',{full:true,hint:'Yes, with the organisation name'}),
      F('nhifHospital','NHIF hospital assignment','select',{o:['Russia','KCH','Other']}),
      F('nhifHospitalOther','If other, name the facility','text',{half:true})
    ]},
    { page:2, section:'Physical health', fields:[
      F('chiefComplaint','Chief complaint and duration','textarea',{req:true,full:true}),
      F('doctorDiagnosis','Doctor diagnosis','text',{half:true}),
      F('lastSawDoctor','Date last saw doctor','date',{half:true}),
      F('treatmentPlan','Treatment plan','text',{full:true}),
      F('medicationsToDate','Medications up to date','text',{full:true})
    ]},
    { page:2, section:'HIV information', fields:[
      F('hivPositive','HIV positive','select',{o:YESNO}),
      F('dateConfirmed','Date HIV confirmed','date',{half:true}),
      F('dateMedsStarted','Date HIV medication started','date',{half:true}),
      F('cardNumber','Card number','text',{half:true}),
      F('clinicName','Clinic name','text',{half:true}),
      F('arvs','ARVs in use','checks',{o:ARVS,full:true}),
      F('otherArvMeds','List other medications','text',{full:true}),
      F('septrin','Septrin','select',{o:YESNO,half:true}),
      F('takingMedsCorrectly','Taking medication correctly','select',{o:YESNO,half:true}),
      F('medicationSchedule','Medication schedule','text',{half:true})
    ]},
    { page:2, section:'TB information', fields:[
      F('tbDiagnosis','TB diagnosis','select',{o:YESNO}),
      F('tbType','Type','select',{o:['Pulmonary','Extrapulmonary']}),
      F('pmhTb','Past medical history of TB','select',{o:YESNO,half:true}),
      F('tbDiagnosisDate','TB diagnosis date','date',{half:true}),
      F('tbMedication','TB medication prescribed','text',{full:true}),
      F('tbStarted','TB medication started','date',{half:true}),
      F('takingTbProperly','Taking TB medication properly','select',{o:YESNO,half:true})
    ]},
    { page:2, section:'Allergies and hospitalisation', fields:[
      F('medicationAllergies','Medication allergies','select',{o:YESNO}),
      F('allergyList','If yes, list the allergies','text',{full:true}),
      F('hospitalised','Ever hospitalised','select',{o:YESNO,half:true}),
      F('hospitalName','Hospital name','text',{half:true}),
      F('hospitalDiagnosis','Diagnosis','text',{full:true}),
      F('dateAdmitted','Date admitted','date',{half:true}),
      F('daysInHospital','Number of days in hospital','number',{min:0,half:true}),
      F('dischargePapers','Discharge papers or letter','select',{o:YESNO,half:true}),
      F('hospitalDischargeDate','Discharge date','date',{half:true})
    ]},
    { page:3, section:'Wound care', fields:[
      F('woundBegan','Date the wound began','date',{half:true}),
      F('woundLocation','Wound location','text',{half:true}),
      F('doctorSeenWound','Patient has seen a doctor about the wound','select',{o:YESNO}),
      F('woundPicture','Wound picture taken','select',{o:YESNO,half:true}),
      F('woundDoctorDiagnosis','Doctor diagnosis','text',{full:true}),
      F('woundTreatment','Treatment prescribed','select',{o:YESNO,half:true})
    ]},
    { page:3, section:'Family spiritual health and school', fields:[
      F('religion','Religious affiliation','text',{half:true}),
      F('church','Church attending','text',{half:true}),
      F('saved','Saved','select',{o:YESNO,half:true}),
      F('hasBible','Has a Bible','select',{o:YESNO,half:true}),
      F('wantsBible','Wants a Bible','select',{o:YESNO,half:true}),
      F('bibleLanguage','Language for Bible','text',{half:true}),
      F('schoolName','Child school name','text',{half:true}),
      F('schoolContact','School contact and number','text',{half:true}),
      F('notes','Additional notes','textarea',{full:true})
    ]},
    { page:4, section:'Consent and signatures', fields:[
      F('policyExplained','Policies explained to the family or guardian by','text',{full:true}),
      F('photoConsent','Guardian authorises photographs and story use','select',{o:YESNO}),
      F('patientSignature','Child name','text',{full:true}),
      F('parentNameSign','Parent or guardian name','text',{full:true}),
      F('parentSignature','Parent or guardian signature','text',{full:true}),
      F('rep1Name','Name of LOMAMO representative 1','text',{half:true}),
      F('rep1Signature','Signature of representative 1','text',{half:true}),
      F('rep2Name','Name of LOMAMO representative 2','text',{half:true}),
      F('rep2Signature','Signature of representative 2','text',{half:true}),
      F('dateSigned','Date signed','date',{half:true}),
      F('dataEnteredBy','Data entered by (name and date)','text',{half:true})
    ]}
  ],

  home_visit: [
    { page:1, section:'Visit', fields:[
      F('visitDate','Today\'s date','date',{req:true,half:true}),
      F('lastVisitDate','Last visit date','date',{half:true}),
      F('contact','Patient contact information','text',{half:true}),
      F('caregiverName','Caregiver name','text',{req:true,half:true}),
      F('caregiverSignature','Caregiver signature','text',{half:true}),
      F('atHome','1. Patient at home','select',{o:YESNO,req:true,half:true}),
      F('conditionToday','2. Describe the patient\'s condition today and comments shared by the patient','textarea',{req:true,full:true}),
      F('healthRisks','3. Any health risks such as communicable or highly infectious disease to the patient','select',{o:YESNO}),
      F('riskExplain','If yes, explain','textarea',{full:true}),
      F('referred','4. Has the patient been referred to clinic or hospital','select',{o:YESNO}),
      F('whereReferred','Where referred to','text',{half:true}),
      F('referralReasons','Reasons','text',{half:true}),
      F('coveredByLomamo','Covered by LOMAMO','select',{o:YESNO,half:true}),
      F('otherDrugs','5. Does the patient take any drugs other than prescribed ARVs or TB medication','select',{o:YESNO,hint:'Vitamins are not drugs'}),
      F('otherDrugsExplain','If yes, explain','textarea',{full:true}),
      F('arvsAsPrescribed','6. Is the patient taking the ARVs as prescribed','select',{o:YNN,half:true}),
      F('arvList','List ARV medications currently taking','text',{full:true})
    ]},
    { page:2, section:'Medication', fields:[
      F('tbMeds','7. Is the patient taking the TB medication as prescribed','select',{o:YNN,half:true}),
      F('medicationDefault','8. Is the patient in medication default','select',{o:YESNO,half:true}),
      F('medsCounted','Meds counted','select',{o:YESNO,half:true}),
      F('daysInDefault','How many days or pills in default','number',{min:0,half:true}),
      F('defaultNumber','Number of defaults','select',{o:['1st time','2nd time','3rd time','Dismissal from programme']}),
      F('woundCareNeeded','9. Wound care: patient needs wound care','select',{o:YNN,half:true}),
      F('materialsLeft','Materials left for patient to dress wound','select',{o:YESNO,half:true}),
      F('dressingsLeft','Number of dressings left','number',{min:0,half:true}),
      F('salineLeft','Saline left','select',{o:YESNO,half:true}),
      F('salineQty','How many saline','number',{min:0,half:true}),
      F('woundPhotoTaken','Current picture of wound taken','select',{o:YESNO,half:true}),
      F('photoSent','Sent to office','select',{o:YESNO,half:true})
    ]},
    { page:2, section:'Food, vitamins and frequency', fields:[
      F('foodBagDelivered','10. Food bag delivered','select',{o:['Normal bag','Family bag','Couple bag','None'],half:true}),
      F('foodBagCode','Food bag type (master register code)','select',{o:['BG1','BG2','SPB','None'],half:true,
        hint:'BG1 = Bag 1 (normal household), BG2 = Bag 2 (family / couple), SPB = Special bag. These are the codes the Administration\u2019s master register uses, and the cost engine prices the bag from them.'}),
      F('foodBagExtra','Extra','text',{half:true}),
      F('personsSharing','Current number of persons living in the home sharing food bag contents','number',{min:0,half:true}),
      F('changeFromLastVisit','Is this a change from the last visit','select',{o:YESNO,half:true}),
      F('multivitaminsGiven','11. Multivitamins given','select',{o:YESNO,half:true}),
      F('multivitaminDate','Date given','date',{half:true}),
      F('takingMultivitamins','Taking the multivitamins','select',{o:YNN,half:true}),
      F('frequencyStatus','12. Home visit frequency','select',{o:['Same','Change frequency'],half:true}),
      F('frequencyChoice','Frequency chosen','select',{o:FREQ,half:true})
    ]},
    { page:2, section:'Hygiene bag', fields:[
      F('hygieneQuarter','13. Hygiene bag delivered','select',{o:['March','June','September','December','Not this visit']}),
      F('fullContents','Full content given','select',{o:YESNO,half:true}),
      F('extraWaterGuard','Extra Water Guard','select',{o:YESNO,half:true}),
      F('waterGuardQty','How many','number',{min:0,half:true}),
      F('waterGuardDate','Date given','date',{half:true}),
      F('newPatientSupplies','New patient: soap or Water Guard given','select',{o:YESNO,half:true}),
      F('newPatientQty','Quantity','number',{min:0,half:true}),
      F('extraInfo','Extra information','checks',{o:EXTRA,full:true}),
      F('caregiverRecommendation','Caregiver recommendation','textarea',{req:true,full:true}),
      F('dataEnteredBy','Data entered by','text',{half:true}),
      F('dataEnteredDate','Date entered','date',{half:true})
    ]},
    /* Costs registered at the visit. These are the master register's own cost
       columns (EA transport in and out of hospital, EB medication, EC transport,
       ED outpatient, EE SHIF, EG-EJ in-patient 1 to 4) captured where the care
       actually happens, so the cost-per-patient engine can attribute them to
       this patient, this ministry area and this month. */
    { page:2, section:'Costs registered at this visit (KES)', fields:[
      F('hospitalFees','Hospital fees paid at this visit','number',{min:0,half:true}),
      F('transportCost','Transport cost (patient in and out of hospital)','number',{min:0,half:true}),
      F('medicationCost','Medication cost','number',{min:0,half:true}),
      F('outPatientCost','Out-patient cost','number',{min:0,half:true}),
      F('shifCost','SHIF / SHA contribution','number',{min:0,half:true}),
      F('inPatientCost','In-patient cost','number',{min:0,half:true}),
      F('foodBagCost','Food bag cost, if a receipt exists','number',{min:0,half:true,
        hint:'Leave empty to price the bag from the unit cost standard set by Finance.'}),
      F('hygienePacks','Hygiene packs given','number',{min:0,half:true}),
      F('costNote','Cost note','text',{full:true,hint:'Receipt reference, who paid, and anything Finance should know.'})
    ]}
  ],

  hospital_outpatient: [
    { page:1, section:'Visit', fields:[
      F('visitDate','Today\'s date','date',{req:true,half:true}),
      F('contact','Patient contact information','text',{half:true}),
      F('hospital','Hospital','text',{req:true,full:true}),
      F('reason','1. Reason for hospital visit','text',{req:true,full:true}),
      F('diagnosis','A. Diagnosis','text',{full:true}),
      F('treatmentPlan','B. Treatment plan','text',{full:true}),
      F('conditionToday','2. Describe the patient\'s condition today','textarea',{full:true}),
      F('patientComments','3. Patient\'s comments shared today with the caregiver','textarea',{full:true}),
      F('medicationGiven','4. What prescribed medication was given to the patient','text',{full:true}),
      F('medsToBuy','a) To be bought by the patient','text',{full:true}),
      F('testsToDo','b) Tests to be done by the patient','text',{full:true}),
      F('referredSpecialist','5. Has the patient been referred to a specialist','select',{o:YESNO,half:true}),
      F('specialistWhy','If yes, please explain why','text',{full:true})
    ]},
    { page:2, section:'Printed page 2 (questions 6 to 9 and 11 are not on the supplied scan)', fields:[
      F('issuesAtHome','10. Issues at home to prevent continued healing and success','select',{o:YESNO,half:true}),
      F('issuesDescribe','Describe','textarea',{full:true}),
      F('foodBagOnDischarge','12. Food bag requirement when discharged','select',{o:['Family bag','Couple bag','Normal bag','None']}),
      F('visitFrequency','13. Home visit frequency','select',{o:FREQ}),
      F('investigations','14a. Amount spent: investigations (laboratory tests, X-rays, ultrasound)','text',{full:true}),
      F('investigationAmount','Investigations amount (KES)','number',{min:0,half:true}),
      F('medicationSpend','14b. Amount spent: medications','text',{full:true}),
      F('medicationAmount','Medications amount (KES)','number',{min:0,half:true}),
      F('additionalInfo','Additional information','textarea',{full:true}),
      F('caregiverName','Caregiver name','text',{half:true}),
      F('caregiverSignature','Caregiver signature','text',{half:true}),
      F('dateSigned','Date','date',{half:true}),
      F('dataEnteredBy','Data entered by','text',{half:true}),
      F('dataEnteredDate','Date entered','date',{half:true})
    ]}
  ],

  hospital_inpatient: [
    { page:1, section:'Admission', fields:[
      F('visitDate','Today\'s date','date',{req:true,half:true}),
      F('contact','Patient contact information','text',{half:true}),
      F('hospital','Hospital','text',{req:true,half:true}),
      F('admissionDate','Date of admission','date',{half:true}),
      F('daysAdmitted','Days admitted in the hospital','number',{min:0,half:true}),
      F('reason','1. Reason for hospital admission','text',{req:true,full:true}),
      F('diagnosis','A. Diagnosis','text',{full:true}),
      F('treatmentPlan','B. Treatment plan','text',{full:true}),
      F('conditionToday','2. Describe the patient\'s condition today','textarea',{full:true}),
      F('patientComments','3. Patient\'s comments shared today with the caregiver','textarea',{full:true}),
      F('whatGiven','4. What was given to the patient','text',{full:true}),
      F('specialEquipment','5. Special equipment needed when the patient is discharged','select',{o:YESNO,half:true}),
      F('equipmentCost','Cost (KES)','number',{min:0,half:true}),
      F('equipmentRequest','6. Request for special equipment submitted for approval','select',{o:YESNO,half:true})
    ]},
    { page:2, section:'Printed page 2 (questions 7, 8 and 11 are not on the supplied scan)', fields:[
      F('referredSpecialist','9. Has the patient been referred to a specialist','select',{o:YESNO,half:true}),
      F('specialistWhy','If yes, please explain why','text',{full:true}),
      F('issuesAtHome','10. Issues at home to prevent continued healing and success','select',{o:YESNO,half:true}),
      F('issuesDescribe','Describe','textarea',{full:true}),
      F('foodBagOnDischarge','12. Food bag requirement when discharged','select',{o:['Family bag','Couple bag','Normal bag','None']}),
      F('visitFrequency','13. Home visit frequency','select',{o:FREQ}),
      F('additionalInfo','Additional information','textarea',{full:true}),
      F('caregiverName','Caregiver name','text',{half:true}),
      F('caregiverSignature','Caregiver signature','text',{half:true}),
      F('dateSigned','Date','date',{half:true}),
      F('dataEnteredBy','Data entered by','text',{half:true}),
      F('dataEnteredDate','Date entered','date',{half:true})
    ]}
  ],

  discharge: [
    { page:1, section:'Patient', fields:[
      F('dischargeDate','Date','date',{req:true,half:true}),
      F('residentialArea','Residential area','area',{req:true,half:true}),
      F('hivCardNumber','HIV card number','text',{half:true}),
      F('nhif','NHIF','select',{o:YESNO,half:true}),
      F('lastPaymentDate','Last payment date','date',{half:true}),
      F('intakeDate','Intake date','date',{half:true}),
      F('repeatPatient','Repeat patient','select',{o:YESNO,half:true}),
      F('daysInProgram','Days in programme','number',{min:0,half:true}),
      F('reasonDischarge','1. Reason the patient is being discharged','textarea',{req:true,full:true}),
      F('completedCycle','2. Patient completed the programme cycle','select',{o:YESNO,half:true}),
      F('otherPrograms','3. Attending any other assistance programmes at time of discharge','select',{o:YESNO,half:true}),
      F('otherProgramsDetail','If yes, which programmes and for how long','textarea',{full:true}),
      F('believer','4. Spiritual growth: believer','select',{o:YESNO,half:true}),
      F('convertedDuring','Converted during LOMAMO','select',{o:YESNO,half:true}),
      F('orphansPrevented','5. Number of orphans prevented','number',{min:0,half:true}),
      F('patientSignature','Discharged patient name and signature','text',{full:true}),
      F('caregiverName','Caregiver name','text',{half:true}),
      F('caregiverSignature','Caregiver signature','text',{half:true}),
      F('coordinatorName','Coordinator name','text',{half:true}),
      F('coordinatorSignature','Coordinator signature','text',{half:true}),
      F('dateSigned','Date','date',{half:true}),
      F('dataEnteredBy','Data entered by','text',{half:true}),
      F('dataEnteredDate','Date entered','date',{half:true})
    ]}
  ]
};

/* ---------------- helpers ---------------- */
function formSpec(kind){ return FORM_SPECS[kind]||null; }
function formFields(kind){
  return (FORM_SPECS[kind]||[]).flatMap(s=>s.fields);
}
function formFieldMap(kind){
  const m={}; formFields(kind).forEach(f=>{m[f.k]=f;}); return m;
}

const FORMSX = {
  kinds(){ return Object.values(FORM_KINDS); },
  meta(kind){ return FORM_KINDS[kind]||null; },
  fields:formFields,

  records(user, filter={}){
    if(!RBAC.has(user,'form.view') && !RBAC.has(user,'patient.view.clinical')) return [];
    let rows = (DB.db.formRecords||[]).filter(r=>this.canSee(user,r));
    if(filter.kind) rows = rows.filter(r=>r.kind===filter.kind);
    if(filter.patientId) rows = rows.filter(r=>r.patientId===filter.patientId);
    if(filter.status) rows = rows.filter(r=>r.status===filter.status);
    if(filter.countyId) rows = rows.filter(r=>r.countyId===filter.countyId);
    if(filter.q){ const q=filter.q.toLowerCase();
      rows = rows.filter(r=>(r.patientName+' '+r.id+' '+(r.data?.name||'')).toLowerCase().includes(q)); }
    return rows.sort((a,b)=>new Date(b.enteredAt||b.createdAt)-new Date(a.enteredAt||a.createdAt));
  },

  canSee(user, rec){
    if(!rec) return false;
    const p = DB.db.patients.find(x=>x.id===rec.patientId);
    if(!p) return false;
    if(!RBAC.has(user,'form.view') && !RBAC.has(user,'patient.view.clinical')) return false;
    return RBAC.patientVisible(user, p);
  },

  /* One record per form, patient and visit date. Submitting the same home
     visit twice on the same day for the same child is refused, not merged. */
  duplicate(kind, patientId, date, exceptId){
    const d = String(date||'').slice(0,10);
    return (DB.db.formRecords||[]).find(r=>r.kind===kind && r.patientId===patientId &&
      String(r.visitDate||r.data?.visitDate||r.data?.assessmentDate||'').slice(0,10)===d &&
      r.id!==exceptId && r.status!=='returned') || null;
  },

  validate(kind, data){
    const errors=[]; const f = formFieldMap(kind);
    const val = k => (data[k]===undefined||data[k]===null)?'':String(data[k]).trim();
    const num = k => { const v=val(k); return v===''?null:Number(v); };
    formFields(kind).forEach(x=>{
      if(x.req && !val(x.k)) errors.push(`${x.l} is required.`);
    });
    if(val('age')!==''){
      const a=num('age');
      if(isNaN(a)||a<0||a>120) errors.push('Age must be between 0 and 120.');
      if(kind==='minor_assessment' && a>17) errors.push('The minor assessment form is for a child under 18. Use the patient assessment form for an adult.');
    }
    if(val('weightKg')!=='' && (isNaN(num('weightKg'))||num('weightKg')<=0)) errors.push('Weight must be a positive number.');
    if(val('heightCm')!=='' && (isNaN(num('heightCm'))||num('heightCm')<=0)) errors.push('Height must be a positive number.');
    if(val('healthRisks')==='Yes' && !val('riskExplain')) errors.push('Question 3 asks for an explanation when a health risk is recorded.');
    if(val('referred')==='Yes' && (!val('whereReferred')||!val('referralReasons'))) errors.push('Question 4 needs the place and the reason for the referral.');
    if(val('medicationAllergies')==='Yes' && !val('allergyList')) errors.push('List the medication allergies.');
    if(val('medicationDefault')==='Yes' && !val('daysInDefault')) errors.push('Record how many days or pills are in default.');
    if(val('woundCareNeeded')==='Yes' && !val('materialsLeft')) errors.push('Record whether dressing materials were left with the patient.');
    if(val('hivPositive')==='Yes' && !val('cardNumber')) errors.push('A positive HIV record needs the clinic card number.');
    if(val('specialEquipment')==='Yes' && (val('equipmentCost')===''||isNaN(num('equipmentCost')))) errors.push('Record the cost of the special equipment.');
    if(val('tbDiagnosis')==='Yes' && !val('tbType')) errors.push('Choose pulmonary or extrapulmonary TB.');
    if(val('extraWaterGuard')==='Yes' && !val('waterGuardQty')) errors.push('Record how many Water Guard sachets were given.');
    return {ok:errors.length===0, errors};
  },

  bmi(data){
    const w=Number(data?.weightKg), h=Number(data?.heightCm);
    if(!w||!h) return '';
    return (w/Math.pow(h/100,2)).toFixed(1);
  },

  /* Save a draft. A draft is local to the device and clearly labelled. */
  saveDraft(user, {kind, id, patientId, data}){
    const meta = this.meta(kind);
    if(!meta) return {ok:false,msg:'Unknown form.'};
    const p = patientId? repo.patient(user, patientId):null;
    if(patientId && !p) return {ok:false,msg:'Patient outside your scope.'};
    if(!RBAC.assert(user,'form.create', p?{countyId:p.countyId,areaId:p.areaId}:{},false))
      return {ok:false,msg:'Your role may not enter this form.'};
    let rec = id? (DB.db.formRecords||[]).find(r=>r.id===id) : null;
    if(rec && rec.status==='verified') return {ok:false,msg:'A verified form cannot be edited. Record an amendment instead.'};
    if(!rec){
      rec = { id:uid('frm'), kind, code:meta.code, title:meta.title,
        patientId:patientId||null, patientName:data?.name||data?.patientName||(p?p.name:''),
        countyId:p?p.countyId:user.countyId, areaId:p?p.areaId:null,
        status:'draft', data:{}, enteredBy:user.id, createdAt:new Date().toISOString(),
        enteredAt:new Date().toISOString(), demo:false, version:1 };
      DB.db.formRecords = DB.db.formRecords||[];
      DB.db.formRecords.unshift(rec);
    }
    rec.data = {...(rec.data||{}), ...data};
    rec.patientName = rec.data.name||rec.patientName||(p?p.name:'');
    rec.visitDate = rec.data.visitDate||rec.data.assessmentDate||rec.data.dischargeDate||rec.data.admissionDate||'';
    rec.updatedAt = new Date().toISOString(); rec.version=(rec.version||1)+1;
    DB.save();
    return {ok:true, rec, msg:'Draft saved on this device. It has not been submitted.'};
  },

  submit(user, {kind, id, patientId, data}){
    const meta=this.meta(kind);
    if(!meta) return {ok:false,msg:'Unknown form.'};
    if(!RBAC.assert(user,'form.create', pctx(patientId), false))
      return {ok:false,msg:'Your role may not submit this form.'};
    const v = this.validate(kind, data);
    if(!v.ok) return {ok:false,msg:v.errors[0], errors:v.errors};
    const p = patientId? repo.patient(user, patientId):null;
    if(!p) return {ok:false,msg:'Choose a patient in your scope before submitting.'};
    const date = data.visitDate||data.assessmentDate||data.dischargeDate||data.admissionDate||todayISO();
    const dup = this.duplicate(kind, patientId, date, id);
    if(dup) return {ok:false,msg:`A ${meta.short.toLowerCase()} form already exists for this patient on ${fmtDate(date)} (${dup.id}). Open that record rather than entering it twice.`};
    let rec = id? (DB.db.formRecords||[]).find(r=>r.id===id):null;
    if(!rec){
      rec={ id:uid('frm'), kind, code:meta.code, title:meta.title, patientId, patientName:data.name||p.name,
        countyId:p.countyId, areaId:p.areaId, enteredBy:user.id, createdAt:new Date().toISOString(),
        demo:false, version:1 };
      DB.db.formRecords=DB.db.formRecords||[]; DB.db.formRecords.unshift(rec);
    }
    if(rec.status==='verified') return {ok:false,msg:'This form is already verified.'};
    Object.assign(rec,{ data:{...data}, patientName:data.name||p.name, visitDate:date,
      status:'submitted', submittedBy:user.id, submittedAt:new Date().toISOString() });
    rec.version=(rec.version||1)+1;
    AUDIT.append({actor:user.id,action:'form.submitted',entity:'form',entityId:rec.id,
      detail:`${meta.title} · ${p.code}`});
    notify(p.caregiverId,'Form submitted for verification',`${meta.short} · ${p.code}`,'info');
    DB.save();
    return {ok:true, rec, msg:`${meta.short} submitted for verification.`};
  },

  verify(user, id, note=''){
    const rec=(DB.db.formRecords||[]).find(r=>r.id===id);
    if(!rec) return {ok:false,msg:'Form not found.'};
    if(!RBAC.assert(user,'form.verify', pctx(rec.patientId), false))
      return {ok:false,msg:'Your role may not verify this form.'};
    if(rec.status!=='submitted') return {ok:false,msg:'Only a submitted form can be verified.'};
    if(rec.enteredBy===user.id && !RBAC.has(user,'system.config'))
      return {ok:false,msg:'The person who entered a form cannot also verify it. A second officer must check it against the paper copy.'};
    rec.status='verified'; rec.verifiedBy=user.id; rec.verifiedAt=new Date().toISOString(); rec.verifyNote=(note||'').slice(0,500);
    AUDIT.append({actor:user.id,action:'form.verified',entity:'form',entityId:rec.id,
      detail:`${rec.title} · ${rec.patientName||rec.patientId}`});
    DB.save();
    return {ok:true, rec, msg:'Form verified against the paper copy.'};
  },

  returnForCorrection(user, id, reason){
    const rec=(DB.db.formRecords||[]).find(r=>r.id===id);
    if(!rec) return {ok:false,msg:'Form not found.'};
    if(!RBAC.assert(user,'form.verify', pctx(rec.patientId), false))
      return {ok:false,msg:'Your role may not return this form.'};
    if(!reason || !reason.trim()) return {ok:false,msg:'A reason is required.'};
    if(rec.status!=='submitted') return {ok:false,msg:'Only a submitted form can be returned.'};
    rec.status='returned'; rec.returnedBy=user.id; rec.returnedAt=new Date().toISOString(); rec.returnReason=reason.trim();
    rec.history=[...(rec.history||[]),{at:todayISO(),by:user.id,action:'returned',reason:reason.trim()}];
    AUDIT.append({actor:user.id,action:'form.returned',entity:'form',entityId:rec.id,detail:reason.trim()});
    notify(rec.enteredBy,'Form returned for correction',reason.trim(),'warn');
    DB.save();
    return {ok:true, rec, msg:'Returned to the person who entered it.'};
  },

  csv(user){
    const rows=this.records(user);
    return toCSV(rows,[
      {label:'Form',get:r=>r.title},
      {label:'Patient',get:r=>r.patientName||''},
      {label:'Visit date',get:r=>r.visitDate||''},
      {label:'Status',get:r=>r.status},
      {label:'Entered by',get:r=>userName(r.enteredBy)},
      {label:'Entered at',get:r=>(r.enteredAt||'').slice(0,10)},
      {label:'Verified by',get:r=>r.verifiedBy?userName(r.verifiedBy):''},
      {label:'Record',get:r=>r.id}
    ]);
  }
};
function pctx(patientId){
  const p = patientId? DB.db.patients.find(x=>x.id===patientId):null;
  return p? {countyId:p.countyId,areaId:p.areaId}: {};
}

/* ---------------- form editor ---------------- */
function formControl(f, data){
  const v = data[f.k]!==undefined? data[f.k] : '';
  const req = f.req?' required':'';
  const id = 'ff_'+f.k;
  if(f.t==='textarea') return `<textarea class="input" id="${id}" name="${f.k}" rows="3"${req}>${esc(v)}</textarea>`;
  if(f.t==='select'){
    const opts = (f.o||[]).map(o=>`<option value="${esc(o)}" ${String(v)===String(o)?'selected':''}>${esc(o)}</option>`).join('');
    return `<select class="input" id="${id}" name="${f.k}"${req}><option value="">Select</option>${opts}</select>`;
  }
  if(f.t==='checks'){
    return `<div class="checkgrid">${(f.o||[]).map(o=>{
      const on = Array.isArray(v)? v.includes(o) : String(v||'').split(',').map(x=>x.trim()).filter(Boolean).includes(o);
      return `<label class="check"><input type="checkbox" name="${f.k}" value="${esc(o)}" ${on?'checked':''}> ${esc(o)}</label>`;
    }).join('')}</div>`;
  }
  if(f.t==='area'){
    const areas = COUNTIES.flatMap(c=>c.areas.map(a=>({...a,countyId:c.id})));
    return `<select class="input" id="${id}" name="${f.k}"${req}><option value="">Select a ministry area</option>
      ${areas.map(a=>`<option value="${esc(a.name)}" ${String(v)===a.name?'selected':''}>${esc(a.name)} (${esc(countyName(a.countyId))})</option>`).join('')}</select>`;
  }
  if(f.t==='computed') return `<input class="input" id="${id}" name="${f.k}" value="${esc(v)}" readonly tabindex="-1">`;
  if(f.t==='date') return `<input class="input" type="date" id="${id}" name="${f.k}" value="${esc(v)}"${req}>`;
  const extra = f.t==='number'? ` type="number" ${f.min!==undefined?`min="${f.min}"`:''} ${f.max!==undefined?`max="${f.max}"`:''} ${f.step?`step="${f.step}"`:'step="any"'}` : ' type="text"';
  return `<input class="input"${extra} id="${id}" name="${f.k}" value="${esc(v)}"${req} ${f.hint?`placeholder="${esc(f.hint)}"`:''}>`;
}
function formEditor(kind, patientId, recordId){
  const meta = FORMSX.meta(kind), spec = FORM_SPECS[kind];
  if(!meta||!spec) return '';
  const rec = recordId? (DB.db.formRecords||[]).find(r=>r.id===recordId):null;
  const p = patientId? DB.db.patients.find(x=>x.id===patientId): (rec? DB.db.patients.find(x=>x.id===rec.patientId):null);
  const me=AUTH.user? AUTH.user.name.replace(/^Demo - /,''):'';
  const data = rec? {...rec.data} : {assessmentDate:todayISO(), visitDate:todayISO(), dischargeDate:todayISO(), admissionDate:todayISO(),
    name:p?.name||'', areaLocation: p? areaName(p.areaId):'',
    caregiverName:me, dataEnteredBy:me, enteredBy:me, providerName:me};
  let page = 0;
  const body = spec.map(sec=>{
    const pageHead = sec.page!==page? `<div class="form-page-mark">Page ${sec.page} of ${meta.pages}${meta.partial&&sec.page===1?' (page 2 not supplied)':''}</div>`:'';
    page = sec.page;
    return `${pageHead}<div class="form-section"><h4>${esc(sec.section)}</h4>
      <div class="formgrid">${sec.fields.map(f=>`<div class="field ${f.full?'full':f.half?'half':''}">
        <label for="ff_${f.k}">${esc(f.l)}${f.req?' <span style="color:var(--crit)">*</span>':''}</label>
        ${formControl(f,data)}${f.hint?`<div class="hint">${esc(f.hint)}</div>`:''}</div>`).join('')}</div></div>`;
  }).join('');
  return `<form data-form="form-save" id="formDoc">
    <input type="hidden" name="kind" value="${esc(kind)}">
    <input type="hidden" name="recordId" value="${esc(recordId||'')}">
    <input type="hidden" name="patientId" value="${esc(patientId||'')}">
    ${meta.notes.map(n=>`<div class="note no-print" style="margin-bottom:8px">${ic('info',14)}<span>${esc(n)}</span></div>`).join('')}
    ${rec&&rec.status==='returned'?`<div class="alert warn">${ic('alert',16)}<div><b>Returned for correction</b><span class="small">${esc(rec.returnReason||'')}</span></div></div>`:''}
    ${body}
  </form>`;
}

/* ---------------- printable document ---------------- */
function formDoc(rec){
  const meta = FORMSX.meta(rec.kind), spec=FORM_SPECS[rec.kind]||[];
  const data = rec.data||{};
  const p = DB.db.patients.find(x=>x.id===rec.patientId);
  let page=0;
  const rows = spec.map(sec=>{
    const brk = sec.page!==page;
    page=sec.page;
    return `${brk?'<div class="doc-page-break"></div>':''}
      <div class="doc-section"><h4>${esc(sec.section)}</h4>
      ${sec.fields.map(f=>`<div class="doc-row"><span class="dl">${esc(f.l)}</span><span class="dv">${
        f.t==='checks' ? esc(Array.isArray(data[f.k])? data[f.k].join(', ') : data[f.k]||'') : esc(data[f.k]??'')}</span></div>`).join('')}
      <div class="doc-foot">Page ${sec.page} of ${meta.pages}${rec.kind==='minor_assessment'&&sec.page===4?' (printed on the paper form as Page 4 of 3)':''}</div></div>`;
  }).join('');
  return `<div class="form-doc">
    <div class="doc-head">
      <img src="${window.LOGO||''}" alt="">
      <div><div class="doc-org">LOMAMO - LOVE MATTERS MOST MINISTRY KISUMU</div>
        <h2>${esc(meta.title)}</h2>
        ${meta.subtitle?`<div class="doc-sub">${esc(meta.subtitle)}</div>`:''}</div>
      <div class="doc-code">${esc(meta.formNo||'')}</div>
    </div>
    <div class="doc-meta">
      <span><b>Patient</b> ${esc(rec.patientName||p?.name||'')}</span>
      <span><b>Code</b> ${esc(p?.code||'')}</span>
      <span><b>Record</b> ${esc(rec.id)}</span>
      <span><b>Status</b> ${esc(titleCase(rec.status))}</span>
    </div>
    ${rows}
    ${meta.partial?`<div class="doc-note"><b>Reproduction note.</b> Only page 1 of the two-page discharge form was supplied. Page 2 has not been invented. This record is a partial electronic reproduction.</div>`:''}
    <div class="doc-note"><b>Provenance.</b> ${esc(meta.source)}. Entered by ${esc(userName(rec.enteredBy))} on ${esc((rec.enteredAt||rec.createdAt||'').slice(0,10))}${rec.verifiedBy?`; verified by ${esc(userName(rec.verifiedBy))} on ${esc((rec.verifiedAt||'').slice(0,10))}`:''}.</div>
  </div>`;
}

function printDoc(title, html){
  /* The document is written once, into a body-level container that only
     printing reveals. The modal shows the same markup for reading. */
  let host=document.getElementById('printRoot');
  if(!host){ host=document.createElement('div'); host.id='printRoot'; host.className='print-root'; document.body.appendChild(host); }
  host.innerHTML=html;
  openModal({title, sub:'Printable document. Print or save as PDF; the console and its controls are excluded from the page.', wide:true,
    body:`<div class="print-area" id="printArea">${html}</div>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
      <button class="btn btn-primary" data-act="do-print">${ic('download',15)} Print or save as PDF</button>`});
}

/* ---------------- views ---------------- */
function renderForms(user, params={}){
  const can = RBAC.has(user,'form.view')||RBAC.has(user,'patient.view.clinical');
  if(!can) return `<div class="card"><div class="card-b">${emptyState('Forms are restricted','Your role does not hold access to clinical forms.','lock')}</div></div>`;
  const rows = FORMSX.records(user, params);
  const byKind = {}, byStatus={};
  (DB.db.formRecords||[]).filter(r=>FORMSX.canSee(user,r)).forEach(r=>{
    byKind[r.kind]=(byKind[r.kind]||0)+1; byStatus[r.status]=(byStatus[r.status]||0)+1;
  });
  const kinds = Object.values(FORM_KINDS);
  return pageHead('Paper forms','The six LOMAMO forms, digitised field for field. The paper copy remains the primary field record.',
    `<button class="btn btn-sm btn-ghost" data-act="download-forms-csv">${ic('download',15)} Export list</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Records', num(rows.length),'In your scope','','clipboard')}
      ${kpi('Awaiting verification', num(byStatus.submitted||0),'Submitted, not yet checked','warn','check')}
      ${kpi('Verified', num(byStatus.verified||0),'Checked against paper','ok','shieldcheck')}
      ${kpi('Returned', num(byStatus.returned||0),'For correction','crit','alert')}
    </div>`
  + `<div class="grid g3" style="margin-bottom:16px">
      ${kinds.map(k=>`<div class="card"><div class="card-h"><h3 style="font-size:13px">${esc(k.short)}</h3>
        <div class="r">${badge(num(byKind[k.id]||0),'b-neutral','nodot')}</div></div>
        <div class="card-b"><div class="xs muted">${esc(k.formNo||'No printed number')} · ${k.partial? 'page 1 of '+k.pages+' supplied' : k.pages+' printed page'+(k.pages===1?'':'s')}</div>
        <div class="row" style="margin-top:10px"><button class="btn btn-xs btn-primary" data-act="new-form" data-kind="${k.id}">${ic('plus',13)} New</button>
        <button class="btn btn-xs btn-ghost" data-act="open-forms" data-kind="${k.id}">Open</button></div></div></div>`).join('')}
    </div>`
  + card('Recent form records', table([
      {label:'Form',render:r=>`<b>${esc(FORM_KINDS[r.kind]?.short||r.kind)}</b><div class="xs muted">${esc(r.code||'')}</div>`},
      {label:'Patient',render:r=>`${esc(r.patientName||'')}<div class="xs muted">${esc(r.patientId||'')}</div>`},
      {label:'Visit date',render:r=>esc(r.visitDate?fmtDate(r.visitDate):'-')},
      {label:'Status',render:r=>badge(titleCase(r.status), r.status==='verified'?'b-ok':r.status==='submitted'?'b-warn':r.status==='returned'?'b-crit':'b-neutral')},
      {label:'Entered by',render:r=>esc(userName(r.enteredBy))},
      {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-ghost" data-act="open-form" data-id="${r.id}">Open</button>`}
    ], rows.slice(0,60), {emptyMsg:'No forms recorded yet. Choose a form above to begin.'}),
    {foot:`<span>${ic('lock',13)} Clinical forms are visible only to roles with form access, scoped by county and ministry area.</span>`});
}

function renderFormRecord(user, params={}){
  const rec=(DB.db.formRecords||[]).find(r=>r.id===params.id);
  if(!rec) return `<div class="card"><div class="card-b">${emptyState('Form not found','The record does not exist.','file')}</div></div>`;
  if(!FORMSX.canSee(user,rec)) return deniedPanel('form.view');
  const p=DB.db.patients.find(x=>x.id===rec.patientId);
  return pageHead(FORM_KINDS[rec.kind]?.title||rec.title, `${rec.patientName||''} · ${rec.status==='verified'?'Verified':'Not yet verified'}`, `
    <button class="btn btn-sm btn-ghost" data-act="go" data-v="forms">${ic('back',15)} Back to Forms</button>
    <button class="btn btn-sm btn-ghost" data-act="print-form" data-id="${rec.id}">${ic('download',15)} Print</button>
    ${rec.status==='draft'?`<button class="btn btn-sm btn-primary" data-act="edit-form" data-id="${rec.id}">Continue draft</button>`:''}
    ${rec.status==='submitted'&&RBAC.has(user,'form.verify')?`<button class="btn btn-sm btn-primary" data-act="verify-form" data-id="${rec.id}">Verify</button>
      <button class="btn btn-sm btn-ghost" data-act="return-form" data-id="${rec.id}">Return</button>`:''}`)
  + `<div class="grid g2">
      ${card('Record', `<dl class="dl">
        <dt>Patient</dt><dd>${esc(rec.patientName||'')} ${p?`<span class="xs muted">${esc(p.code)}</span>`:''}</dd>
        <dt>Form</dt><dd>${esc(FORM_KINDS[rec.kind]?.title||rec.title)}</dd>
        <dt>Printed number</dt><dd>${esc(rec.code||'-')}</dd>
        <dt>Visit date</dt><dd>${rec.visitDate?esc(fmtDate(rec.visitDate)):'-'}</dd>
        <dt>Status</dt><dd>${badge(titleCase(rec.status), rec.status==='verified'?'b-ok':rec.status==='submitted'?'b-warn':rec.status==='returned'?'b-crit':'b-neutral')}</dd>
        <dt>Entered by</dt><dd>${esc(userName(rec.enteredBy))} · ${esc((rec.enteredAt||rec.createdAt||'').slice(0,10))}</dd>
        ${rec.verifiedBy?`<dt>Verified by</dt><dd>${esc(userName(rec.verifiedBy))} · ${esc((rec.verifiedAt||'').slice(0,10))}</dd>`:''}
        ${rec.status==='returned'?`<dt>Reason returned</dt><dd>${esc(rec.returnReason||'')}</dd>`:''}
      </dl>
      ${(FORM_KINDS[rec.kind]?.notes||[]).map(n=>`<div class="note" style="margin-top:10px">${ic('info',14)}<span>${esc(n)}</span></div>`).join('')}`)}
      ${card('Preview', `<div class="doc-scroll">${formDoc(rec)}</div>`)}
    </div>`;
}

/* New-form modal: choose a patient, then edit. */
function openFormEditor(kind, patientId, recordId){
  const meta=FORM_KINDS[kind];
  if(!meta) return toast('Unknown form','','err');
  openModal({title:(recordId?'Edit ':'New ')+meta.short, sub:`${meta.code||''} · ${meta.source}`,
    wide:true, body:formEditor(kind, patientId, recordId),
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-ghost" data-act="save-form-draft" data-kind="${kind}">Save draft</button>
      <button class="btn btn-primary" data-act="submit-form" data-kind="${kind}">Submit for verification</button>`});
}

/* Read a FormData into the shape the validators expect. */
function formDataFrom(d){
  const kind=d.get('kind'); const out={};
  formFields(kind).forEach(f=>{
    if(f.t==='checks'){
      const all = d.getAll? d.getAll(f.k) : [String(d.get(f.k)||'')];
      out[f.k]=all.filter(Boolean);
    } else {
      out[f.k]=String(d.get(f.k)??'').trim();
    }
  });
  out.bmi = FORMSX.bmi(out);
  return out;
}

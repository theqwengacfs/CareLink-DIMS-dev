/* ============================================================
   themes.js - Workspace themes (v5.1)

   A theme is personal. It changes colour, chrome and contrast inside the
   signed-in console and nothing else. It never changes permissions, data,
   workflows, the order of anything a role may open, or what a status
   means. A status keeps its hue (green done, amber waiting, red critical,
   blue information) and always carries its written label; only the shade
   moves so that it stays readable on the chosen surface.

   Two accent colours are derived from the department colour, because the
   accent is used in two different ways:
     --accent     a fill. White text on it always reaches 4.5:1.
     --accent-fg  a foreground (text, icon, border) on this theme's own
                  surface and on its soft tint. Also at least 4.5:1.
   ============================================================ */

const WT_TOKENS = {
  bg:'--bg', surface:'--surface', surface2:'--surface-2', ink:'--ink', ink2:'--ink-2', ink3:'--ink-3', muted:'--muted',
  line:'--line', line2:'--line-2', bar:'--bar', chrome:'--chrome', chrome2:'--chrome-2', chromeInk:'--chrome-ink',
  chromeMuted:'--chrome-muted', chromeLine:'--chrome-line', action:'--action', action2:'--action-2', actionInk:'--action-ink',
  ok:'--ok', okBg:'--ok-bg', warn:'--warn', warnBg:'--warn-bg', crit:'--crit', critBg:'--crit-bg', info:'--info', infoBg:'--info-bg'
};

const WTHEMES = [
  { id:'foundation', name:'Foundation', mode:'light', accent:'#1F3864', brand:'#1F3864', gold:'#A67C00',
    blurb:'Foundation navy and gold on warm paper. The recommended default.',
    t:{ bg:'#F6F3EC', surface:'#FFFFFF', surface2:'#FBF9F4', ink:'#14171C', ink2:'#2A2F38', ink3:'#5A5F69', muted:'#5E6470', line:'#E4DED0', line2:'#EFEAE0', bar:'#FFFFFF', chrome:'#132445', chrome2:'#1F3864', chromeInk:'#F3F0E6', chromeMuted:'#B5C1D8', chromeLine:'#2B4C86', action:'#1F3864', action2:'#2B4C86', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E7F6EF', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#EAF0FF' } },
  { id:'classic', name:'Daylight', mode:'light', accent:'dept', brand:'#1F3864', gold:'#C9A227',
    blurb:'The original console look. A cool white page with your department colour.',
    t:{ bg:'#F4F6F9', surface:'#FFFFFF', surface2:'#FAFBFC', ink:'#15171A', ink2:'#2B3038', ink3:'#5B6573', muted:'#5F6B7A', line:'#E3E7ED', line2:'#EDF0F4', bar:'#FFFFFF', chrome:'#16294A', chrome2:'#21386A', chromeInk:'#EEF2F9', chromeMuted:'#A9B8CE', chromeLine:'#2B4472', action:'#C8102E', action2:'#E01B22', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E7F6EF', warn:'#9A5B00', warnBg:'#FFF4E0', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#EAF0FF' } },
  { id:'savanna', name:'Savanna', mode:'light', accent:'dept', brand:'#7A3A18', gold:'#B45309',
    blurb:'Warm sand and burnt umber. Easy on the eyes in bright outdoor light.',
    t:{ bg:'#FAF4E8', surface:'#FFFDF8', surface2:'#FBF6EC', ink:'#2A1E12', ink2:'#43321F', ink3:'#6B5844', muted:'#6E5B46', line:'#E8DAC3', line2:'#F1E7D4', bar:'#FFFDF8', chrome:'#5A2A12', chrome2:'#7A3A18', chromeInk:'#FBEFE0', chromeMuted:'#E7C9A8', chromeLine:'#8A4A26', action:'#B45309', action2:'#BE5A0A', actionInk:'#FFFFFF', ok:'#17703F', okBg:'#E8F5EC', warn:'#8A5200', warnBg:'#FFF1D6', crit:'#A61B1B', critBg:'#FCE9E7', info:'#1F5AA6', infoBg:'#E8F0FA' } },
  { id:'lake', name:'Lake Victoria', mode:'light', accent:'dept', brand:'#0B3B4A', gold:'#B8860B',
    blurb:'Cool teal and mist, taken from the Kisumu shoreline.',
    t:{ bg:'#EDF5F7', surface:'#FFFFFF', surface2:'#F6FAFB', ink:'#0B2A33', ink2:'#1D4450', ink3:'#4A6770', muted:'#4E6B74', line:'#D3E4E9', line2:'#E4EFF2', bar:'#FFFFFF', chrome:'#0B3B4A', chrome2:'#115368', chromeInk:'#E8F6F9', chromeMuted:'#9FC9D3', chromeLine:'#1C5E73', action:'#0E7490', action2:'#0F7E9C', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E4F6EE', warn:'#8F5600', warnBg:'#FFF3DC', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8EFFF' } },
  { id:'canopy', name:'Canopy', mode:'light', accent:'dept', brand:'#0F3D2A', gold:'#B58900',
    blurb:'Deep forest green with fresh leaf highlights. Calm and grounded.',
    t:{ bg:'#EFF6F0', surface:'#FFFFFF', surface2:'#F7FBF8', ink:'#0F2A1B', ink2:'#234632', ink3:'#4C6A58', muted:'#4F6C5B', line:'#D5E5D9', line2:'#E4F0E7', bar:'#FFFFFF', chrome:'#0F3D2A', chrome2:'#17553A', chromeInk:'#EAF7EF', chromeMuted:'#A5CDB3', chromeLine:'#1F6A48', action:'#15803D', action2:'#168640', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E3F5EA', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8EFFF' } },
  { id:'jacaranda', name:'Jacaranda', mode:'light', accent:'dept', brand:'#44198F', gold:'#B8860B',
    blurb:'Violet and lilac, for the jacaranda season. Vivid without being loud.',
    t:{ bg:'#F4F1FA', surface:'#FFFFFF', surface2:'#FAF8FD', ink:'#1B1530', ink2:'#352B57', ink3:'#625A80', muted:'#655D82', line:'#E2DCF0', line2:'#ECE8F6', bar:'#FFFFFF', chrome:'#2E1065', chrome2:'#44198F', chromeInk:'#F3EEFF', chromeMuted:'#C4B5FD', chromeLine:'#5B2DB0', action:'#6D28D9', action2:'#7C3AED', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E7F6EF', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#EAF0FF' } },
  { id:'night', name:'Night ward', mode:'dark', accent:'dept', brand:'#8FB4FF', gold:'#E3B93C',
    blurb:'Dark slate with low glare, for night shifts and the care centre after dusk.',
    t:{ bg:'#0F131A', surface:'#171C26', surface2:'#1D2430', ink:'#E8ECF3', ink2:'#C9D1DD', ink3:'#9AA6B8', muted:'#A0ACBE', line:'#2A3342', line2:'#222B38', bar:'#131821', chrome:'#0A0D12', chrome2:'#171C26', chromeInk:'#E8ECF3', chromeMuted:'#9AA6B8', chromeLine:'#252E3B', action:'#D12F3A', action2:'#D83540', actionInk:'#FFFFFF', ok:'#5FD3A0', okBg:'#12332A', warn:'#F2B84B', warnBg:'#3A2B0E', crit:'#FF8A94', critBg:'#3E1820', info:'#8FB4FF', infoBg:'#18284A' } },
  { id:'midnight', name:'Midnight gold', mode:'dark', accent:'#E3B93C', brand:'#8FB4FF', gold:'#E3B93C',
    blurb:'Deep navy with a gold action colour. Dark, but unmistakably LOMAMO.',
    t:{ bg:'#0B1426', surface:'#12203A', surface2:'#172848', ink:'#EEF2F9', ink2:'#D2DBEA', ink3:'#A3B2CC', muted:'#A9B7D0', line:'#243659', line2:'#1B2B4B', bar:'#0E192F', chrome:'#070E1C', chrome2:'#12203A', chromeInk:'#EEF2F9', chromeMuted:'#A3B2CC', chromeLine:'#1E2F52', action:'#E3B93C', action2:'#F0C94F', actionInk:'#1A1405', ok:'#5FD3A0', okBg:'#10362D', warn:'#F2B84B', warnBg:'#3A2B0E', crit:'#FF8A94', critBg:'#3E1820', info:'#8FB4FF', infoBg:'#18305A' } },
  { id:'contrast', name:'High contrast', mode:'light', accent:'#0033CC', brand:'#0033CC', gold:'#5C3300',
    blurb:'Black, white and heavy outlines. Maximum legibility in glare.',
    t:{ bg:'#FFFFFF', surface:'#FFFFFF', surface2:'#F2F2F2', ink:'#000000', ink2:'#111111', ink3:'#333333', muted:'#333333', line:'#000000', line2:'#555555', bar:'#FFFFFF', chrome:'#000000', chrome2:'#1A1A1A', chromeInk:'#FFFFFF', chromeMuted:'#E6E6E6', chromeLine:'#FFFFFF', action:'#0033CC', action2:'#0A44E0', actionInk:'#FFFFFF', ok:'#005A2B', okBg:'#E6F7EC', warn:'#5C3300', warnBg:'#FFF0CC', crit:'#8A0000', critBg:'#FFE5E5', info:'#00339E', infoBg:'#E3EBFF' } },
  { id:'hibiscus', name:'Hibiscus crimson', mode:'light', accent:'#BE123C', brand:'#881337', gold:'#B45309',
    blurb:'Vibrant coastal hibiscus rose, warm petal ivory and deep burgundy chrome.',
    t:{ bg:'#FFF1F4', surface:'#FFFFFF', surface2:'#FFF7F9', ink:'#260D15', ink2:'#4A1927', ink3:'#6E3B49', muted:'#6B3A48', line:'#F2D0D8', line2:'#F9E2E7', bar:'#FFFFFF', chrome:'#4C0519', chrome2:'#6D0E29', chromeInk:'#FFF1F3', chromeMuted:'#FDA4AF', chromeLine:'#881337', action:'#BE123C', action2:'#E11D48', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E4F6EC', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#9F1239', critBg:'#FFE4E8', info:'#1D4ED8', infoBg:'#E9EFFD' } },
  { id:'cobalt', name:'Royal cobalt', mode:'light', accent:'#1D4ED8', brand:'#1E3A8A', gold:'#B45309',
    blurb:'Crisp sapphire cobalt with clean sky surfaces built for clinical clarity.',
    t:{ bg:'#EEF4FF', surface:'#FFFFFF', surface2:'#F6F9FF', ink:'#0F1E3A', ink2:'#1E3563', ink3:'#495E88', muted:'#4B608A', line:'#CFE0FC', line2:'#E1ECFE', bar:'#FFFFFF', chrome:'#102554', chrome2:'#1A387A', chromeInk:'#EFF6FF', chromeMuted:'#ADC8FF', chromeLine:'#254CA3', action:'#1D4ED8', action2:'#2563EB', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E3F5EB', warn:'#8A5200', warnBg:'#FFF3DC', crit:'#B00020', critBg:'#FDECEE', info:'#1E40AF', infoBg:'#E0EAFF' } },
  { id:'emerald', name:'Kericho emerald', mode:'light', accent:'#047857', brand:'#065F46', gold:'#A16207',
    blurb:'Lush highland tea-garden green with refreshing mint-tinted workspace cards.',
    t:{ bg:'#ECFDF5', surface:'#FFFFFF', surface2:'#F4FBF8', ink:'#07291E', ink2:'#134737', ink3:'#3F6B5D', muted:'#406C5E', line:'#C6ECE0', line2:'#DCF5EC', bar:'#FFFFFF', chrome:'#064E3B', chrome2:'#065F46', chromeInk:'#ECFDF5', chromeMuted:'#99F6E4', chromeLine:'#0D7A5F', action:'#065F46', action2:'#047857', actionInk:'#FFFFFF', ok:'#065F46', okBg:'#D1FAE5', warn:'#8A5200', warnBg:'#FEF3C7', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E6EEFF' } },
  { id:'sunset', name:'Rift sunset', mode:'light', accent:'#9A3412', brand:'#7C2D12', gold:'#A16207',
    blurb:'Warm terracotta coral and golden apricot light across wide readable cards.',
    t:{ bg:'#FFF5ED', surface:'#FFFFFF', surface2:'#FFF9F4', ink:'#2A1408', ink2:'#4F2812', ink3:'#754A32', muted:'#734931', line:'#F2D8C4', line2:'#FAE8DA', bar:'#FFFFFF', chrome:'#581C0C', chrome2:'#7C2D12', chromeInk:'#FFF7ED', chromeMuted:'#FDBA8C', chromeLine:'#9A3412', action:'#9A3412', action2:'#C2410C', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E5F6EC', warn:'#854D0E', warnBg:'#FEF3C7', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8EFFF' } },
  { id:'turquoise', name:'Turkana lagoon', mode:'light', accent:'#115E59', brand:'#115E59', gold:'#B45309',
    blurb:'Mineral turquoise jade and sunlit limestone inspired by northern waters.',
    t:{ bg:'#ECFEFF', surface:'#FFFFFF', surface2:'#F3FCFD', ink:'#082B31', ink2:'#154851', ink3:'#3E6970', muted:'#406A72', line:'#C5EAEF', line2:'#DCF4F7', bar:'#FFFFFF', chrome:'#0D3C43', chrome2:'#115E59', chromeInk:'#ECFEFF', chromeMuted:'#99EAEE', chromeLine:'#167982', action:'#115E59', action2:'#0F766E', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E2F6EB', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#0369A1', infoBg:'#E0F2FE' } },
  { id:'plum', name:'Orchid plum', mode:'light', accent:'#7E22CE', brand:'#6B21A8', gold:'#B45309',
    blurb:'Regal orchid plum and soft mulberry mist with bold typographic contrast.',
    t:{ bg:'#FAF3FF', surface:'#FFFFFF', surface2:'#FCF8FF', ink:'#241036', ink2:'#422063', ink3:'#694B87', muted:'#684A86', line:'#E6D4F7', line2:'#F1E6FC', bar:'#FFFFFF', chrome:'#3B0764', chrome2:'#581C87', chromeInk:'#FAF5FF', chromeMuted:'#D8B4FE', chromeLine:'#7E22CE', action:'#6B21A8', action2:'#7E22CE', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E5F6ED', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#EAEFFF' } },
  { id:'citrus', name:'Acacia olive', mode:'light', accent:'#3F6212', brand:'#365314', gold:'#A16207',
    blurb:'Sun-drenched acacia olive green and warm parchment built for calm focus.',
    t:{ bg:'#F6FAEE', surface:'#FFFFFF', surface2:'#FAFCF5', ink:'#1B280B', ink2:'#314915', ink3:'#556C3B', muted:'#546B3A', line:'#DAE7C8', line2:'#E9F2DD', bar:'#FFFFFF', chrome:'#243B0B', chrome2:'#365314', chromeInk:'#F7FEE7', chromeMuted:'#BEF264', chromeLine:'#4D7C0F', action:'#365314', action2:'#3F6212', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E4F7EA', warn:'#854D0E', warnBg:'#FEF3C7', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8EFFF' } },
  { id:'covenant', name:'Covenant gold', mode:'light', accent:'#9A5B00', brand:'#1F3864', gold:'#9A5B00',
    blurb:'Ceremonial LOMAMO vellum, deep navy chrome and rich burnished gold accents.',
    t:{ bg:'#FDF9EE', surface:'#FFFFFF', surface2:'#FEFCF5', ink:'#182235', ink2:'#2D3D5C', ink3:'#58657F', muted:'#56637D', line:'#E8DEC4', line2:'#F3ECDA', bar:'#FFFFFF', chrome:'#162848', chrome2:'#1F3864', chromeInk:'#FDF9EE', chromeMuted:'#F3D382', chromeLine:'#2E4F87', action:'#8A5200', action2:'#9A5B00', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E5F6EC', warn:'#854D0E', warnBg:'#FEF3C7', crit:'#B00020', critBg:'#FDECEE', info:'#1E40AF', infoBg:'#E8EFFF' } },
  { id:'harbour', name:'Harbour Dark', mode:'dark', accent:'#14B8A6', brand:'#5EEAD4', gold:'#FBBF24',
    blurb:'Optional dark Lake Victoria evening teal theme with luminous seafoam highlights.',
    t:{ bg:'#07191E', surface:'#0E252C', surface2:'#14323B', ink:'#E6F7F9', ink2:'#C5E4E8', ink3:'#94BCC2', muted:'#99C1C7', line:'#214752', line2:'#193A44', bar:'#0A2026', chrome:'#051216', chrome2:'#0E252C', chromeInk:'#E6F7F9', chromeMuted:'#8CD0D7', chromeLine:'#1D424D', action:'#115E59', action2:'#0F766E', actionInk:'#FFFFFF', ok:'#5FD3A0', okBg:'#10362D', warn:'#F4BF4F', warnBg:'#3A2B0E', crit:'#FF8A94', critBg:'#3E1820', info:'#7DD3FC', infoBg:'#12324A' } },
  { id:'aurora', name:'Aurora forest', mode:'dark', accent:'#10B981', brand:'#6EE7B7', gold:'#FBBF24',
    blurb:'Velvet highland forest night with bioluminescent emerald and gold accents.',
    t:{ bg:'#081812', surface:'#0F261D', surface2:'#163428', ink:'#E7F8F0', ink2:'#C5E5D6', ink3:'#94BDA9', muted:'#9AC3AF', line:'#22493A', line2:'#1B3B2F', bar:'#0B2018', chrome:'#05110C', chrome2:'#0F261D', chromeInk:'#E7F8F0', chromeMuted:'#8DD3B2', chromeLine:'#1E4335', action:'#065F46', action2:'#047857', actionInk:'#FFFFFF', ok:'#6EE7B7', okBg:'#11392B', warn:'#F4BF4F', warnBg:'#3A2B0E', crit:'#FF8A94', critBg:'#3E1820', info:'#93C5FD', infoBg:'#162C4E' } },
  { id:'amethyst', name:'Royal amethyst', mode:'dark', accent:'#A855F7', brand:'#D8B4FE', gold:'#FBBF24',
    blurb:'Deep executive violet-obsidian paired with crisp lavender and gold glow.',
    t:{ bg:'#130D21', surface:'#1D1533', surface2:'#261C42', ink:'#F2ECFF', ink2:'#D9CEF2', ink3:'#ACA0CA', muted:'#B1A5CE', line:'#372A5C', line2:'#2D224C', bar:'#18112B', chrome:'#0D0818', chrome2:'#1D1533', chromeInk:'#F2ECFF', chromeMuted:'#C4B5FD', chromeLine:'#332656', action:'#7E22CE', action2:'#9333EA', actionInk:'#FFFFFF', ok:'#5FD3A0', okBg:'#13362C', warn:'#F4BF4F', warnBg:'#3A2B0E', crit:'#FF8A94', critBg:'#3E1820', info:'#93C5FD', infoBg:'#1A2C52' } }
];
const WT_DEFAULT = 'foundation';
const WT_AUTO = 'auto';

/* 15 distinct departmental color schemes (+ aliases) giving every LOMAMO
   department its own vivid hero gradient, accent chromatic bar, and KPI tint. */
const DEPT_PALETTES = {
  exec:     { name:'Executive Leadership',         c1:'#1A2F63', c2:'#284F9E', c3:'#B8860B', badge:'#FBBF24' },
  admin:    { name:'Administration & Operations',  c1:'#0E446E', c2:'#026AA7', c3:'#0D9488', badge:'#38BDF8' },
  ministry: { name:'Community Ministry & Field',   c1:'#0A5C42', c2:'#0F8A5F', c3:'#2A9D8F', badge:'#6EE7B7' },
  medical:  { name:'Medical & Nursing Services',   c1:'#114B72', c2:'#0284C7', c3:'#2563EB', badge:'#7DD3FC' },
  hospital: { name:'Hospital Coordination Desk',   c1:'#881337', c2:'#BE123C', c3:'#EA580C', badge:'#FDA4AF' },
  pharmacy: { name:'Pharmacy & Medicines Supply',  c1:'#115E59', c2:'#0D9488', c3:'#15803D', badge:'#5EEAD4' },
  homestay: { name:'Homestay & Respite Care',      c1:'#7C2D12', c2:'#C2410C', c3:'#CA8A04', badge:'#FDBA74' },
  finance:  { name:'Finance, Grants & Accounts',   c1:'#14532D', c2:'#15803D', c3:'#A16207', badge:'#86EFAC' },
  procure:  { name:'Procurement & Supply Chain',   c1:'#6C2E0E', c2:'#B45309', c3:'#0F766E', badge:'#FCD34D' },
  me:       { name:'Monitoring, Evaluation & Learning', c1:'#4C1D95', c2:'#6D28D9', c3:'#2563EB', badge:'#C4B5FD' },
  intldata: { name:'International Data & Global Verification', c1:'#0C4A6E', c2:'#0369A1', c3:'#6D28D9', badge:'#67E8F9' },
  audit:    { name:'Internal Audit & Assurance',   c1:'#4A1468', c2:'#7E22CE', c3:'#BE185D', badge:'#E9D5FF' },
  media:    { name:'Media, Ethics & Storytelling', c1:'#831843', c2:'#BE185D', c3:'#E11D48', badge:'#F9A8D4' },
  pr:       { name:'Public Relations & Partnerships', c1:'#3730A3', c2:'#4F46E5', c3:'#0891B2', badge:'#A5B4FC' },
  hr:       { name:'Human Resources & People',     c1:'#581C87', c2:'#9333EA', c3:'#C2410C', badge:'#E9D5FF' },
  welfare:  { name:'Staff Welfare & Support',      c1:'#065F46', c2:'#0D9488', c3:'#7C3AED', badge:'#99F6E4' },
  vehicle:  { name:'Fleet, Logistics & Transport', c1:'#713F12', c2:'#B45309', c3:'#047857', badge:'#FDE047' },
  it:       { name:'ICT, Security & Host Systems', c1:'#0F172A', c2:'#1E40AF', c3:'#0E7490', badge:'#93C5FD' }
};
function deptPaletteFor(user){
  if(!user) return DEPT_PALETTES.exec;
  const role = roleObj(user.roleId);
  const key = (role && role.dept) || 'exec';
  return DEPT_PALETTES[key] || DEPT_PALETTES.exec;
}

/* ---------------- Creative studio ----------------
   Personal, validated choices layered on top of a theme. Every colour that
   results is passed through the same contrast correction, so no combination
   can make text unreadable. Fonts are system fonts only: the kit runs offline. */
const STUDIO = {
  corners:  { label:'Corners', def:'soft', opts:[ {v:'sharp',l:'Sharp'}, {v:'soft',l:'Soft'}, {v:'round',l:'Round'} ],
              radii:{ sharp:['2px','4px','6px','8px'], soft:['8px','12px','18px','24px'], round:['14px','20px','28px','36px'] } },
  font:     { label:'Typeface & font pack', def:'standard',
              opts:[
                {v:'standard', l:'Inter Institutional (Default)'},
                {v:'editorial',l:'Editorial Serif Headings'},
                {v:'clinical', l:'Clinical Humanist Clarity'},
                {v:'executive',l:'Executive Geometric Bold'},
                {v:'readable', l:'Atkinson Field Legibility'},
                {v:'classic',  l:'Classic System Sans'},
                {v:'rounded',  l:'Friendly Rounded'},
                {v:'slab',     l:'Structured Slab Display'}
              ],
              stacks:{
                standard:null,
                editorial:'"Inter","Segoe UI",system-ui,sans-serif',
                clinical:'"Calibri","Segoe UI","Inter",system-ui,sans-serif',
                executive:'"Avenir Next","Segoe UI","Inter",system-ui,sans-serif',
                readable:'"Atkinson Hyperlegible","Verdana","Segoe UI",system-ui,sans-serif',
                classic:'"Inter","Segoe UI",system-ui,sans-serif',
                rounded:'"Trebuchet MS","Segoe UI",system-ui,sans-serif',
                slab:'"Segoe UI","Inter",system-ui,sans-serif'
              },
              headStacks:{
                standard:'"Inter","Segoe UI",system-ui,-apple-system,sans-serif',
                editorial:'"Georgia","Cambria","Times New Roman",serif',
                clinical:'"Segoe UI Semibold","Inter","Calibri",system-ui,sans-serif',
                executive:'"Avenir Next","Trebuchet MS","Inter",system-ui,sans-serif',
                readable:'"Atkinson Hyperlegible","Verdana","Segoe UI",sans-serif',
                classic:'"Inter","Segoe UI",system-ui,sans-serif',
                rounded:'"Trebuchet MS","Segoe UI",sans-serif',
                slab:'"Rockwell","Georgia","Segoe UI",serif'
              } },
  backdrop: { label:'Backdrop', def:'plain', opts:[ {v:'plain',l:'Plain'}, {v:'dots',l:'Dots'}, {v:'grid',l:'Grid'}, {v:'waves',l:'Waves'}, {v:'kente',l:'Woven stripes'} ] },
  hero:     { label:'Hero panel', def:'gradient', opts:[ {v:'gradient',l:'Gradient'}, {v:'solid',l:'Solid'}, {v:'pattern',l:'Patterned'} ] },
  cards:    { label:'Cards', def:'soft', opts:[ {v:'flat',l:'Flat'}, {v:'soft',l:'Soft'}, {v:'lifted',l:'Lifted'} ] },
  kpiStyle: { label:'Metric boxes', def:'vivid', opts:[ {v:'vivid',l:'Vivid colours'}, {v:'bold',l:'Bold jewel'}, {v:'tinted',l:'Soft tint'} ] },
  accentPick:{ label:'Accent colour', def:'', opts:[ {v:'',l:'Theme or department'}, {v:'#C8102E',l:'Crimson'}, {v:'#1F3864',l:'Navy'}, {v:'#B45309',l:'Ochre'},
              {v:'#0E7490',l:'Teal'}, {v:'#15803D',l:'Green'}, {v:'#6D28D9',l:'Violet'}, {v:'#DB2777',l:'Rose'}, {v:'#334155',l:'Slate'} ] }
};
const STUDIO_KEYS = Object.keys(STUDIO);

const STUDIO_PRESETS = [
  { id:'clinic',   name:'Clinic day',     blurb:'Foundation colours, soft corners, clear and calm.',
    p:{ wtheme:'foundation', corners:'soft',  font:'standard', backdrop:'plain', hero:'gradient', cards:'soft',   accentPick:'' } },
  { id:'night',    name:'Night shift',    blurb:'Dark, flat and easy to read for the small hours.',
    p:{ wtheme:'night',      corners:'soft',  font:'readable', backdrop:'plain', hero:'solid',    cards:'flat',   accentPick:'' } },
  { id:'sun',      name:'Field in sunlight', blurb:'Maximum contrast, large type, sharp edges for glare.',
    p:{ wtheme:'contrast',   corners:'sharp', font:'readable', backdrop:'plain', hero:'solid',    cards:'flat',   accentPick:'', touch:'large' } },
  { id:'lake',     name:'Lake calm',      blurb:'Teal, round corners and a gentle dotted backdrop.',
    p:{ wtheme:'lake',       corners:'round', font:'rounded',  backdrop:'dots',  hero:'gradient', cards:'soft',   accentPick:'' } },
  { id:'stage',    name:'Presentation',   blurb:'Midnight gold with waves and lifted cards, for showing the system.',
    p:{ wtheme:'midnight',   corners:'round', font:'classic',  backdrop:'waves', hero:'pattern',  cards:'lifted', accentPick:'' } },
  { id:'kente',    name:'Woven',          blurb:'Savanna warmth with woven stripes and an ochre accent.',
    p:{ wtheme:'savanna',    corners:'soft',  font:'standard', backdrop:'kente', hero:'pattern',  cards:'soft',   accentPick:'#B45309' } },
  { id:'minimal',  name:'Minimal',        blurb:'The original Daylight look with sharp, flat, plain surfaces.',
    p:{ wtheme:'classic',    corners:'sharp', font:'standard', backdrop:'plain', hero:'solid',    cards:'flat',   accentPick:'' } }
];

const INSTALLABLE_VISUAL_PACKS = [
  { id:'pack-foundation-editorial', name:'CareLink Heritage Editorial Pack', version:'1.2', category:'Official Institutional',
    blurb:'Pairs Foundation Ivory with authoritative serif workspace banners, navy-crimson accents and lifted cards.',
    config:{ wtheme:'foundation', font:'editorial', corners:'soft', backdrop:'plain', hero:'gradient', cards:'lifted', kpiStyle:'vivid', accentPick:'' } },
  { id:'pack-clinical-editorial', name:'Clinical Editorial & Case Review Pack', version:'1.2', category:'Medical & PDCA Reporting',
    blurb:'Pairs Georgia editorial headings with clean clinical surfaces for 120-Day & Discharge PDCA review.',
    config:{ wtheme:'foundation', font:'editorial', corners:'soft', backdrop:'plain', hero:'gradient', cards:'soft', kpiStyle:'vivid', accentPick:'#1F3864' } },
  { id:'pack-clinical-cobalt', name:'Clinical Precision & Triage Pack', version:'1.4', category:'Medical & Case Management',
    blurb:'High-clarity humanist typography, Royal Cobalt clinical surfaces and vivid status indicators.',
    config:{ wtheme:'cobalt', font:'clinical', corners:'soft', backdrop:'plain', hero:'gradient', cards:'soft', kpiStyle:'vivid', accentPick:'#0E7490' } },
  { id:'pack-field-sunlight', name:'Field Caregiver Daylight Pack', version:'1.3', category:'Tablet & Outdoor Field',
    blurb:'Atkinson high-legibility font stack, Savanna warm glare-resistant cards and comfortable touch spacing.',
    config:{ wtheme:'savanna', font:'readable', corners:'round', backdrop:'plain', hero:'solid', cards:'soft', kpiStyle:'bold', accentPick:'#15803D' } },
  { id:'pack-exec-diplomatic', name:'Executive Governance & Board Pack', version:'1.1', category:'Leadership & Finance',
    blurb:'Executive geometric headings, Covenant Gold vellum surfaces and subtle architectural grid backdrop.',
    config:{ wtheme:'covenant', font:'executive', corners:'soft', backdrop:'grid', hero:'gradient', cards:'lifted', kpiStyle:'bold', accentPick:'#1F3864' } },
  { id:'pack-lake-serenity', name:'Lake Victoria Horizon Pack', version:'1.2', category:'Kisumu & Homa Bay Regional',
    blurb:'Cool Lake Victoria shoreline teal, friendly rounded cards and crisp modern headings.',
    config:{ wtheme:'lake', font:'rounded', corners:'round', backdrop:'dots', hero:'gradient', cards:'soft', kpiStyle:'vivid', accentPick:'#0E7490' } },
  { id:'pack-slab-assurance', name:'Audit & Assurance Ledger Pack', version:'1.0', category:'Audit, M&E & Data',
    blurb:'Structured slab headings, crisp sharp card corners and clean Daylight ledger contrast.',
    config:{ wtheme:'classic', font:'slab', corners:'sharp', backdrop:'plain', hero:'solid', cards:'flat', kpiStyle:'tinted', accentPick:'#334155' } }
];

/* ---------------- colour arithmetic ---------------- */
const WTC = {
  rgb(h){ h=String(h).replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); },
  hex(r){ return '#'+r.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase(); },
  mix(a,b,t){ const A=WTC.rgb(a), B=WTC.rgb(b); return WTC.hex(A.map((v,i)=>v+(B[i]-v)*t)); },
  lum(h){ const f=c=>{ c/=255; return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
          const [r,g,b]=WTC.rgb(h); return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); },
  contrast(a,b){ let x=WTC.lum(a), y=WTC.lum(b); if(x<y){ const t=x; x=y; y=t; } return (x+0.05)/(y+0.05); }
};

const WTHEME = {
  list: WTHEMES,
  PREF: 'wtheme',

  byId(id){ return WTHEMES.find(t=>t.id===id) || null; },

  /* The theme id that applies to this person right now (never 'auto'). */
  resolveId(user){
    let id = null;
    if(user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id]) id = DB.db.personalPrefs[user.id][WTHEME.PREF];
    if(!id) id = (DB.db && DB.db.settings && DB.db.settings.consoleTheme) || WT_DEFAULT;
    if(id===WT_AUTO){
      let dark = false;
      try{ dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }catch(e){}
      return dark? 'night' : 'classic';
    }
    return WTHEME.byId(id)? id : WT_DEFAULT;
  },
  choice(user){
    const p = user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id];
    return (p && p[WTHEME.PREF]) || '';
  },
  orgDefault(){ return (DB.db && DB.db.settings && DB.db.settings.consoleTheme) || WT_DEFAULT; },

  /* The studio choices this person has made, each validated against the table. */
  studio(user){
    const p = (user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id]) || {};
    const out = {};
    STUDIO_KEYS.forEach(k=>{ const v = p[k]; out[k] = STUDIO[k].opts.some(o=>o.v===v)? v : STUDIO[k].def; });
    return out;
  },
  setStudio(user, key, value){
    if(!user) return { ok:false, msg:'Sign in first.' };
    if(!STUDIO[key]) return { ok:false, msg:'That option does not exist.' };
    if(!STUDIO[key].opts.some(o=>o.v===value)) return { ok:false, msg:'That choice is not available.' };
    DB.db.personalPrefs = DB.db.personalPrefs || {};
    DB.db.personalPrefs[user.id] = DB.db.personalPrefs[user.id] || {};
    DB.db.personalPrefs[user.id][key] = value; DB.save();
    return { ok:true };
  },
  applyPreset(user, id){
    const pre = id==='random'? WTHEME.randomPreset() : STUDIO_PRESETS.find(x=>x.id===id);
    if(!user || !pre) return { ok:false, msg:'That preset does not exist.' };
    DB.db.personalPrefs = DB.db.personalPrefs || {};
    const mine = DB.db.personalPrefs[user.id] = DB.db.personalPrefs[user.id] || {};
    Object.keys(pre.p).forEach(k=>{ mine[k] = pre.p[k]; });
    if(!('touch' in pre.p) && mine.touch==='large' && pre.id!=='sun') { /* a preset never takes away a comfort setting the person chose */ }
    DB.save();
    return { ok:true, preset:pre };
  },
  randomPreset(){
    const pick = a => a[Math.floor(Math.random()*a.length)];
    const p = { wtheme: pick(WTHEMES).id };
    STUDIO_KEYS.forEach(k=>{ p[k] = pick(STUDIO[k].opts).v; });
    return { id:'random', name:'Surprise', p };
  },
  resetStudio(user){
    if(!user) return { ok:false };
    const mine = (DB.db.personalPrefs && DB.db.personalPrefs[user.id]) || {};
    STUDIO_KEYS.forEach(k=>{ delete mine[k]; }); DB.save();
    return { ok:true };
  },

  /* Corrected accent colours for one theme and one department colour. */
  accents(theme, deptAccent, override){
    const t = theme.t, dark = theme.mode==='dark';
    const base = (override && /^#[0-9A-Fa-f]{6}$/.test(override)) ? override : ((theme.accent && theme.accent!=='dept') ? theme.accent : (deptAccent||'#C8102E'));
    /* fill: darken until white text reaches 4.5:1 (dark themes lift very dark fills so they do not vanish) */
    let fill = base;
    if(dark && WTC.contrast(fill, t.surface) < 3) fill = WTC.mix(fill,'#FFFFFF',0.35);
    const pinned = !override && theme.accent && theme.accent!=='dept';
    const fillInk = (pinned && dark)? t.actionInk : '#FFFFFF';
    let n = 0;
    /* 5.0 rather than 4.5: the hero carries soft decorative circles that nudge the colour a little */
    while(WTC.contrast(fill, fillInk) < 5.0 && n++ < 60){
      fill = dark && fillInk!=='#FFFFFF' ? WTC.mix(fill,'#FFFFFF',0.04) : WTC.mix(fill,'#000000',0.05);
    }
    /* soft tint and foreground, solved against the tint (the harder case) */
    const soft = WTC.mix(t.surface, fill, dark? 0.24 : 0.10);
    let fg = base; n = 0;
    while(WTC.contrast(fg, soft) < 4.6 && n++ < 60){
      fg = dark? WTC.mix(fg,'#FFFFFF',0.06) : WTC.mix(fg,'#000000',0.06);
    }
    return { fill, fillInk, fg, soft };
  },

  /* Every CSS custom property for a theme, as {name: value}. */
  vars(theme, deptAccent, override){
    const t = theme.t, dark = theme.mode==='dark', hc = theme.id==='contrast';
    const v = {};
    Object.keys(WT_TOKENS).forEach(k=>{ v[WT_TOKENS[k]] = t[k]; });
    const a = WTHEME.accents(theme, deptAccent, override);
    v['--accent'] = a.fill; v['--accent-ink'] = a.fillInk; v['--accent-fg'] = a.fg; v['--accent-soft'] = a.soft;
    v['--muted-2'] = WTC.mix(t.muted, t.surface, 0.38);
    v['--hover'] = WTC.mix(t.surface, t.ink, dark? 0.10 : 0.055);
    v['--chip'] = WTC.mix(t.surface, t.ink, dark? 0.14 : 0.075);
    v['--chip-ink'] = t.ink2;
    v['--field'] = dark? t.surface2 : t.surface;
    v['--field-line'] = hc? t.ink : WTC.mix(t.surface, t.ink, dark? 0.30 : 0.20);
    v['--brand'] = theme.brand; v['--gold'] = theme.gold; v['--brand-2'] = theme.brand; v['--brand-deep'] = t.chrome;
    v['--red'] = t.action; v['--red-2'] = t.action2; v['--red-soft'] = t.critBg;
    v['--focus'] = dark? '#FFD54A' : (hc? '#B36B00' : a.fg);
    v['--scrim'] = dark? 'rgba(0,0,0,.66)' : 'rgba(12,16,22,.55)';
    v['--paper'] = '#FFFFFF';
    v['--panel-mix'] = a.fillInk==='#FFFFFF'? '#101216' : '#FFFFFF';
    v['--shadow-sm'] = dark? '0 1px 2px rgba(0,0,0,.5),0 1px 3px rgba(0,0,0,.4)' : '0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08)';
    v['--shadow']    = dark? '0 2px 8px rgba(0,0,0,.45),0 8px 24px rgba(0,0,0,.35)' : '0 2px 8px rgba(16,24,40,.06),0 8px 24px rgba(16,24,40,.06)';
    v['--shadow-lg'] = dark? '0 12px 40px rgba(0,0,0,.65)' : '0 12px 40px rgba(16,24,40,.16)';
    return v;
  },

  chartPalette(){
    const th = WTHEME._active;
    if(!th || th.id==='classic') return null;
    return th.mode==='dark'
      ? ['#8FB4FF','#E3B93C','#5FD3A0','#F2B84B','#C4B5FD','#FF8A94','#7DD3FC','#B6C2D6']
      : [th.brand, th.gold, '#0E7490', '#0F7B4F', '#9A5B00', '#6D28D9', '#B45309', '#475569'];
  },

  /* Darken a fill until white text on it reaches 4.5:1 (avatars, chips). */
  safeFill(hex){
    if(!/^#[0-9A-Fa-f]{6}$/.test(String(hex||''))) return hex;
    let c = hex, n = 0;
    while(WTC.contrast(c,'#FFFFFF') < 4.5 && n++ < 40) c = WTC.mix(c,'#000000',0.05);
    return c;
  },

  _active: null,

  /* Write the theme, accent, density, text size, touch size and motion
     preferences onto the document. Safe to call on every render. */
  apply(user){
    const root = document.documentElement;
    const set = (k,v)=>{ if(root.style && root.style.setProperty) root.style.setProperty(k,v); };
    const attr = (k,v)=>{ if(root.setAttribute) root.setAttribute(k,v); };
    /* A person's theme belongs to their console. The public pages are
       always drawn in the default look. */
    const id = user? WTHEME.resolveId(user) : 'classic';
    const theme = WTHEME.byId(id) || WTHEME.byId('classic');
    WTHEME._active = theme;
    let dept = '#C8102E';
    if(user){
      const role = roleObj(user.roleId);
      const mode = WTHEME.accentModeFor(user);
      dept = (mode==='department' && role)? (deptObj(role.dept)?.accent || role.accent || '#C8102E') : '#C8102E';
    }
    const st = user? WTHEME.studio(user) : null;
    const dp = deptPaletteFor(user);
    const vars = WTHEME.vars(theme, dept, st && st.accentPick);
    Object.keys(vars).forEach(k=>set(k, vars[k]));
    set('--dept-c1', dp.c1); set('--dept-c2', dp.c2); set('--dept-c3', dp.c3); set('--dept-badge', dp.badge);
    set('--dept-soft', WTC.mix(theme.t.surface, dp.c2, theme.mode==='dark'? 0.24 : 0.11));
    set('--dept-line', WTC.mix(theme.t.surface, dp.c2, theme.mode==='dark'? 0.42 : 0.28));
    /* studio: corners and typeface are values, the rest are attributes the stylesheet reads */
    const rad = STUDIO.corners.radii[(st&&st.corners)||'soft'];
    ['--r-sm','--r','--r-lg','--r-xl'].forEach((k,i)=>set(k, rad[i]));
    const fontKey = (st&&st.font)||'standard';
    set('--font', STUDIO.font.stacks[fontKey] || '"Inter","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif');
    set('--font-head', (STUDIO.font.headStacks && STUDIO.font.headStacks[fontKey]) || '"Inter","Segoe UI",system-ui,-apple-system,sans-serif');
    attr('data-font', (st&&st.font)||'standard'); attr('data-bg', (st&&st.backdrop)||'plain');
    attr('data-hero', (st&&st.hero)||'gradient'); attr('data-cards', (st&&st.cards)||'soft'); attr('data-corners', (st&&st.corners)||'soft');
    attr('data-kpistyle', (st&&st.kpiStyle)||'vivid');
    attr('data-dept', (user && roleObj(user.roleId) && roleObj(user.roleId).dept) || 'exec');
    attr('data-wt', theme.id); attr('data-wmode', theme.mode);
    if(root.style) root.style.colorScheme = theme.mode;
    /* personal accessibility and comfort preferences */
    const p = (user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id]) || {};
    const density = p.density || (DB.db && DB.db.settings && DB.db.settings.density) || 'comfortable';
    attr('data-density', density);
    const calm = (p.reducedMotion===true) || (DB.db && DB.db.settings && DB.db.settings.animations===false);
    attr('data-calm', calm? 'on':'off');
    attr('data-touch', p.touch==='large'? 'large' : 'standard');
    const scale = user? (Number(p.textScale)||100) : 100;
    /* Expose preference token for accessibility checks while carelink63.css keeps body zoom locked at 1
       and scales typography cleanly via html[data-zoom] inside the fixed 100dvh shell. */
    set('--zoom', String(scale/100));
    attr('data-zoom', String(scale));
    /* the browser bar on Android takes the theme colour */
    try{
      const m = document.querySelector && document.querySelector('meta[name="theme-color"]');
      if(m && m.setAttribute) m.setAttribute('content', theme.t.bar);
    }catch(e){}
    return theme;
  },

  /* Department colour or LOMAMO crimson. Personal choice first, then the organisation default. */
  accentModeFor(user){
    const p = user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id];
    return (p && p.accentMode) || (DB.db && DB.db.settings && DB.db.settings.accentMode) || 'department';
  },

  /* Choose a theme for this person. Returns {ok, msg}. */
  choose(user, id){
    if(!user) return { ok:false, msg:'Sign in first.' };
    if(id!==WT_AUTO && !WTHEME.byId(id)) return { ok:false, msg:'That theme is not available.' };
    DB.db.personalPrefs = DB.db.personalPrefs || {};
    DB.db.personalPrefs[user.id] = DB.db.personalPrefs[user.id] || {};
    DB.db.personalPrefs[user.id][WTHEME.PREF] = id;
    DB.save();
    return { ok:true };
  },

  /* Organisation default. Data-layer check: only a role that holds system.config may change it. */
  setOrgDefault(user, id){
    if(!user || !RBAC.has(user,'system.config')) return { ok:false, msg:'Your role may not change the organisation default.' };
    if(id!==WT_AUTO && !WTHEME.byId(id)) return { ok:false, msg:'That theme is not available.' };
    const before = WTHEME.orgDefault();
    DB.db.settings.consoleTheme = id;
    /* Marked as an explicit choice, so the device rule (a tablet opens in
       Harbour Dusk) steps aside for a decision somebody actually made. */
    DB.db.settings.consoleThemeExplicit = true;
    AUDIT.append({actor:user.id, action:'settings.changed', entity:'setting', entityId:'consoleTheme', detail:`${JSON.stringify(before)} to ${JSON.stringify(id)}`});
    DB.save();
    return { ok:true };
  },

  /* Installable Font, Theme & Workspace Banner Packs */
  packs(){
    const custom = (DB.db && DB.db.settings && Array.isArray(DB.db.settings.installedVisualPacks))
      ? DB.db.settings.installedVisualPacks : [];
    return [...INSTALLABLE_VISUAL_PACKS, ...custom];
  },

  activePackId(user){
    const p = user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id];
    return (p && p.visualPackId) || '';
  },

  applyVisualPack(user, packId){
    if(!user) return { ok:false, msg:'Sign in first.' };
    const pack = WTHEME.packs().find(x=>x.id===packId);
    if(!pack) return { ok:false, msg:'Visual pack not found.' };
    DB.db.personalPrefs = DB.db.personalPrefs || {};
    const mine = DB.db.personalPrefs[user.id] = DB.db.personalPrefs[user.id] || {};
    const cfg = pack.config || {};
    if(cfg.wtheme && WTHEME.byId(cfg.wtheme)) mine[WTHEME.PREF] = cfg.wtheme;
    STUDIO_KEYS.forEach(k=>{
      if(cfg[k]!==undefined && STUDIO[k].opts.some(o=>o.v===cfg[k])) mine[k] = cfg[k];
    });
    mine.visualPackId = pack.id;
    DB.save();
    WTHEME.apply(user);
    return { ok:true, pack };
  },

  installCustomPack(user, rawJson){
    if(!user) return { ok:false, msg:'Sign in first.' };
    let parsed = null;
    try{ parsed = typeof rawJson==='string'? JSON.parse(rawJson) : rawJson; }catch(e){
      return { ok:false, msg:'Invalid JSON format. Paste a valid CareLink Visual Pack JSON object.' };
    }
    if(!parsed || typeof parsed!=='object' || !parsed.name){
      return { ok:false, msg:'Pack JSON must include at least "name" and "config" (or theme tokens).' };
    }
    const cleanId = 'pack-custom-' + String(parsed.id || parsed.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,28) + '-' + String(Date.now()).slice(-4);
    /* Optional custom theme definition inside pack */
    let themeId = (parsed.config && parsed.config.wtheme) || 'foundation';
    if(parsed.theme && parsed.theme.t && typeof parsed.theme.t === 'object'){
      const base = WTHEME.byId('foundation').t;
      const customThemeId = 'custom-' + cleanId.slice(-8);
      const mergedT = Object.assign({}, base, parsed.theme.t);
      if(!WTHEME.byId(customThemeId)){
        WTHEMES.push({
          id: customThemeId,
          name: String(parsed.theme.name || parsed.name).slice(0,36),
          mode: parsed.theme.mode==='dark' ? 'dark' : 'light',
          accent: parsed.theme.accent || '#1F3864',
          brand: parsed.theme.brand || '#1F3864',
          gold: parsed.theme.gold || '#A67C00',
          blurb: String(parsed.blurb || 'Custom installed CareLink visual theme.').slice(0,110),
          t: mergedT
        });
      }
      themeId = customThemeId;
    }
    const packObj = {
      id: cleanId,
      name: String(parsed.name).slice(0,48),
      version: String(parsed.version || '1.0').slice(0,12),
      category: 'Installed Custom Pack',
      blurb: String(parsed.blurb || 'Custom installed font, colour and workspace pack.').slice(0,140),
      config: Object.assign({ wtheme:themeId, font:'standard', corners:'soft', backdrop:'plain', hero:'gradient', cards:'soft', kpiStyle:'vivid', accentPick:'' }, parsed.config||{}, { wtheme:themeId })
    };
    DB.db.settings = DB.db.settings || {};
    DB.db.settings.installedVisualPacks = DB.db.settings.installedVisualPacks || [];
    DB.db.settings.installedVisualPacks.unshift(packObj);
    AUDIT.append({ actor:user.id, action:'theme.pack_installed', entity:'visualPack', entityId:cleanId, detail:`Installed visual pack ${packObj.name}` });
    DB.save();
    return WTHEME.applyVisualPack(user, cleanId);
  },

  exportActivePack(user){
    const st = WTHEME.studio(user);
    const thId = WTHEME.resolveId(user);
    const th = WTHEME.byId(thId) || WTHEME.byId('foundation');
    return JSON.stringify({
      carelinkPackVersion: 1,
      name: `${(user&&user.name?user.name.split(' ')[0]:'CareLink')} ${th.name} Pack`,
      version: '1.0',
      blurb: `Exported CareLink OS font (${st.font}) and ${th.name} workspace pack.`,
      config: Object.assign({ wtheme: th.id }, st)
    }, null, 2);
  },
  installPack(user, packId){ return WTHEME.applyVisualPack(user, packId); },
  importCustomPack(user, rawJson){ return WTHEME.installCustomPack(user, rawJson); },
  exportCurrentPack(user){ return WTHEME.exportActivePack(user); }
};

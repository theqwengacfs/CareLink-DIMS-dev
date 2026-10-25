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
  { id:'foundation', name:'Foundation White', mode:'light', accent:'#1E3A8A', brand:'#1E3A8A', gold:'#9A6700',
    blurb:'Crisp institutional pure white with royal navy and burnished gold. The default across all devices.',
    t:{ bg:'#F8FAFC', surface:'#FFFFFF', surface2:'#F1F5F9', ink:'#0F172A', ink2:'#1E293B', ink3:'#475569', muted:'#475569', line:'#CBD5E1', line2:'#E2E8F0', bar:'#FFFFFF', chrome:'#0F2143', chrome2:'#1B3668', chromeInk:'#FFFFFF', chromeMuted:'#C7D7F4', chromeLine:'#2C4E8A', action:'#1E3A8A', action2:'#1D4ED8', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E6F7EF', warn:'#8A5200', warnBg:'#FFF3D6', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8F0FE' } },
  { id:'classic', name:'Daylight White', mode:'light', accent:'dept', brand:'#1F3864', gold:'#9A6700',
    blurb:'The classic console look on crisp white paper with your department colour.',
    t:{ bg:'#F4F6FA', surface:'#FFFFFF', surface2:'#F1F4F8', ink:'#0F172A', ink2:'#1E293B', ink3:'#475569', muted:'#475569', line:'#CBD5E1', line2:'#E2E8F0', bar:'#FFFFFF', chrome:'#16294A', chrome2:'#21386A', chromeInk:'#EEF2F9', chromeMuted:'#B8C8DF', chromeLine:'#2B4472', action:'#C8102E', action2:'#B80D28', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E7F6EF', warn:'#9A5B00', warnBg:'#FFF4E0', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#EAF0FF' } },
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
    t:{ bg:'#130D21', surface:'#1D1533', surface2:'#261C42', ink:'#F2ECFF', ink2:'#D9CEF2', ink3:'#ACA0CA', muted:'#B1A5CE', line:'#372A5C', line2:'#2D224C', bar:'#18112B', chrome:'#0D0818', chrome2:'#1D1533', chromeInk:'#F2ECFF', chromeMuted:'#C4B5FD', chromeLine:'#332656', action:'#7E22CE', action2:'#9333EA', actionInk:'#FFFFFF', ok:'#5FD3A0', okBg:'#13362C', warn:'#F4BF4F', warnBg:'#3A2B0E', crit:'#FF8A94', critBg:'#3E1820', info:'#93C5FD', infoBg:'#1A2C52' } },
  { id:'alabaster', name:'Alabaster pure white', mode:'light', accent:'dept', brand:'#0F172A', gold:'#9A6700',
    blurb:'Pure gallery-white workspace with razor-sharp slate borders and maximum text clarity.',
    t:{ bg:'#FFFFFF', surface:'#FFFFFF', surface2:'#F4F6F9', ink:'#090D16', ink2:'#1E293B', ink3:'#475569', muted:'#475569', line:'#CBD5E1', line2:'#E2E8F0', bar:'#FFFFFF', chrome:'#0F172A', chrome2:'#1E293B', chromeInk:'#FFFFFF', chromeMuted:'#CBD5E1', chromeLine:'#334155', action:'#1D4ED8', action2:'#1E40AF', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E6F7EF', warn:'#8A5200', warnBg:'#FFF3D6', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8F0FE' } },
  { id:'vellum', name:'Linen & slate white', mode:'light', accent:'#0F766E', brand:'#0F5257', gold:'#9A6700',
    blurb:'Soft architectural stone-white paper with crisp charcoal type and deep mineral teal.',
    t:{ bg:'#F7F7F5', surface:'#FFFFFF', surface2:'#F0F0EC', ink:'#141413', ink2:'#292826', ink3:'#52504C', muted:'#52504C', line:'#D4D2CA', line2:'#E5E4DE', bar:'#FFFFFF', chrome:'#142826', chrome2:'#1D3B38', chromeInk:'#F7FAF9', chromeMuted:'#B8D8D4', chromeLine:'#2B5652', action:'#0F766E', action2:'#115E59', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E6F6EE', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8F0FE' } },
  { id:'glacier', name:'Glacier ice white', mode:'light', accent:'#0369A1', brand:'#0C4A6E', gold:'#9A6700',
    blurb:'Crisp arctic-white clinical surfaces with polar cerulean highlights and dark navy ink.',
    t:{ bg:'#F2F8FC', surface:'#FFFFFF', surface2:'#EBF4FA', ink:'#0A1E32', ink2:'#183652', ink3:'#415E78', muted:'#415E78', line:'#C5DCEB', line2:'#DCEBF5', bar:'#FFFFFF', chrome:'#0A2942', chrome2:'#0E3D63', chromeInk:'#F0F8FF', chromeMuted:'#B3D9F5', chromeLine:'#1B5685', action:'#0369A1', action2:'#075985', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E4F6EE', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#0369A1', infoBg:'#E0F2FE' } },
  { id:'pearl', name:'Pearl & mulberry white', mode:'light', accent:'#7E22CE', brand:'#581C87', gold:'#9A6700',
    blurb:'Luminous pearl-white cards framed by regal mulberry chrome and crisp plum-slate text.',
    t:{ bg:'#FAF7FC', surface:'#FFFFFF', surface2:'#F3EDF8', ink:'#1C122B', ink2:'#34234D', ink3:'#5C4975', muted:'#5C4975', line:'#DCCEEB', line2:'#EAE0F4', bar:'#FFFFFF', chrome:'#2A0F47', chrome2:'#41196B', chromeInk:'#FAF5FF', chromeMuted:'#D8B4FE', chromeLine:'#5C2891', action:'#7E22CE', action2:'#6B21A8', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E6F7EF', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8F0FE' } },
  { id:'coral', name:'Mombasa coral', mode:'light', accent:'#C2410C', brand:'#9A3412', gold:'#9A6700',
    blurb:'Warm coastal coral-terracotta with bright shell-white cards and rich espresso ink.',
    t:{ bg:'#FFF5F2', surface:'#FFFFFF', surface2:'#FDECE7', ink:'#26110C', ink2:'#472219', ink3:'#6E4237', muted:'#6E4237', line:'#EECAC0', line2:'#F7DFD8', bar:'#FFFFFF', chrome:'#4A180D', chrome2:'#6E2414', chromeInk:'#FFF5F2', chromeMuted:'#FDBA9F', chromeLine:'#8F321E', action:'#C2410C', action2:'#9A3412', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E5F6EC', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8F0FE' } },
  { id:'marigold', name:'Tsavo marigold', mode:'light', accent:'#9A5B00', brand:'#78350F', gold:'#9A5B00',
    blurb:'Sunlit golden-ochre accents on crisp white cards with deep acacia-umber typography.',
    t:{ bg:'#FEF9EC', surface:'#FFFFFF', surface2:'#FBF2DC', ink:'#241806', ink2:'#422D0E', ink3:'#69502A', muted:'#69502A', line:'#E8D5B0', line2:'#F3E6CC', bar:'#FFFFFF', chrome:'#3D2206', chrome2:'#5C340A', chromeInk:'#FFFBEB', chromeMuted:'#FCD38D', chromeLine:'#7D4810', action:'#9A5B00', action2:'#854D0E', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E5F6EC', warn:'#854D0E', warnBg:'#FEF3C7', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8F0FE' } },
  { id:'indigo', name:'Nairobi indigo', mode:'light', accent:'#3730A3', brand:'#312E81', gold:'#9A6700',
    blurb:'Civic indigo-blue precision with crisp white data tables and authoritative contrast.',
    t:{ bg:'#F1F3FC', surface:'#FFFFFF', surface2:'#E8ECFA', ink:'#111533', ink2:'#242B5E', ink3:'#4C5385', muted:'#4C5385', line:'#CAD1EE', line2:'#DDE2F6', bar:'#FFFFFF', chrome:'#181B4A', chrome2:'#272C70', chromeInk:'#EEF2FF', chromeMuted:'#C7D2FE', chromeLine:'#3B4299', action:'#3730A3', action2:'#4338CA', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E6F7EF', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#1E40AF', infoBg:'#E0E7FF' } },
  { id:'sage', name:'Aberdare sage', mode:'light', accent:'#166534', brand:'#14532D', gold:'#9A6700',
    blurb:'Calm highland sage and crisp botanical white crafted for long clinical review sessions.',
    t:{ bg:'#F1F7F3', surface:'#FFFFFF', surface2:'#E7F1EA', ink:'#0E2417', ink2:'#1E422C', ink3:'#466853', muted:'#466853', line:'#C6DEC9', line2:'#DCECE0', bar:'#FFFFFF', chrome:'#102E1C', chrome2:'#19472C', chromeInk:'#ECFDF3', chromeMuted:'#B4E4C5', chromeLine:'#25633E', action:'#166534', action2:'#15803D', actionInk:'#FFFFFF', ok:'#0F7B4F', okBg:'#E3F6EC', warn:'#8A5200', warnBg:'#FFF2D9', crit:'#B00020', critBg:'#FDECEE', info:'#1D4ED8', infoBg:'#E8F0FE' } },
  { id:'obsidian', name:'Obsidian pure dark', mode:'dark', accent:'#60A5FA', brand:'#93C5FD', gold:'#FBBF24',
    blurb:'Ultra-crisp carbon slate dark mode with luminous ice-blue accents for low-light wards.',
    t:{ bg:'#090C12', surface:'#111622', surface2:'#182030', ink:'#F1F5F9', ink2:'#D5DFEC', ink3:'#9FB0C7', muted:'#A3B4CC', line:'#28344B', line2:'#1F293D', bar:'#0D111B', chrome:'#05070B', chrome2:'#111622', chromeInk:'#F1F5F9', chromeMuted:'#A3B4CC', chromeLine:'#243047', action:'#60A5FA', action2:'#93C5FD', actionInk:'#09111E', ok:'#5FD3A0', okBg:'#103429', warn:'#F4BF4F', warnBg:'#3A2B0E', crit:'#FF8A94', critBg:'#3E1820', info:'#93C5FD', infoBg:'#152B4D' } },
  { id:'ruby', name:'Velvet ruby night', mode:'dark', accent:'#FB7185', brand:'#FDA4AF', gold:'#FBBF24',
    blurb:'Deep nocturnal burgundy-slate paired with crisp rose-quartz highlights and warm ivory ink.',
    t:{ bg:'#160A10', surface:'#22111A', surface2:'#2D1723', ink:'#FCEEF2', ink2:'#E8CFD7', ink3:'#C29EAA', muted:'#C7A4B0', line:'#472636', line2:'#381D2B', bar:'#1B0D14', chrome:'#0E060A', chrome2:'#22111A', chromeInk:'#FCEEF2', chromeMuted:'#D6B4C0', chromeLine:'#422232', action:'#FB7185', action2:'#FDA4AF', actionInk:'#1F070D', ok:'#5FD3A0', okBg:'#12362B', warn:'#F4BF4F', warnBg:'#3B2B0E', crit:'#FF8A94', critBg:'#421822', info:'#93C5FD', infoBg:'#1A2C50' } }
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
  corners:  { label:'Corners', def:'soft', opts:[ {v:'sharp',l:'Sharp'}, {v:'soft',l:'Soft'}, {v:'round',l:'Round'}, {v:'pill',l:'Architectural'} ],
              radii:{ sharp:['2px','4px','6px','8px'], soft:['8px','12px','18px','24px'], round:['14px','20px','28px','36px'], pill:['10px','16px','22px','30px'] } },
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
                standard:'"Inter","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif',
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
  backdrop: { label:'Backdrop', def:'plain', opts:[ {v:'plain',l:'Plain'}, {v:'dots',l:'Dots'}, {v:'grid',l:'Grid'}, {v:'waves',l:'Waves'}, {v:'kente',l:'Woven stripes'}, {v:'linen',l:'Finecross'} ] },
  hero:     { label:'Hero panel', def:'gradient', opts:[ {v:'gradient',l:'Gradient'}, {v:'solid',l:'Solid'}, {v:'pattern',l:'Patterned'} ] },
  cards:    { label:'Cards', def:'soft', opts:[ {v:'flat',l:'Flat'}, {v:'soft',l:'Soft'}, {v:'lifted',l:'Lifted'}, {v:'framed',l:'Crisp frame'} ] },
  kpiStyle: { label:'Metric boxes', def:'vivid', opts:[ {v:'vivid',l:'Vivid spectrum'}, {v:'bold',l:'Bold jewel'}, {v:'tinted',l:'Crisp top-bar'}, {v:'outlined',l:'Pure outlined'} ] },
  bannerStyle:{ label:'Console top banner', def:'spectrum', opts:[ {v:'spectrum',l:'Spectrum gradient'}, {v:'duotone',l:'Deep duotone'}, {v:'solid',l:'Solid crest'} ] },
  tabStyle: { label:'Tab & pill style', def:'pill', opts:[ {v:'pill',l:'Filled pill'}, {v:'boxed',l:'Framed card'}, {v:'underline',l:'Clean bar'} ] },
  borderWeight:{ label:'Box & table borders', def:'crisp', opts:[ {v:'crisp',l:'Crisp standard'}, {v:'bold',l:'High-contrast 1.5px'}, {v:'heavy',l:'Ledger 2px'} ] },
  tableStripe:{ label:'Table row shading', def:'subtle', opts:[ {v:'subtle',l:'Zebra rows'}, {v:'clean',l:'Pure white'}, {v:'ruled',l:'Ruled ledger'} ] },
  accentPick:{ label:'Accent colour', def:'', opts:[
    {v:'',l:'Theme or department'},
    {v:'#C8102E',l:'Crimson'}, {v:'#1F3864',l:'Navy'}, {v:'#B45309',l:'Ochre'},
    {v:'#0E7490',l:'Teal'}, {v:'#15803D',l:'Green'}, {v:'#6D28D9',l:'Violet'},
    {v:'#DB2777',l:'Rose'}, {v:'#334155',l:'Slate'}, {v:'#1D4ED8',l:'Cobalt'},
    {v:'#047857',l:'Emerald'}, {v:'#C2410C',l:'Coral'}, {v:'#9A5B00',l:'Gold'},
    {v:'#3730A3',l:'Indigo'}, {v:'#7E22CE',l:'Plum'}, {v:'#0F766E',l:'Turquoise'}
  ] }
};
const STUDIO_KEYS = Object.keys(STUDIO);

const STUDIO_PRESETS = [
  { id:'clinic',    name:'Foundation White',  blurb:'Crisp pure white, royal navy accents and soft architectural cards.',
    p:{ wtheme:'foundation', corners:'soft',  font:'standard', backdrop:'plain', hero:'gradient', cards:'soft',   kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'' } },
  { id:'purewhite', name:'Gallery Alabaster', blurb:'Pure white surfaces, high-contrast 1.5px borders and outlined metric boxes.',
    p:{ wtheme:'alabaster',  corners:'soft',  font:'clinical', backdrop:'plain', hero:'gradient', cards:'framed', kpiStyle:'outlined', bannerStyle:'spectrum', tabStyle:'boxed', borderWeight:'bold', accentPick:'#1D4ED8' } },
  { id:'glacier',   name:'Glacier Clinical',  blurb:'Arctic ice-white cards, cerulean clinical clarity and crisp top-bar KPIs.',
    p:{ wtheme:'glacier',    corners:'soft',  font:'clinical', backdrop:'plain', hero:'gradient', cards:'soft',   kpiStyle:'tinted', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'#0E7490' } },
  { id:'night',     name:'Night shift',       blurb:'Dark slate, flat cards and easy legibility for ward hours after dusk.',
    p:{ wtheme:'night',      corners:'soft',  font:'readable', backdrop:'plain', hero:'solid',    cards:'flat',   kpiStyle:'vivid', bannerStyle:'duotone', tabStyle:'pill', borderWeight:'crisp', accentPick:'' } },
  { id:'obsidian',  name:'Obsidian Pro',      blurb:'Ultra-crisp carbon dark mode with ice-blue accents and framed borders.',
    p:{ wtheme:'obsidian',   corners:'soft',  font:'executive',backdrop:'plain', hero:'gradient', cards:'framed', kpiStyle:'bold', bannerStyle:'spectrum', tabStyle:'boxed', borderWeight:'bold', accentPick:'' } },
  { id:'sun',       name:'Field in sunlight', blurb:'Maximum contrast, heavy ledger borders and large touch targets for glare.',
    p:{ wtheme:'contrast',   corners:'sharp', font:'readable', backdrop:'plain', hero:'solid',    cards:'flat',   kpiStyle:'outlined', bannerStyle:'solid', tabStyle:'boxed', borderWeight:'heavy', accentPick:'', touch:'large' } },
  { id:'lake',      name:'Lake calm',         blurb:'Kisumu shoreline teal, round corners and a gentle dotted backdrop.',
    p:{ wtheme:'lake',       corners:'round', font:'rounded',  backdrop:'dots',  hero:'gradient', cards:'soft',   kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'' } },
  { id:'coral',     name:'Mombasa Coral',     blurb:'Warm coastal coral-terracotta with bright shell-white cards.',
    p:{ wtheme:'coral',      corners:'soft',  font:'editorial',backdrop:'plain', hero:'gradient', cards:'lifted', kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'#C2410C' } },
  { id:'indigo',    name:'Nairobi Indigo',    blurb:'Civic indigo-blue precision with ruled ledger tables and sharp clarity.',
    p:{ wtheme:'indigo',     corners:'soft',  font:'executive',backdrop:'grid',  hero:'gradient', cards:'framed', kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'boxed', borderWeight:'bold', tableStripe:'ruled', accentPick:'#3730A3' } },
  { id:'stage',     name:'Presentation',      blurb:'Midnight gold with waves and lifted cards for executive briefings.',
    p:{ wtheme:'midnight',   corners:'round', font:'classic',  backdrop:'waves', hero:'pattern',  cards:'lifted', kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'' } },
  { id:'kente',     name:'Woven Savanna',     blurb:'Savanna warmth with woven stripes and a burnished ochre accent.',
    p:{ wtheme:'savanna',    corners:'soft',  font:'standard', backdrop:'kente', hero:'pattern',  cards:'soft',   kpiStyle:'vivid', bannerStyle:'duotone', tabStyle:'pill', borderWeight:'crisp', accentPick:'#B45309' } },
  { id:'minimal',   name:'Minimal Ledger',    blurb:'Crisp Daylight White with sharp edges, flat surfaces and pure white rows.',
    p:{ wtheme:'classic',    corners:'sharp', font:'standard', backdrop:'plain', hero:'solid',    cards:'flat',   kpiStyle:'outlined', bannerStyle:'solid', tabStyle:'underline', borderWeight:'bold', tableStripe:'clean', accentPick:'' } }
];

const INSTALLABLE_VISUAL_PACKS = [
  { id:'pack-foundation-editorial', name:'CareLink Foundation White Pack', version:'1.4', category:'Official Institutional',
    blurb:'Pairs Foundation White with authoritative serif workspace banners, royal navy accents and lifted cards.',
    config:{ wtheme:'foundation', font:'editorial', corners:'soft', backdrop:'plain', hero:'gradient', cards:'lifted', kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'' } },
  { id:'pack-alabaster-clarity', name:'Alabaster High-Definition White Pack', version:'1.0', category:'Maximum Readability',
    blurb:'Pure gallery-white surfaces, high-contrast 1.5px borders and outlined KPI cards with zero tint haze.',
    config:{ wtheme:'alabaster', font:'clinical', corners:'soft', backdrop:'plain', hero:'gradient', cards:'framed', kpiStyle:'outlined', bannerStyle:'spectrum', tabStyle:'boxed', borderWeight:'bold', accentPick:'#1D4ED8' } },
  { id:'pack-clinical-editorial', name:'Clinical Editorial & Case Review Pack', version:'1.3', category:'Medical & PDCA Reporting',
    blurb:'Pairs Georgia editorial headings with crisp white clinical surfaces for 120-Day & Discharge PDCA review.',
    config:{ wtheme:'foundation', font:'editorial', corners:'soft', backdrop:'plain', hero:'gradient', cards:'soft', kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'#1F3864' } },
  { id:'pack-clinical-cobalt', name:'Clinical Precision & Triage Pack', version:'1.4', category:'Medical & Case Management',
    blurb:'High-clarity humanist typography, Royal Cobalt clinical surfaces and vivid status indicators.',
    config:{ wtheme:'cobalt', font:'clinical', corners:'soft', backdrop:'plain', hero:'gradient', cards:'soft', kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'#0E7490' } },
  { id:'pack-glacier-surgical', name:'Glacier Arctic Clinical Pack', version:'1.0', category:'Hospital & Pharmacy',
    blurb:'Arctic glacier-white cards, polar cerulean accents and crisp top-bar metric boxes.',
    config:{ wtheme:'glacier', font:'clinical', corners:'soft', backdrop:'plain', hero:'gradient', cards:'framed', kpiStyle:'tinted', bannerStyle:'spectrum', tabStyle:'boxed', borderWeight:'bold', accentPick:'#0E7490' } },
  { id:'pack-field-sunlight', name:'Field Caregiver Daylight Pack', version:'1.3', category:'Tablet & Outdoor Field',
    blurb:'Atkinson high-legibility font stack, Savanna glare-resistant cards and comfortable touch spacing.',
    config:{ wtheme:'savanna', font:'readable', corners:'round', backdrop:'plain', hero:'solid', cards:'soft', kpiStyle:'bold', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'bold', accentPick:'#15803D' } },
  { id:'pack-exec-diplomatic', name:'Executive Governance & Board Pack', version:'1.2', category:'Leadership & Finance',
    blurb:'Executive geometric headings, Covenant Gold white-vellum surfaces and subtle architectural grid backdrop.',
    config:{ wtheme:'covenant', font:'executive', corners:'soft', backdrop:'grid', hero:'gradient', cards:'lifted', kpiStyle:'bold', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'#1F3864' } },
  { id:'pack-indigo-executive', name:'Nairobi Civic Indigo Pack', version:'1.0', category:'Finance, Audit & Operations',
    blurb:'Civic indigo-white precision, ruled ledger rows and crisp framed tabs for dense financial registers.',
    config:{ wtheme:'indigo', font:'executive', corners:'soft', backdrop:'plain', hero:'gradient', cards:'framed', kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'boxed', borderWeight:'bold', tableStripe:'ruled', accentPick:'#3730A3' } },
  { id:'pack-lake-serenity', name:'Lake Victoria Horizon Pack', version:'1.2', category:'Kisumu & Homa Bay Regional',
    blurb:'Cool Lake Victoria shoreline teal, friendly rounded cards and crisp modern headings.',
    config:{ wtheme:'lake', font:'rounded', corners:'round', backdrop:'dots', hero:'gradient', cards:'soft', kpiStyle:'vivid', bannerStyle:'spectrum', tabStyle:'pill', borderWeight:'crisp', accentPick:'#0E7490' } },
  { id:'pack-slab-assurance', name:'Audit & Assurance Ledger Pack', version:'1.1', category:'Audit, M&E & Data',
    blurb:'Structured slab headings, crisp sharp card corners and clean Daylight White ledger contrast.',
    config:{ wtheme:'classic', font:'slab', corners:'sharp', backdrop:'plain', hero:'solid', cards:'flat', kpiStyle:'tinted', bannerStyle:'duotone', tabStyle:'boxed', borderWeight:'bold', accentPick:'#334155' } }
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

  _prefsFor(user){
    if(!user || !DB.db || !DB.db.personalPrefs) return null;
    return DB.db.personalPrefs[user.id]
      || (user.username ? DB.db.personalPrefs[String(user.username).toLowerCase()] : null)
      || null;
  },

  syncCustomThemes(){
    const custom = (DB.db && DB.db.settings && Array.isArray(DB.db.settings.installedVisualPacks))
      ? DB.db.settings.installedVisualPacks : [];
    const base = WTHEMES.find(t=>t.id==='foundation') || WTHEMES[0];
    for(const pk of custom){
      if(!pk || !pk.theme || !pk.theme.id || !pk.theme.t || typeof pk.theme.t !== 'object') continue;
      if(!WTHEMES.some(t=>t.id===pk.theme.id)){
        WTHEMES.push({
          id: pk.theme.id,
          name: String(pk.theme.name || pk.name || 'Custom Theme').slice(0,36),
          mode: pk.theme.mode==='dark' ? 'dark' : 'light',
          accent: pk.theme.accent || '#1F3864',
          brand: pk.theme.brand || '#1F3864',
          gold: pk.theme.gold || '#A67C00',
          blurb: String(pk.theme.blurb || pk.blurb || 'Custom installed CareLink visual theme.').slice(0,110),
          t: Object.assign({}, base.t, pk.theme.t)
        });
      }
    }
  },

  byId(id){ WTHEME.syncCustomThemes(); return WTHEMES.find(t=>t.id===id) || null; },

  /* The theme id that applies to this person right now (never 'auto'). */
  resolveId(user){
    WTHEME.syncCustomThemes();
    let id = null;
    const p = WTHEME._prefsFor(user);
    if(p) id = p[WTHEME.PREF];
    if(!id) id = (DB.db && DB.db.settings && DB.db.settings.consoleTheme) || WT_DEFAULT;
    if(id===WT_AUTO){
      let dark = false;
      try{ dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }catch(e){}
      return dark? 'night' : 'classic';
    }
    return WTHEME.byId(id)? id : WT_DEFAULT;
  },
  choice(user){
    const p = WTHEME._prefsFor(user);
    return (p && p[WTHEME.PREF]) || '';
  },
  orgDefault(){ return (DB.db && DB.db.settings && DB.db.settings.consoleTheme) || WT_DEFAULT; },

  /* The studio choices this person has made, each validated against the table. */
  studio(user){
    const p = WTHEME._prefsFor(user) || {};
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
    v['--text'] = t.ink; v['--text-2'] = t.ink2; v['--text-3'] = t.muted;
    v['--border'] = t.line; v['--border-strong'] = hc ? t.ink : WTC.mix(t.line, t.ink, dark ? 0.28 : 0.22);
    v['--ok-bd'] = WTC.mix(t.okBg, t.ok, dark ? 0.45 : 0.32);
    v['--warn-bd'] = WTC.mix(t.warnBg, t.warn, dark ? 0.45 : 0.32);
    v['--crit-bd'] = WTC.mix(t.critBg, t.crit, dark ? 0.45 : 0.32);
    v['--info-bd'] = WTC.mix(t.infoBg, t.info, dark ? 0.45 : 0.32);
    v['--muted-2'] = WTC.mix(t.muted, t.surface, 0.38);
    v['--hover'] = WTC.mix(t.surface, t.ink, dark? 0.10 : 0.055);
    v['--chip'] = WTC.mix(t.surface, t.ink, dark? 0.14 : 0.075);
    v['--chip-ink'] = t.ink2;
    v['--field'] = dark? t.surface2 : t.surface;
    v['--field-line'] = hc? t.ink : WTC.mix(t.surface, t.ink, dark? 0.30 : 0.20);
    v['--brand'] = theme.brand;
    v['--brand-ink'] = WTC.contrast(theme.brand, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0B1220';
    v['--gold'] = theme.gold; v['--brand-2'] = theme.brand; v['--brand-deep'] = t.chrome;
    v['--red'] = t.action; v['--red-2'] = t.action2; v['--red-soft'] = t.critBg;
    v['--focus'] = dark? '#FFD54A' : (hc? '#B36B00' : a.fg);
    v['--scrim'] = dark? 'rgba(0,0,0,.66)' : 'rgba(12,16,22,.55)';
    v['--paper'] = '#FFFFFF';
    /* Never mix white haze into hero panels; darken slightly so fillInk stays crisp */
    v['--panel-mix'] = a.fillInk==='#FFFFFF'? '#0D1320' : '#B87D08';
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
    attr('data-banner', (st&&st.bannerStyle)||'spectrum');
    attr('data-tabstyle', (st&&st.tabStyle)||'pill');
    attr('data-borders', (st&&st.borderWeight)||'crisp');
    attr('data-tstripe', (st&&st.tableStripe)||'subtle');
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
    let customThemeDef = null;
    if(parsed.theme && parsed.theme.t && typeof parsed.theme.t === 'object'){
      const base = WTHEME.byId('foundation').t;
      const customThemeId = parsed.theme.id && String(parsed.theme.id).startsWith('custom-')
        ? String(parsed.theme.id).slice(0,36)
        : ('custom-' + cleanId.slice(-8));
      const mergedT = Object.assign({}, base, parsed.theme.t);
      customThemeDef = {
        id: customThemeId,
        name: String(parsed.theme.name || parsed.name).slice(0,36),
        mode: parsed.theme.mode==='dark' ? 'dark' : 'light',
        accent: parsed.theme.accent || '#1F3864',
        brand: parsed.theme.brand || '#1F3864',
        gold: parsed.theme.gold || '#A67C00',
        blurb: String(parsed.blurb || 'Custom installed CareLink visual theme.').slice(0,110),
        t: mergedT
      };
      if(!WTHEME.byId(customThemeId)){
        WTHEMES.push(customThemeDef);
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
    if(customThemeDef) packObj.theme = customThemeDef;
    DB.db.settings = DB.db.settings || {};
    DB.db.settings.installedVisualPacks = DB.db.settings.installedVisualPacks || [];
    DB.db.settings.installedVisualPacks.unshift(packObj);
    AUDIT.append({ actor:user.id, action:'theme.pack_installed', entity:'visualPack', entityId:cleanId, detail:`Installed visual pack ${packObj.name}` });
    DB.save();
    return WTHEME.applyVisualPack(user, cleanId);
  },

  exportActivePack(user){
    WTHEME.syncCustomThemes();
    const st = WTHEME.studio(user);
    const thId = WTHEME.resolveId(user);
    const th = WTHEME.byId(thId) || WTHEME.byId('foundation');
    const out = {
      carelinkPackVersion: 1,
      name: `${(user&&user.name?user.name.split(' ')[0]:'CareLink')} ${th.name} Pack`,
      version: '1.0',
      blurb: `Exported CareLink OS font (${st.font}) and ${th.name} workspace pack.`,
      config: Object.assign({ wtheme: th.id }, st)
    };
    if(String(th.id||'').startsWith('custom-')) out.theme = th;
    return JSON.stringify(out, null, 2);
  },
  installPack(user, packId){ return WTHEME.applyVisualPack(user, packId); },
  importCustomPack(user, rawJson){ return WTHEME.installCustomPack(user, rawJson); },
  exportCurrentPack(user){ return WTHEME.exportActivePack(user); }
};

/* ============================================================================
   scripture.js — Bible references for devotions and minutes, with seven
   translations, and an honest statement about what may be reproduced.

   The Foundation asked for Bible verses in seven translations (A6). The part of
   that request this build can honour completely is the *mechanics*:

     * a reference parser and formatter that handles the shapes people actually
       type — "John 3:16", "Jn 3:16-18", "1 Cor 13:4-7", "Psalm 23", "Rom 8:28,31";
     * a registry of the seven translations the Foundation named, each with the
       licence holder, the permission the Foundation needs, and whether this build
       may quote the full text or only the reference;
     * a verification step that only marks a passage as checked when a named person
       has compared it against the physical or licensed source.

   What it deliberately does **not** do is paste scripture text for translations
   whose licence does not permit it. Scripture in most modern translations is under
   copyright, and quoting a chapter into an operating system is a licensing act,
   not a formatting one. So the registry carries the permission state per
   translation, the reader shows the reference and the licensed link, and only a
   translation the Foundation has confirmed may be reproduced is displayed in full.
   Claiming otherwise would be the kind of unverified success this audit exists to
   stop.
   ============================================================================ */
const SCRIPTURE = (() => {
  /* The seven translations the Foundation named. `permission` is about *this
     system* reproducing the text, not about the Foundation's right to read it.
       public-domain  - may be reproduced freely
       licensed-link  - may show the reference and link, not the text
       licensed-quote - may quote a limited verse range under the publisher's
                        quotation policy, once the Foundation has recorded that
                        policy in writing
       unconfirmed    - no permission recorded; reference only */
  const TRANSLATIONS = {
    /* The seven the build has been offering since the Monday minutes screen was
       written. The Foundation asked for "the 7 major translations" without
       naming them, so this list is the developer's choice and is recorded here as
       a question to confirm, not as a requirement already met. */
    kjv:  { id:'kjv',  name:'King James Version',        short:'KJV',  year:1611, permission:'public-domain', note:'Public domain worldwide; the full text may be reproduced.' },
    niv:  { id:'niv',  name:'New International Version', short:'NIV',  year:2011, permission:'licensed-link',  note:'Biblica. Quotation limits apply; the reference is shown and the text is opened at the publisher, not copied here.' },
    nkjv: { id:'nkjv', name:'New King James Version',    short:'NKJV', year:1982, permission:'licensed-link',  note:'Thomas Nelson. Quotation limits apply; the reference is shown and the text is opened at the publisher, not copied here.' },
    esv:  { id:'esv',  name:'English Standard Version',  short:'ESV',  year:2001, permission:'licensed-link',  note:'Crossway. Quotation limits apply; the reference is shown and the text is opened at the publisher, not copied here.' },
    nlt:  { id:'nlt',  name:'New Living Translation',    short:'NLT',  year:2015, permission:'licensed-link',  note:'Tyndale. Quotation limits apply; the reference is shown and the text is opened at the publisher, not copied here.' },
    nasb: { id:'nasb', name:'New American Standard Bible', short:'NASB', year:2020, permission:'licensed-link', note:'The Lockman Foundation. Quotation limits apply; the reference is shown and the text is opened at the publisher, not copied here.' },
    csb:  { id:'csb',  name:'Christian Standard Bible',  short:'CSB',  year:2017, permission:'licensed-link',  note:'LifeWay. Quotation limits apply; the reference is shown and the text is opened at the publisher, not copied here.' },
  };
  const ORDER = ['niv', 'kjv', 'nkjv', 'esv', 'nlt', 'nasb', 'csb'];

  /* Only a translation whose permission is public domain, or which the Foundation
     has explicitly cleared in settings, may be displayed in full. */
  function mayDisplayText(id, db) {
    const t = TRANSLATIONS[id];
    if (!t) return false;
    if (t.permission === 'public-domain') return true;
    const cleared = db && db.settings && db.settings.scripture && db.settings.scripture.cleared;
    return Boolean(cleared && Array.isArray(cleared) && cleared.includes(id));
  }

  const BOOKS = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel',
    '1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalm','Proverbs','Ecclesiastes',
    'Song of Songs','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah',
    'Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans',
    '1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians',
    '1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude',
    'Revelation'];
  const ALIASES = { Ps:'Psalm', Psalms:'Psalm', Jn:'John', Jhn:'John', Rom:'Romans', Cor:'Corinthians', Gal:'Galatians',
    Eph:'Ephesians', Phil:'Philippians', Col:'Colossians', Thess:'Thessalonians', Tim:'Timothy', Heb:'Hebrews',
    Jas:'James', Pet:'Peter', Rev:'Revelation', Matt:'Matthew', Mt:'Matthew', Mk:'Mark', Lk:'Luke', Isa:'Isaiah',
    Prov:'Proverbs', Deut:'Deuteronomy', Gen:'Genesis', Ex:'Exodus' };

  function canonicalBook(raw) {
    const s = String(raw || '').trim().replace(/\.$/, '');
    if (!s) return '';
    const lower = s.toLowerCase();
    const exact = BOOKS.find(b => b.toLowerCase() === lower);
    if (exact) return exact;
    /* An ordinal prefix is part of the name: "1 Cor" and "I Cor" both mean the
       first letter to the Corinthians, and losing the number changes the book. */
    const m = s.match(/^(1|2|3|I{1,3})\s*(.+)$/i);
    if (m) {
      const num = m[1].length <= 3 && /^i+$/i.test(m[1]) ? String(m[1].length) : m[1];
      const base = ALIASES[m[2]] || m[2];
      const full = BOOKS.find(b => b.toLowerCase() === `${num} ${String(base).toLowerCase()}`);
      if (full) return full;
    }
    const alias = ALIASES[s] || ALIASES[s.replace(/\.$/, '')];
    if (alias) {
      const full = BOOKS.find(b => b.toLowerCase() === alias.toLowerCase());
      if (full) return full;
    }
    const partial = BOOKS.find(b => b.toLowerCase().startsWith(lower) && lower.length >= 3);
    return partial || s;
  }

  /* Parse one reference. Ranges and lists are both common in minutes. */
  function parse(input) {
    const text = String(input || '').trim();
    if (!text) return null;
    const cleaned = text
      .replace(/\s+/g, ' ')
      .replace(/[–—]/g, '-')
      .replace(/([A-Za-z])\.(?=\s|\d)/g, '$1');
    const m = cleaned.match(/^((?:[1-3]|I{1,3})\s*)?([1-3]?\s?[A-Za-z][A-Za-z ]*?)\s*(\d+)?\s*(?::\s*([\d,\s\-]+))?$/);
    if (!m) return null;
    const rawBook = `${m[1] || ''}${m[2] || ''}`.trim();
    const book = canonicalBook(rawBook);
    if (!book) return null;
    const chapter = m[3] ? Number(m[3]) : null;
    const verses = m[4] ? m[4].split(',').map(s => s.trim()).filter(Boolean).map(part => {
      const range = part.split(/\s*[-–]\s*/);
      const from = Number(range[0]);
      const to = range[1] ? Number(range[1]) : from;
      return { from, to: Number.isFinite(to) ? to : from };
    }).filter(v => Number.isFinite(v.from)) : [];
    return { book, chapter, verses, raw: text };
  }

  function format(ref) {
    if (!ref || !ref.book) return '';
    let out = ref.book;
    if (ref.chapter) out += ` ${ref.chapter}`;
    if (ref.verses && ref.verses.length) {
      out += ':' + ref.verses.map(v => (v.to && v.to !== v.from ? `${v.from}–${v.to}` : String(v.from))).join(',');
    }
    return out;
  }

  /* Everything a devotion or minute needs about a reference in one call. */
  function passage(input, translationId, db) {
    const ref = parse(input);
    if (!ref) return { ok: false, msg: `"${String(input || '').slice(0, 60)}" is not a reference this system can read. Write it as Book chapter:verse, for example John 3:16.` };
    const id = TRANSLATIONS[translationId] ? translationId : 'niv';
    const t = TRANSLATIONS[id];
    return {
      ok: true,
      reference: format(ref),
      parsed: ref,
      translation: { id: t.id, name: t.name, short: t.short, permission: t.permission, note: t.note },
      showText: mayDisplayText(id, db),
      /* What the screen prints when the text may not be reproduced. */
      notice: mayDisplayText(id, db) ? '' : `${t.short} text is not reproduced here: ${t.note}`,
    };
  }

  /* Which translations this device may show in full right now. */
  function available(db) {
    return ORDER.map(id => ({ ...TRANSLATIONS[id], showText: mayDisplayText(id, db) }));
  }

  /* A reference nobody has checked is not "verified". The distinction is the same
     one the signature work makes, and for the same reason. */
  function verifiedRecord(ref, translationId, user, opts = {}) {
    const p = passage(ref, translationId, opts.db);
    return {
      reference: p.ok ? p.reference : String(ref || '').slice(0, 200),
      translation: p.ok ? p.translation.short : '',
      verification: opts.verifiedBy ? 'verified' : 'unverified',
      verifiedBy: opts.verifiedBy || null,
      verifiedAt: opts.verifiedAt || null,
      recordedBy: user ? (user.name || user.username || '') : '',
      recordedAt: opts.at || new Date().toISOString(),
    };
  }

  return { TRANSLATIONS, ORDER, BOOKS, parse, format, passage, available, mayDisplayText, verifiedRecord, canonicalBook };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SCRIPTURE;

/* ============================================================
   dashboard.js - Widget arrangement for the console home.

   The home page of each console is a list of modules (KPI tiles and cards).
   This module lets the signed-in person choose which modules they see and
   in what order. The setting is personal: it never changes what another
   person sees, and it can never change a permission. A widget the person
   cannot use is never in the list in the first place, because the home
   builder already gates every module by capability.
   ============================================================ */

let DASH_LAST = [];

const DASH = {
  remember(mods){ DASH_LAST=mods||[]; return DASH_LAST; },
  last(){ return DASH_LAST; },
  keyFor(html, index, seen){
    let label='';
    const k=html.match(/<div class="k">([\s\S]*?)<\/div>/);
    if(k) label=k[1].replace(/<[^>]+>/g,'').trim();
    if(!label){
      const h=html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
      if(h) label=h[1].replace(/<[^>]+>/g,'').trim();
    }
    if(!label){
      const h4=html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
      if(h4) label=h4[1].replace(/<[^>]+>/g,'').trim();
    }
    if(!label) label='Module '+(index+1);
    label=label.replace(/\s+/g,' ').slice(0,60);
    const base=label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||('module-'+index);
    seen[base]=(seen[base]||0)+1;
    return seen[base]>1? base+'-'+seen[base] : base;
  },

  widgets(user, mods){
    const seen={};
    return mods.map((html,i)=>({ key:this.keyFor(html,i,seen), label:this.shortLabel(html,i), html, index:i }));
  },

  shortLabel(html, i){
    const k=html.match(/<div class="k">([\s\S]*?)<\/div>/);
    if(k) return k[1].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,48);
    const h=html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    if(h) return h[1].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,48);
    return 'Module '+(i+1);
  },

  prefs(user){
    const p=(DB.db.personalPrefs||{})[user.id]||{};
    return p.dashboard||{order:[],hidden:[]};
  },

  save(user, pref){
    DB.db.personalPrefs=DB.db.personalPrefs||{};
    DB.db.personalPrefs[user.id]={...(DB.db.personalPrefs[user.id]||{}),dashboard:{order:pref.order||[],hidden:pref.hidden||[]}};
    DB.save();
  },

  /* Apply the personal arrangement to a freshly built module list. */
  apply(user, mods){
    const widgets=this.widgets(user,mods);
    const pref=this.prefs(user);
    const hidden=new Set(pref.hidden||[]);
    const rank={};
    (pref.order||[]).forEach((k,i)=>{ rank[k]=i; });
    const visible=widgets.filter(w=>!hidden.has(w.key));
    visible.sort((a,b)=>{
      const ra=rank[a.key]===undefined? 999+a.index:rank[a.key];
      const rb=rank[b.key]===undefined? 999+b.index:rank[b.key];
      return ra-rb;
    });
    return visible.map(w=>w.html);
  },

  move(user, key, dir){
    const widgets=this.widgets(user, DASH_LAST);
    const pref=this.prefs(user);
    let order=(pref.order&&pref.order.length? pref.order.slice(): widgets.map(w=>w.key));
    const at=order.indexOf(key);
    if(at<0) return;
    const to=dir==='up'? at-1 : at+1;
    if(to<0||to>=order.length) return;
    [order[at],order[to]]=[order[to],order[at]];
    this.save(user,{...pref,order});
  },

  toggle(user, key){
    const pref=this.prefs(user);
    const hidden=new Set(pref.hidden||[]);
    if(hidden.has(key)) hidden.delete(key); else hidden.add(key);
    this.save(user,{...pref,hidden:[...hidden]});
  },

  reset(user){
    const pref=this.prefs(user);
    this.save(user,{order:[],hidden:[]});
    return pref;
  },

  /* The arrangement modal. Widgets are listed in the order they appear now,
     with the hidden ones at the end and clearly marked. */
  modal(user, mods){
    const widgets=this.widgets(user, mods);
    const pref=this.prefs(user);
    const hidden=new Set(pref.hidden||[]);
    const rank={}; (pref.order||[]).forEach((k,i)=>rank[k]=i);
    const ordered=widgets.slice().sort((a,b)=>{
      const ra=rank[a.key]===undefined? 999+a.index:rank[a.key];
      const rb=rank[b.key]===undefined? 999+b.index:rank[b.key];
      return ra-rb;
    });
    const rows=ordered.map((w,i)=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line-2)">
      <div class="row" style="gap:10px">
        <span class="chip">${i+1}</span>
        <div><b class="small">${esc(w.label)}</b>${hidden.has(w.key)?' <span class="badge b-neutral">Hidden</span>':''}</div>
      </div>
      <div class="row" style="gap:4px">
        <button class="btn btn-xs btn-ghost" data-act="widget-move" data-key="${esc(w.key)}" data-dir="up" ${i===0?'disabled':''} aria-label="Move up">${ic('chevron',13)}</button>
        <button class="btn btn-xs btn-ghost" data-act="widget-move" data-key="${esc(w.key)}" data-dir="down" ${i===ordered.length-1?'disabled':''} aria-label="Move down">${ic('chevron',13)}</button>
        <button class="btn btn-xs ${hidden.has(w.key)?'btn-ghost':'btn-ghost'}" data-act="widget-toggle" data-key="${esc(w.key)}">${hidden.has(w.key)?'Show':'Hide'}</button>
      </div></div>`).join('');
    openModal({title:'Arrange this console', sub:'Personal to you. It changes the order of what you see, never what you may access.',
      wide:true, body:`<div class="grid g2"><div>
        <div class="xs muted" style="margin-bottom:8px">${widgets.length} module(s) on this home page.</div>${rows}
      </div><div>
        <div class="note">${ic('info',15)}<span>A module only appears here if your role can already use it. Hiding a module removes it from your home page; the underlying record is unchanged and the menu still reaches it.</span></div>
        <div class="divider"></div>
        <button class="btn btn-sm btn-ghost" data-act="widget-reset">${ic('repeat',14)} Restore the default arrangement</button>
        <p class="small muted" style="margin-top:12px">The arrangement is stored against your account and is not audited as a system change, because it changes nothing that another person can see.</p>
      </div></div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
        <button class="btn btn-primary" data-act="close-modal">Done</button>`});
  }
};

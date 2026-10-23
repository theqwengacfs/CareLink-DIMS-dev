/* ============================================================
   pager.js - Back, Forward, Previous, Next (v5.1)

   Four kinds of movement, all personal to the session:

   1. History. Back and Forward walk the pages this person has opened, in
      order. The stack is kept here, so it works with or without the browser
      history API. Where the browser allows it, the tablet's own Back
      gesture is wired to the same stack, so it never leaves the app.
   2. Page. Previous and Next step through the pages this account's pane
      lists, in the pane's own order. They can only reach pages the pane
      already shows, so they add no way into anything a role may not open.
   3. Record. Previous and Next patient, and Previous and Next conversation.
   4. Tab. Previous and Next tab inside a record, or section inside Settings.
   ============================================================ */

const NAVH = {
  stack: [], idx: -1, MAX: 60, _moving: false, _native: false,

  reset(){ this.stack = []; this.idx = -1; this._moving = false; },
  same(a,b){ return a && b && a.view===b.view && JSON.stringify(a.params||{})===JSON.stringify(b.params||{}); },

  /* Called by go() for every page opened by the person. */
  push(view, params){
    if(this._moving) return;
    const e = { view, params: params||{} };
    if(this.same(this.stack[this.idx], e)) return;
    this.stack = this.stack.slice(0, this.idx+1);
    this.stack.push(e);
    if(this.stack.length > this.MAX) this.stack.shift();
    this.idx = this.stack.length - 1;
  },
  canBack(){ return this.idx > 0; },
  canForward(){ return this.idx >= 0 && this.idx < this.stack.length - 1; },
  peek(delta){ return this.stack[this.idx + delta] || null; },

  /* Move along the stack. Returns false if there is nowhere to go. */
  move(delta){
    const i = this.idx + delta;
    if(i < 0 || i >= this.stack.length) return false;
    this.idx = i;
    const e = this.stack[i];
    this._moving = true;
    try{ go(e.view, e.params); } finally { this._moving = false; }
    return true;
  },
  back(){ return this.move(-1); },
  forward(){ return this.move(1); },

  /* The tablet's own Back gesture. */
  onPop(ev){
    if(typeof AUTH==='undefined' || !AUTH.user) return;
    const n = ev && ev.state && typeof ev.state.n==='number' ? ev.state.n : null;
    if(n===null || n===this.idx) return;
    this.move(n - this.idx);
  },
  /* Writes the new page into the browser history where that is allowed. */
  mirror(target){
    try{
      if(this._moving){ history.replaceState({n:this.idx}, '', target); return; }
      history.pushState({n:this.idx}, '', target); this._native = true;
    }catch(e){ /* sandboxed preview: the in-app stack still works */ }
  }
};

const PAGER = {
  flat(user){ return NAVP.groups(user).reduce((a,g)=>a.concat(g.items), []); },

  /* Where this page sits in the account's own pane order. */
  around(user, here){
    const f = PAGER.flat(user);
    const i = f.findIndex(x=>here(x.id));
    return { flat:f, i, prev: i>0? f[i-1] : null, next: (i>=0 && i<f.length-1)? f[i+1] : null, total:f.length };
  },

  b(act, label, icon, attrs, disabled, cls){
    return `<button class="pg ${cls||''}" data-act="${act}" ${attrs||''} ${disabled?'disabled aria-disabled="true"':''}>${icon||''}<span class="pg-l">${esc(label)}</span></button>`;
  },

  /* The bar under every console page. */
  bar(user, here){
    const a = PAGER.around(user, here);
    const bk = NAVH.peek(-1), fw = NAVH.peek(1);
    const nm = e => e? ((a.flat.find(x=>x.id===e.view)||{}).label || '') : '';
    return `<nav class="pager" aria-label="Move between pages">
      ${PAGER.b('nav-back','Back',ic('back',16),'title="'+esc(nm(bk)?('Back to '+nm(bk)):'Back')+'"',!NAVH.canBack(),'pg-back')}
      ${PAGER.b('go', a.prev? a.prev.label : 'Previous', ic('prev',16), a.prev? `data-v="${esc(a.prev.id)}" title="Previous page: ${esc(a.prev.label)}"`:'', !a.prev, 'pg-prev')}
      <span class="pg-pos">${a.i>=0? `Page ${a.i+1} of ${a.total}` : 'Record'}</span>
      ${PAGER.b('go', a.next? a.next.label : 'Next', ic('next',16), a.next? `data-v="${esc(a.next.id)}" title="Next page: ${esc(a.next.label)}"`:'', !a.next, 'pg-next pg-r')}
      ${PAGER.b('nav-forward','Forward',ic('forward',16),'title="'+esc(nm(fw)?('Forward to '+nm(fw)):'Forward')+'"',!NAVH.canForward(),'pg-fwd pg-r')}
    </nav>`;
  },

  /* Previous and Next within a list of {id,label}. `go` carries the params. */
  record(items, currentId, view, key, extra, noun){
    const i = items.findIndex(x=>x.id===currentId);
    if(i<0 || items.length<2) return '';
    const mk = (it, dir) => it
      ? `<button class="btn btn-xs btn-ghost pg-rec" data-act="go" data-v="${esc(view)}" data-${key}="${esc(it.id)}" ${extra||''} title="${dir==='prev'?'Previous':'Next'} ${esc(noun)}: ${esc(it.label)}">${dir==='prev'?ic('prev',12):''} ${dir==='prev'?'Previous':'Next'} ${dir==='next'?ic('next',12):''}</button>`
      : `<button class="btn btn-xs btn-ghost pg-rec" disabled aria-disabled="true">${dir==='prev'?ic('prev',12)+' Previous':'Next '+ic('next',12)}</button>`;
    return `<span class="pg-recwrap" aria-label="${esc(noun)} ${i+1} of ${items.length}">${mk(items[i-1],'prev')}<span class="xs muted">${noun} ${i+1} of ${items.length}</span>${mk(items[i+1],'next')}</span>`;
  },

  /* Previous and Next tab inside one record. `act` is the tab action. */
  tabs(tabs, current, act, attrs, key){
    key = key||'tab';
    const i = tabs.findIndex(t=>t[0]===current);
    if(i<0 || tabs.length<2) return '';
    const mk = (t, dir) => t
      ? `<button class="btn btn-sm btn-ghost" data-act="${act}" ${attrs} data-${key}="${esc(t[0])}">${dir==='prev'?ic('prev',14)+' ':''}${dir==='prev'?'Previous: ':'Next: '}${esc(t[1])}${dir==='next'?' '+ic('next',14):''}</button>`
      : `<button class="btn btn-sm btn-ghost" disabled aria-disabled="true">${dir==='prev'?ic('prev',14)+' Previous':'Next '+ic('next',14)}</button>`;
    return `<div class="pg-tabs spread" style="margin-top:14px">${mk(tabs[i-1],'prev')}<span class="xs muted">Section ${i+1} of ${tabs.length}</span>${mk(tabs[i+1],'next')}</div>`;
  },

  install(){
    try{ window.addEventListener('popstate', ev=>NAVH.onPop(ev)); }catch(e){}
    try{
      document.addEventListener('keydown', e=>{
        if(!AUTH.user || !e.altKey || e.ctrlKey || e.metaKey) return;
        if(e.key==='ArrowLeft'){ e.preventDefault(); NAVH.back(); }
        else if(e.key==='ArrowRight'){ e.preventDefault(); NAVH.forward(); }
      });
    }catch(e){}
  }
};

const DRILLS = window.DRILLS;
const GLOSSARY = window.GLOSSARY;

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const store = {
  get(k,d){ try{ const v = localStorage.getItem("ck:"+k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem("ck:"+k, JSON.stringify(v)); }catch(e){} }
};
const fmt = t => { t = Math.floor(t); return Math.floor(t/60)+":"+String(t%60).padStart(2,"0"); };

let track = store.get("track","ma");
if (track!=="ma" && track!=="rx") track = "ma";
let S = null;
const ta = $("#ta");

const PROGRAM = window.PROGRAM;
const SPRINT = window.SPRINT;
let view = store.get("view","program");
if (view!=="program" && view!=="drills") view = "program";

/* Progress for a program activity = the passages finished with zero errors left (per device). */
const progKey = c => "prog:"+c.track+":"+c.day+":"+c.act;
const getProg = c => store.get(progKey(c), []);
function markProg(c, idx){
  const p = getProg(c);
  if (!p.includes(idx)){ p.push(idx); store.set(progKey(c), p); }
}

/* ---------------- home ---------------- */
function renderHome(){
  document.body.dataset.track = track;
  document.querySelectorAll("#trackseg button").forEach(b => b.classList.toggle("on", b.dataset.track===track));
  document.querySelectorAll("#viewseg button").forEach(b => b.classList.toggle("on", b.dataset.view===view));
  $("#program").hidden = view!=="program";
  $("#grid").hidden = view!=="drills";
  if (view==="program") renderProgram(); else renderGrid();
}

function renderGrid(){
  const grid = $("#grid"); grid.innerHTML = "";
  const sb = store.get("best:sprint-"+track, null);
  const sc = document.createElement("button");
  sc.className = "card";
  sc.innerHTML =
    '<div class="card-top"><span class="badge sprint">Sprint</span><span>'+SPRINT.limit+' seconds</span></div>'+
    '<h3>Warm-up Sprint</h3><p>A fresh '+SPRINT.limit+'-second run of short, job-style lines. A new mix every time.</p>'+
    '<div class="best">'+(sb ? 'Best: <b>'+sb.wpm+' WPM</b> &middot; '+sb.acc+'% accuracy' : 'No clean run yet')+'</div>';
  sc.addEventListener("click", () => openSprint());
  grid.appendChild(sc);
  DRILLS.filter(d => d.track===track).forEach(d => {
    const best = store.get("best:"+d.id, null);
    const card = document.createElement("button");
    card.className = "card";
    card.innerHTML =
      '<div class="card-top"><span class="badge '+d.mode+'">'+(d.mode==="hidden"?"Translate":"Copy")+'</span><span>'+d.items.length+' passages</span></div>'+
      '<h3>'+d.title+'</h3><p>'+d.blurb+'</p>'+
      '<div class="best">'+(best ? 'Best: <b>'+best.wpm+' WPM</b> &middot; '+best.acc+'% accuracy' : 'No clean run yet')+'</div>';
    card.addEventListener("click", () => openDrill(d.id, 0));
    grid.appendChild(card);
  });
}

/* Resolve one program activity into what the UI needs. */
function resolveAct(day, a, i){
  const ctx = { track, day:day.n, act:i };
  if (a.type==="sprint"){
    ctx.sprint = true;
    return { ctx, label:"Warm-up sprint", meta:SPRINT.limit+" seconds, timed", total:1, done:getProg(ctx).length };
  }
  const d = a.id && DRILLS.find(x => x.id===a.id);
  if (a.soon || !d) return { soon:true, label:a.label || "Coming soon", meta:"Coming soon" };
  ctx.drill = d.id;
  ctx.passages = a.passages || d.items.map((_,k) => k);
  const n = ctx.passages.length;
  return { ctx, label:a.label || d.title, meta:n+(n===1?" passage":" passages"), total:n, done:getProg(ctx).filter(k => ctx.passages.includes(k)).length };
}

function renderProgram(){
  const box = $("#program"); box.innerHTML = "";
  const cur = store.get("day:"+track, 0);
  PROGRAM[track].forEach(day => {
    const acts = day.acts.map((a,i) => resolveAct(day, a, i));
    const live = acts.filter(a => !a.soon);
    const complete = live.length>0 && live.every(a => a.done>=a.total);
    const isTest = day.acts.some(a => a.type==="test");
    const card = document.createElement("section");
    card.className = "day"+(day.n===cur ? " current" : "")+(complete ? " complete" : "");
    card.id = "day-"+day.n;
    let h = '<div class="day-top"><span class="day-n">Day '+day.n+'</span>'+
      (isTest ? '<span class="badge test">Test day</span>' : '')+
      (complete ? '<span class="badge done">Complete</span>' : (day.n===cur ? '<span class="badge today">Last opened</span>' : ''))+
      '</div><h3>'+day.title+'</h3><p>'+day.blurb+'</p><div class="acts">';
    acts.forEach((a,i) => {
      if (a.soon){
        h += '<div class="act soon"><span class="act-ico">&middot;</span><span class="act-main"><b>'+a.label+'</b><small>Coming soon</small></span></div>';
      } else {
        const fin = a.done>=a.total;
        h += '<button class="act'+(fin?' fin':'')+'" data-day="'+day.n+'" data-act="'+i+'">'+
          '<span class="act-ico">'+(fin?'&#10003;':'&#9654;')+'</span>'+
          '<span class="act-main"><b>'+a.label+'</b><small>'+a.meta+'</small></span>'+
          '<span class="act-stat">'+(fin ? 'Done' : (a.done ? a.done+'/'+a.total : 'Start'))+'</span></button>';
      }
    });
    card.innerHTML = h + '</div>';
    box.appendChild(card);
  });
}
$("#program").addEventListener("click", e => {
  const b = e.target.closest("button.act"); if (!b) return;
  const day = PROGRAM[track].find(x => x.n===+b.dataset.day);
  const i = +b.dataset.act;
  const r = resolveAct(day, day.acts[i], i);
  store.set("day:"+track, day.n);
  if (r.ctx.sprint) return openSprint(r.ctx);
  const prog = getProg(r.ctx);
  const first = r.ctx.passages.find(k => !prog.includes(k));
  openDrill(r.ctx.drill, first===undefined ? r.ctx.passages[0] : first, r.ctx);
});

document.querySelectorAll("#trackseg button").forEach(b => b.addEventListener("click", () => {
  track = b.dataset.track; store.set("track", track); renderHome();
}));
document.querySelectorAll("#viewseg button").forEach(b => b.addEventListener("click", () => {
  view = b.dataset.view; store.set("view", view); renderHome();
}));

const nameInput = $("#name");
nameInput.value = store.get("name","");
nameInput.addEventListener("input", () => store.set("name", nameInput.value));

/* ---------------- practice ---------------- */
/* ctx (optional) = the program activity this run belongs to: {track, day, act, passages, drill?, sprint?}. */
function openDrill(id, idx, ctx){
  const d = DRILLS.find(x => x.id===id);
  const list = ctx && ctx.passages ? ctx.passages : d.items.map((_,k) => k);
  begin({ d, idx, ctx:ctx||null, list, sprint:false, target:d.items[idx].text });
}

/* A sprint is a one-passage "drill" built fresh each time from SPRINT.build(). */
function openSprint(ctx){
  const d = { id:"sprint-"+track, track, mode:"copy", title:"Warm-up Sprint", why:SPRINT.why,
              items:[{ ctx:SPRINT.intro, text:SPRINT.build(track) }] };
  begin({ d, idx:0, ctx:ctx||null, list:[0], sprint:true, limit:SPRINT.limit, target:d.items[0].text });
}

function reopen(){ S.sprint ? openSprint(S.ctx) : openDrill(S.d.id, S.idx, S.ctx); }
function nextPassage(){
  if (S.sprint) return openSprint(S.ctx);
  openDrill(S.d.id, S.list[(S.list.indexOf(S.idx)+1) % S.list.length], S.ctx);
}

function begin(init){
  if (S && S.timer) clearInterval(S.timer);
  S = Object.assign({ start:0, end:0, keys:0, wrong:0, prev:"", done:false, peeks:0, peeking:false, revealed:false, timer:null }, init);
  const d = S.d;
  $("#home").hidden = true; $("#practice").hidden = false;
  $("#back").innerHTML = S.ctx ? "&larr; Day "+S.ctx.day : "&larr; All drills";
  $("#p-title").textContent = d.title;
  $("#p-count").textContent = S.sprint ? SPRINT.limit+"-second sprint" : "Passage "+(S.list.indexOf(S.idx)+1)+" of "+S.list.length;
  $("#p-ctx").innerHTML = d.items[S.idx].ctx;
  $("#p-note").textContent = S.sprint ? SPRINT.note : d.mode==="hidden"
    ? "Type the label directions in full. Letters appear as you get them right, and red means wrong. Use the cheat sheet below if you're stuck."
    : "Type it exactly as shown. Capitals, numbers, spacing, and punctuation all count.";
  $("#p-why").innerHTML = d.why;
  $("#hint-tools").hidden = d.mode!=="hidden";
  $("#peek").disabled = false; $("#reveal").disabled = false;
  $("#glossary").hidden = !d.glossary;
  if (d.glossary) $("#gl").innerHTML = GLOSSARY.map(g => "<div><b>"+g[0]+"</b>"+g[1]+"</div>").join("");
  $("#s-time-l").textContent = S.sprint ? "Time left" : "Time";
  $("#next").innerHTML = S.sprint ? "Another sprint &rarr;" : "Next passage &rarr;";
  $("#again").hidden = S.sprint;
  $("#result").hidden = true; $("#copyfall").hidden = true; $("#copy-msg").textContent = "";
  $("#typebox").classList.remove("finished");
  $("#typebox").classList.toggle("sprint", S.sprint);
  ta.value = "";
  buildText(); updateStats();
  window.scrollTo(0,0);
  focusTA();
}

function buildText(){
  const box = $("#text"); box.innerHTML = ""; box.scrollTop = 0;
  S.spans = [...S.target].map(() => { const s = document.createElement("span"); box.appendChild(s); return s; });
  paint();
}
function masked(){ return S.d.mode==="hidden" && !S.revealed && !S.peeking; }
function paint(){
  const val = S.prev, m = masked();
  for (let i=0; i<S.spans.length; i++){
    const ch = S.target[i]; let cls = "ch", txt;
    if (i < val.length){
      const ok = val[i]===ch;
      cls += ok ? " ok" : " bad";
      txt = ok ? ch : (m ? val[i] : ch);
      if (!ok && txt===" ") txt = "·";
      if (!ok && txt==="\n" && ch!=="\n") txt = "↵";
    } else {
      cls += " todo";
      txt = (m && /[A-Za-z0-9]/.test(ch)) ? "_" : ch;
    }
    if (ch==="\n"){ cls += " nl"; txt = "↵\n"; }
    if (i===val.length && !S.done) cls += " cur";
    const s = S.spans[i];
    if (s.className!==cls) s.className = cls;
    if (s.textContent!==txt) s.textContent = txt;
  }
  if (S.sprint && S.spans[val.length]){   /* sprint shows a 3-line window that follows the cursor */
    const box = $("#text");
    box.scrollTop = Math.max(0, S.spans[val.length].offsetTop - parseFloat(getComputedStyle(box).lineHeight));
  }
}

function correctCount(){ let c=0; for (let i=0;i<S.prev.length;i++) if (S.prev[i]===S.target[i]) c++; return c; }
function elapsed(){
  if (!S.start) return 0;
  const e = ((S.end || performance.now()) - S.start)/1000;
  return S.sprint ? Math.min(e, S.limit) : e;
}
function accuracy(){ return S.keys ? Math.round((S.keys - S.wrong)/S.keys*1000)/10 : 100; }
function wpm(){ const mins = elapsed()/60; return mins > 0.03 ? Math.round(correctCount()/5/mins) : 0; }
function updateStats(){
  $("#s-wpm").textContent = wpm();
  $("#s-acc").textContent = accuracy()+"%";
  $("#s-err").textContent = S.wrong;
  if (S.sprint){
    $("#s-time").textContent = fmt(Math.ceil(S.limit - elapsed()));
    $("#progress").style.width = (elapsed() / S.limit * 100)+"%";
  } else {
    $("#s-time").textContent = fmt(elapsed());
    $("#progress").style.width = (S.prev.length / S.target.length * 100)+"%";
  }
}
function tick(){
  updateStats();
  if (S.sprint && !S.done && elapsed() >= S.limit) finish();
}

ta.addEventListener("input", () => {
  if (!S) return;
  if (S.done){ ta.value = S.prev; return; }
  if (S.sprint && S.start && performance.now() - S.start >= S.limit*1000){ ta.value = S.prev; finish(); return; }
  let v = ta.value.replace(/\r/g,"").replace(/[‘’]/g,"'").replace(/[“”]/g,'"');
  if (v.length > S.target.length) v = v.slice(0, S.target.length);
  if (!S.start && v.length){ S.start = performance.now(); S.timer = setInterval(tick, S.sprint ? 100 : 250); }
  if (v.length > S.prev.length){
    for (let j=S.prev.length; j<v.length; j++){ S.keys++; if (v[j]!==S.target[j]) S.wrong++; }
  }
  S.prev = v;
  if (ta.value!==v) ta.value = v;
  try{ ta.setSelectionRange(v.length, v.length); }catch(e){}
  paint(); updateStats();
  if (v.length===S.target.length) finish();
});
ta.addEventListener("keydown", e => {
  if (e.key==="Tab"){ e.preventDefault(); return; }
  if (e.key==="Escape"){ e.preventDefault(); reopen(); return; }
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key)) e.preventDefault();
});
ta.addEventListener("paste", e => { e.preventDefault(); flash("Pasting is off. Type it out!"); });
ta.addEventListener("drop", e => e.preventDefault());
ta.addEventListener("focus", () => $("#typebox").classList.add("focused"));
ta.addEventListener("blur", () => $("#typebox").classList.remove("focused"));
$("#typebox").addEventListener("click", focusTA);
function focusTA(){ if (S && !S.done){ ta.focus({preventScroll:true}); try{ ta.setSelectionRange(ta.value.length, ta.value.length); }catch(e){} } }

let flashT;
function flash(msg){ const f = $("#flash"); f.textContent = msg; clearTimeout(flashT); flashT = setTimeout(() => f.textContent = "", 2200); }

function finish(){
  S.done = true; S.end = performance.now(); clearInterval(S.timer);
  if (S.sprint) S.end = Math.min(S.end, S.start + S.limit*1000);   /* the clock stops at exactly the limit */
  ta.blur(); $("#typebox").classList.add("finished");
  paint(); updateStats();
  /* errors left = typed characters that are still wrong (for a sprint, the untyped rest doesn't count) */
  const w = wpm(), acc = accuracy(), unc = S.prev.length - correctCount(), t = elapsed();
  const clean = unc===0 && acc>=95 && !S.revealed;
  let newBest = false;
  if (clean){
    const best = store.get("best:"+S.d.id, null);
    if (!best || w > best.wpm){ store.set("best:"+S.d.id, {wpm:w, acc}); newBest = true; }
  }
  if (S.ctx && unc===0 && !S.revealed) markProg(S.ctx, S.idx);
  let title, msg, warn = false;
  if (S.sprint && unc > 0){
    warn = true; title = "Time! Errors left behind";
    msg = unc+" wrong character"+(unc>1?"s":"")+" still in what you typed. On the job those get fixed before anything goes out. Next sprint, fix them as you go and keep your accuracy up.";
  } else if (S.sprint){
    title = acc >= 98 ? "Warmed up and accurate" : acc >= 95 ? "Clean sprint" : "Fixed, but bumpy";
    msg = acc >= 98 ? "Fast and clean. That's the combination that counts."
        : acc >= 95 ? "Nothing left behind. Push for 98% accuracy: fewer backspaces makes you faster and safer."
        : "You caught every mistake, but accuracy was "+acc+"%. Slow down a little. Steady beats fast-and-fix.";
  } else if (unc > 0){
    warn = true; title = "Not ready to send";
    msg = unc+" error"+(unc>1?"s":"")+" left in the text. In a chart or on a label, every error has to be fixed before it goes out. Try again: accuracy first, speed second.";
  } else if (S.revealed){
    title = "Done, with the answer showing";
    msg = "Good practice. Try the next one without the answer to lock in the abbreviations.";
  } else if (acc >= 98){
    title = S.d.mode==="hidden" ? "Label-ready" : "Chart-ready";
    msg = "Clean and accurate."+(S.peeks ? " (Peeked "+S.peeks+"x.)" : "");
  } else if (acc >= 95){
    title = "Clean copy";
    msg = "No errors left behind. Push for 98% accuracy. Fewer backspaces makes you faster and safer.";
  } else {
    title = "Fixed, but bumpy";
    msg = "You caught every mistake, which is good. Accuracy was "+acc+"%, so slow down a little. Steady beats fast-and-fix.";
  }
  if (newBest) msg += " New personal best for this drill!";
  $("#result").classList.toggle("warn", warn);
  $("#r-title").textContent = title;
  $("#r-msg").textContent = msg;
  $("#r-wpm").textContent = w;
  $("#r-acc").textContent = acc+"%";
  $("#r-time").textContent = fmt(t);
  $("#r-unc").textContent = unc;
  $("#result").hidden = false;
  const where = S.sprint ? S.d.title+" ("+S.limit+" s)" : S.d.title+", passage "+(S.idx+1);
  S.summary = (nameInput.value.trim() || "Student")+" | "+(S.ctx ? "Day "+S.ctx.day+" | " : "")+where+" | "+w+" WPM | "+acc+"% accuracy | "+unc+" errors left | "+fmt(t)+(S.revealed?" | answer shown":"")+(S.peeks?" | peeked "+S.peeks+"x":"")+" | "+new Date().toLocaleDateString();
  $("#result").scrollIntoView({behavior:"smooth", block:"nearest"});
}

$("#restart").addEventListener("click", reopen);
$("#again").addEventListener("click", reopen);
$("#next").addEventListener("click", nextPassage);
$("#back").addEventListener("click", () => {
  if (S && S.timer) clearInterval(S.timer);
  const day = S && S.ctx ? S.ctx.day : 0;
  $("#practice").hidden = true; $("#home").hidden = false; renderHome();
  const card = day && $("#day-"+day);
  if (card) card.scrollIntoView({block:"center"}); else window.scrollTo(0,0);
});
$("#peek").addEventListener("click", () => {
  if (!S || S.done || S.peeking) return;
  S.peeks++; S.peeking = true; paint();
  setTimeout(() => { if (S){ S.peeking = false; paint(); } }, 3000);
  focusTA();
});
$("#reveal").addEventListener("click", () => {
  if (!S || S.done) return;
  S.revealed = true; paint(); $("#reveal").disabled = true; $("#peek").disabled = true; focusTA();
});
$("#copy").addEventListener("click", async () => {
  const msgEl = $("#copy-msg");
  try{
    await navigator.clipboard.writeText(S.summary);
    msgEl.textContent = "Copied. Paste it into your assignment.";
  }catch(e){
    const f = $("#copyfall"); f.value = S.summary; f.hidden = false; f.focus(); f.select();
    msgEl.textContent = "Press Ctrl+C (or Cmd+C) to copy.";
  }
});

renderHome();

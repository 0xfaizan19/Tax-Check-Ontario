// ===== Dashboard UI =====
ITEMS.push({
  id: "auto_cpp_ei", cat: "work", kind: "auto",
  q: "CPP and EI overpaid across your jobs", name: "Refunded automatically when you file", lines: "L44800 · L45000",
  hint: "Each employer takes a full year of CPP, CPP2 and EI as if it were your only job. With more than one job you overpay, and the extra comes back on your return.",
  tags: "cpp ei cpp2 overpayment multiple employers refund",
  val: (R, S, D) => ({ n: D.refund, t: D.refund ? fmt(D.refund) + " back" : "$0 with one job" })
});

const CAT_LABEL = { on: "On", fav: "Favorites", family: "Family", savings: "Savings", work: "Work", health: "Health", home: "Home", learning: "School", giving: "Giving", investing: "Investing", ontario: "Ontario", other: "Other", ended: "Ended" };
const CAT_NOTE = {
  on: "Everything you've switched on, biggest saving first.",
  fav: "Options you've starred, whether they're on or off.",
  family: "Start here. Switch on whatever describes your household; children, a spouse and dependants also feed benefits in other tabs.",
  ontario: "Ontario-only credits and programs. The ones at the bottom are applied for you automatically.",
  ended: "These no longer exist for 2026. They're listed so you don't go looking for them.",
  other: "Special situations. The top-up credit at the bottom is applied automatically."
};
const BY = Object.fromEntries(ITEMS.map(d => [d.id, d]));
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = n => (n * 100).toFixed(1) + "%";
const KEY = "three-job-tax-2026-v2";

const S = {
  jobs: [
    { id: "j1", name: "Job 1", pay: 110000, on: true },
    { id: "j2", name: "Job 2", pay: 90000, on: true },
    { id: "j3", name: "Job 3", pay: 92500, on: true }
  ],
  sv: {}, fav: {}, room: { rrsp: 25382, tfsa: 31362.74 }, tab: "family", q: ""
};
try {
  const o = JSON.parse(localStorage.getItem(KEY) || "null");
  if (o) {
    (o.jobs || []).forEach(s => { const j = S.jobs.find(x => x.id === s.id); if (j) { j.pay = num(s.pay); j.on = !!s.on; } });
    if (o.sv && typeof o.sv === "object") S.sv = o.sv;
    if (o.fav && typeof o.fav === "object") S.fav = o.fav;
    if (o.room && typeof o.room === "object") Object.assign(S.room, o.room);
    // one-time: the RRSP limit now comes from CRA My Account ($25,382) instead of the $33,810 example
    if (!o.mig1 && S.sv.rrsp && S.sv.rrsp.v && num(S.sv.rrsp.v.limit) === 33810) S.sv.rrsp.v.limit = 25382;
    if (o.tab && CAT_LABEL[o.tab]) S.tab = o.tab;
  }
} catch (e) { /* storage unavailable: start fresh */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify({ jobs: S.jobs.map(({ id, pay, on }) => ({ id, pay, on })), sv: S.sv, fav: S.fav, room: S.room, mig1: 1, tab: S.tab })); } catch (e) { } }

const rowDefaults = d => Object.fromEntries(d.rows.fields.map(f => [f.k, f.def]));
function defaultsOf(d) {
  const v = {};
  for (const f of d.fields || []) v[f.k] = f.def;
  if (d.rows) v.rows = [rowDefaults(d)];
  return v;
}
function st(id) {
  const d = BY[id];
  let s = S.sv[id];
  if (!s || typeof s !== "object") s = S.sv[id] = { on: false, v: defaultsOf(d) };
  if (!s.v) s.v = defaultsOf(d);
  for (const f of d.fields || []) if (!(f.k in s.v)) s.v[f.k] = f.def;
  if (d.rows) {
    if (!Array.isArray(s.v.rows) || !s.v.rows.length) s.v.rows = [rowDefaults(d)];
    for (const r of s.v.rows) for (const f of d.rows.fields) if (!(f.k in r)) r[f.k] = f.def;
  }
  return s;
}
const isOn = d => d.kind === "auto" || ((d.kind === "calc" || d.kind === "tip") && S.sv[d.id] && S.sv[d.id].on);

// ---------- calculation ----------
const now = new Date();
const y0 = new Date(2026, 0, 1), y1 = new Date(2027, 0, 1), dueDate = new Date(2027, 3, 30);
const ytd = Math.min(1, Math.max(0, (now - y0) / (y1 - y0)));
const monthsLeft = Math.max(1, Math.ceil((dueDate - now) / (30.44 * 864e5)));
let L = null;

function calc() {
  const act = S.jobs.filter(j => j.on && j.pay > 0);
  const emp = act.reduce((s, j) => s + j.pay, 0);
  const wh = {};
  let withheld = 0, paid = 0;
  for (const j of S.jobs) {
    const t = simpleTax(j.pay), c = contrib(j.pay).total;
    wh[j.id] = { t, c };
    if (j.on && j.pay > 0) { withheld += t; paid += c; }
  }
  const req = contrib(emp).total, refund = pos(paid - req);
  const list = ITEMS.filter(isOn).map(d => ({ def: d, v: d.kind === "auto" ? {} : st(d.id).v }));
  const R = compute(emp, list, null);
  const base = compute(emp, list, id => BY[id].kind !== "auto");
  const saves = {};
  for (const a of list) {
    const d = a.def;
    if (d.kind === "calc" || (d.kind === "auto" && d.post)) saves[d.id] = compute(emp, list, d.id).net - R.net;
  }
  const up = compute(emp + 100, list, null);
  L = { act, emp, wh, withheld, paid, req, refund, R, base, saves, marg: (up.net - R.net) / 100, list };
}

// ---------- jobs ----------
function renderJobs() {
  $("jobs").innerHTML = S.jobs.map(j => `
    <div class="job ${j.on ? "on" : ""}" id="card-${j.id}">
      <span class="name">${j.name}</span>
      <label class="sw" title="Include ${j.name}"><input type="checkbox" id="on-${j.id}" ${j.on ? "checked" : ""} aria-label="Include ${j.name}"><span></span></label>
      <label class="sal" for="pay-${j.id}">$<input id="pay-${j.id}" inputmode="numeric" value="${j.pay.toLocaleString("en-CA")}" aria-label="${j.name} salary"></label>
      <span></span>
      <span class="wh" id="wh-${j.id}"></span>
    </div>`).join("") + `
    <div class="total" aria-live="polite">
      <div class="top"><span class="lbl">Taxable income</span><span class="line">L26000</span></div>
      <span class="v num" id="tInc"></span>
      <span class="d" id="tIncD"></span>
    </div>`;
  for (const j of S.jobs) {
    $("on-" + j.id).addEventListener("change", e => { j.on = e.target.checked; $("card-" + j.id).classList.toggle("on", j.on); refresh(); });
    const inp = $("pay-" + j.id);
    inp.addEventListener("input", () => { j.pay = Math.max(0, +inp.value.replace(/[^\d.]/g, "") || 0); refresh(); });
    inp.addEventListener("blur", () => { inp.value = j.pay.toLocaleString("en-CA"); });
  }
}

// ---------- dashboard ----------
function renderDash() {
  const { act, emp, wh, withheld, req, refund, R, base } = L;
  for (const j of S.jobs) $("wh-" + j.id).textContent = `Withholds ≈ ${fmt(wh[j.id].t)} tax + ${fmt(wh[j.id].c)} CPP/EI`;
  $("tInc").textContent = fmt(R.ti);
  $("tIncD").textContent = `${fmt(R.totalInc)} total income − ${fmt(pos(R.totalInc - R.ti))} deductions · ${act.length} of ${S.jobs.length} jobs on`;

  const tax = R.total, ref = R.ref, ben = R.ben;
  const gap = tax - withheld, due = gap - refund - ref;
  const taxSave = base.total - tax, sit = base.net - R.net;
  $("kWith").textContent = fmt(withheld);
  $("kWithD").textContent = `≈ ${fmt(withheld * ytd)} taken off your pay so far`;
  $("kOwe").textContent = fmt(tax);
  $("kOweD").innerHTML = `Federal ${fmt(R.fedTax)} · Ontario ${fmt(R.onTax)}` + (taxSave > 0.5 ? ` · <b>${fmt(taxSave)} less from your situation</b>` : "");
  $("kRef").textContent = fmt(refund + ref);
  $("kRefD").textContent = [refund > 0.5 ? `CPP/EI overpaid ${fmt(refund)}` : "", ref > 0.5 ? `refundable credits ${fmt(ref)}` : ""].filter(Boolean).join(" · ") || "No overpayment with one job";
  $("kRefBox").classList.toggle("ok", refund + ref > 0.5);
  const owing = due > 0.5;
  $("kDue").textContent = fmt(Math.abs(due));
  $("kDueL").textContent = owing ? "Balance due Apr 30, 2027" : "Refund expected";
  $("kDueBox").className = "kpi " + (owing ? "due" : "ok");
  $("kDueD").textContent = act.length ? `${fmt(gap)} ${gap >= 0 ? "tax shortfall" : "over-withheld"} − ${fmt(refund + ref)} refunds` : "Switch a job on";

  const netTax = Math.max(0, tax - ref), cash = R.cash;
  const parts = [
    { k: "Tax withheld", v: Math.min(withheld, netTax), c: "var(--s1)", n: "Already off your paycheques" },
    { k: "Tax not yet withheld", v: pos(netTax - withheld), c: "var(--s2)", n: "Due with your return" },
    { k: "CPP + EI (required)", v: req, c: "var(--s3)", n: "What you actually owe once" },
    { k: "Take-home", v: pos(cash - netTax - req), c: "var(--s4)", n: `${fmt(pos(cash - netTax - req) / 12)} a month` }
  ];
  $("barTitle").textContent = `Where your ${fmt(cash)} goes`;
  $("bar").setAttribute("aria-label", parts.map(p => `${p.k} ${fmt(p.v)}`).join(", "));
  $("bar").innerHTML = cash > 0 ? parts.map((p, i) => p.v > 0 ? `<div class="seg" data-i="${i}" style="flex-grow:${p.v};background:${p.c}"></div>` : "").join("") : `<div class="seg" style="flex-grow:1;background:var(--line)"></div>`;
  $("legend").innerHTML = parts.map(p => `<div class="lg"><i style="background:${p.c}"></i><span>${p.k}</span><b>${fmt(p.v)}</b><small>${cash ? pct(p.v / cash) : "0%"} · ${p.n}</small></div>`).join("");
  $("bar").querySelectorAll(".seg[data-i]").forEach(s => {
    s.addEventListener("mouseenter", () => { const p = parts[+s.dataset.i]; const t = document.createElement("div"); t.className = "tip"; t.id = "tip"; t.textContent = `${p.k}: ${fmt(p.v)} (${pct(p.v / cash)})`; t.style.left = (s.offsetLeft + s.offsetWidth / 2) + "px"; $("bar").appendChild(t); });
    s.addEventListener("mouseleave", () => { const t = $("tip"); if (t) t.remove(); });
  });
  $("why").innerHTML = act.length > 1
    ? `<strong>Why you owe:</strong> each employer applies the basic personal amount, the low brackets and a full year of CPP/EI as if it were your only job. On your return they count once, against ${fmt(emp)} combined.`
    : act.length === 1 ? `<strong>One job on:</strong> that employer's withholding matches the tax on that job. Turn on a second job to see the gap appear.`
      : `<strong>No jobs on.</strong> Switch a job on above to see the numbers.`;

  renderRooms();
  const nOn = ITEMS.filter(d => (d.kind === "calc" || d.kind === "tip") && isOn(d)).length;
  const rows = [
    ["Your situation saves", nOn ? fmt(sit) : "Switch items on →", "hl"],
    ...(ben > 0.5 ? [["Benefits paid Jul 2027 to Jun 2028", fmt(ben), "hl"]] : []),
    ["Effective income-tax rate", cash ? pct(tax / cash) : "0%"],
    ["Tax on your next $100 earned", pct(L.marg)],
    ["Set aside each month until Apr 30", owing ? fmt(due / monthsLeft) : "$0"],
    ["Extra tax per biweekly pay next year (TD1)", owing ? fmt(due / 26) : "$0"],
    ["Quarterly instalments", gap - ref > 3000 ? `<span class="pill warn">Likely from 2027</span>` : `<span class="pill good">Not needed</span>`]
  ];
  $("facts").innerHTML = rows.map(([a, b, c]) => `<div class="fact ${c || ""}"><span>${a}</span><b>${b}</b></div>`).join("");
}

// ---------- RRSP / TFSA room ----------
// RRSP and TFSA room: editable, start at the CRA My Account figures (Jan 1, 2026), never reduced by entries
const cents = n => num(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function renderRooms() {
  for (const [id, k] of [["rrspRoom", "rrsp"], ["tfsaRoom", "tfsa"]]) { const el = $(id); if (document.activeElement !== el) el.value = cents(S.room[k]); }
  // What deducting the full room would save at today's income
  const room = num(S.room.rrsp);
  const hv = { ...defaultsOf(BY.rrsp), limit: room, own: room };
  const hl = L.list.filter(a => a.def.id !== "rrsp").concat([{ def: BY.rrsp, v: hv }]);
  const base = compute(L.emp, L.list.filter(a => a.def.id !== "rrsp"), null).net;
  $("rrspSave").innerHTML = `Contributing all of it by Mar 1, 2027 saves about <b>${fmt(base - compute(L.emp, hl, null).net)}</b> at your income.`;
}

// ---------- situation pane ----------
function badge(d) {
  if (d.kind === "ended") return `<span class="badge ended">Ended ${esc(d.ended)}</span>`;
  if (d.kind === "auto") {
    const r = d.val(L.R, L.saves[d.id] || 0, { refund: L.refund });
    return `<span class="badge ${r.n > 0.5 ? "save" : r.n < -0.5 ? "cost" : "zero"}">${esc(r.t)}</span>`;
  }
  if (!isOn(d)) return "";
  if (d.kind === "tip") return `<span class="badge info">Strategy</span>`;
  const s = L.saves[d.id] || 0;
  return s > 0.5 ? `<span class="badge save">Saves ${fmt(s)}</span>` : s < -0.5 ? `<span class="badge cost">Costs ${fmt(-s)}</span>` : `<span class="badge zero">$0 now</span>`;
}
function fieldHTML(d, f, val, ri) {
  const id = `f-${d.id}-${ri == null ? "" : "r" + ri + "-"}${f.k}`;
  const data = `data-k="${f.k}"${ri == null ? "" : ` data-r="${ri}"`}`;
  if (f.type === "bool") return `<label class="f chk" data-fk="${f.k}"><input type="checkbox" id="${id}" ${data} ${val ? "checked" : ""}><span>${esc(f.label)}</span></label>`;
  let ctl;
  if (f.type === "select") ctl = `<select id="${id}" ${data}>${f.opts.map(([o, l]) => `<option value="${esc(o)}" ${o === val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  else {
    const shown = f.type === "money" ? num(val).toLocaleString("en-CA") : String(val == null ? "" : val);
    ctl = `<input type="text" id="${id}" ${data} inputmode="${f.type === "int" ? "numeric" : "decimal"}" value="${esc(shown)}">`;
    if (f.type === "money") ctl = `<div class="money"><i>$</i>${ctl}</div>`;
  }
  const wide = f.label.length > 38 ? " wide" : "";
  return `<label class="f${wide}" data-fk="${f.k}" for="${id}"><span>${esc(f.label)}${f.type === "pct" ? " (%)" : ""}</span>${ctl}</label>`;
}
const showCat = () => !!S.q.trim() || S.tab === "on" || S.tab === "fav";
const starBtn = d => { const f = !!S.fav[d.id]; return `<button type="button" class="star" data-star aria-pressed="${f}" aria-label="${f ? "Remove from" : "Add to"} favorites" title="${f ? "Remove from" : "Add to"} favorites">${f ? "★" : "☆"}</button>`; };
function savedTag(d) {
  const s = S.sv[d.id];
  if (!s || s.on || (d.kind !== "calc" && d.kind !== "tip")) return "";
  const note = !!(s.note && s.note.trim());
  const entries = !!(s.v && JSON.stringify(s.v) !== JSON.stringify(defaultsOf(d)));
  if (!note && !entries) return "";
  return `<span class="has-note">${entries && note ? "Entries and note saved" : entries ? "Entries saved" : "Note saved"}</span>`;
}
function cardHTML(d, withCat) {
  const meta = `<div class="it-meta">${withCat ? `<span class="cat">${CAT_LABEL[d.cat]}</span>` : ""}<span>${esc(d.name)}</span>${d.lines ? `<span class="line">${esc(d.lines)}</span>` : ""}${savedTag(d)}</div>`;
  if (d.kind === "auto" || d.kind === "ended") {
    return `<div class="it ${d.kind}" data-id="${d.id}"><div class="it-top"><span class="it-q">${esc(d.q)}</span>${starBtn(d)}${badge(d)}</div>${meta}<p class="it-hint">${esc(d.hint)}</p><ul class="says" data-says></ul></div>`;
  }
  const s = st(d.id), on = !!s.on;
  let body = "";
  if (on) {
    const v = s.v;
    if (d.kind === "tip") body += `<p class="tiptext">${esc(d.tip)}</p>`;
    if (d.fields && d.fields.length) body += `<div class="fields">${d.fields.map(f => fieldHTML(d, f, v[f.k])).join("")}</div>`;
    if (d.rows) {
      const max = d.rows.max || 10;
      body += v.rows.map((r, i) => `<div class="rowbox"><div class="rh"><span>${esc(d.rows.label)} ${i + 1}</span>${v.rows.length > 1 ? `<button type="button" class="rm" data-rm="${i}" aria-label="Remove ${esc(d.rows.label)} ${i + 1}">Remove</button>` : ""}</div><div class="fields">${d.rows.fields.map(f => fieldHTML(d, f, r[f.k], i)).join("")}</div></div>`).join("");
      if (v.rows.length < max) body += `<button type="button" class="add" data-add>+ ${esc(d.rows.add || "Add another")}</button>`;
    }
    body += `<ul class="says" data-says></ul>`;
    body += `<label class="f note" for="note-${d.id}"><span>My notes</span><textarea id="note-${d.id}" data-note rows="2" placeholder="Receipts to find, questions for my accountant, where the numbers came from">${esc(s.note || "")}</textarea></label>`;
  }
  return `<div class="it ${on ? "on" : ""}" data-id="${d.id}">
    <div class="it-top"><label class="sw"><input type="checkbox" id="sw-${d.id}" data-sw ${on ? "checked" : ""}><span></span></label><label class="it-q" for="sw-${d.id}">${esc(d.q)}</label>${starBtn(d)}${badge(d)}</div>
    ${meta}<p class="it-hint">${esc(d.hint)}</p>${on ? `<div class="it-body">${body}</div>` : ""}</div>`;
}
function listItems() {
  const q = S.q.trim().toLowerCase();
  if (q) {
    const terms = q.split(/\s+/);
    return ITEMS.filter(d => { const h = [d.q, d.name, d.hint, d.tags, d.lines, d.tip, CAT_LABEL[d.cat], S.sv[d.id] && S.sv[d.id].note].join(" ").toLowerCase(); return terms.every(t => h.includes(t)); });
  }
  if (S.tab === "fav") return ITEMS.filter(d => S.fav[d.id]);
  if (S.tab === "on") return ITEMS.filter(d => (d.kind === "calc" || d.kind === "tip") && isOn(d)).sort((a, b) => (L.saves[b.id] || 0) - (L.saves[a.id] || 0));
  const inCat = ITEMS.filter(d => d.cat === S.tab);
  return [...inCat.filter(d => d.kind === "calc" || d.kind === "tip"), ...inCat.filter(d => d.kind === "auto"), ...inCat.filter(d => d.kind === "ended")];
}
function renderTabs() {
  const counts = {};
  let total = 0;
  for (const d of ITEMS) if ((d.kind === "calc" || d.kind === "tip") && isOn(d)) { counts[d.cat] = (counts[d.cat] || 0) + 1; total++; }
  counts.on = total;
  counts.fav = ITEMS.filter(d => S.fav[d.id]).length;
  const tabs = ["on", "fav", "family", "savings", "work", "health", "home", "learning", "giving", "investing", "ontario", "other", "ended"].filter(c => c === "on" || c === "fav" || ITEMS.some(d => d.cat === c));
  $("svTabs").innerHTML = tabs.map(c => `<button type="button" class="tab" role="tab" data-tab="${c}" aria-selected="${!S.q && S.tab === c}">${CAT_LABEL[c]}${counts[c] ? `<span class="c">${counts[c]}</span>` : ""}</button>`).join("");
  const sit = L.base.net - L.R.net;
  $("svSum").innerHTML = total ? `${total} switched on · <b>saves ${fmt(sit)}</b>` : `${ITEMS.filter(d => d.kind !== "auto").length} credits, deductions, programs and strategies`;
}
function renderList() {
  const items = listItems();
  const q = S.q.trim();
  const note = q ? `${items.length} result${items.length === 1 ? "" : "s"} for “${esc(q)}”` : CAT_NOTE[S.tab] || "";
  const empty = S.tab === "fav" && !q ? `<p class="sv-note">No favorites yet. Tap the ☆ on any option to add it here.</p>`
    : S.tab === "on" && !q ? `<p class="sv-note">Nothing switched on yet. Start with Family, Savings or Work.</p>` : q ? `<p class="sv-note">Try a different word, like “rent”, “tuition” or “car”.</p>` : "";
  $("svList").innerHTML = (note ? `<p class="sv-note">${note}</p>` : "") + (items.length ? items.map(d => cardHTML(d, showCat())).join("") : empty);
  fillCards();
}
function fillCards() {
  for (const el of $("svList").querySelectorAll(".it[data-id]")) {
    const d = BY[el.dataset.id];
    const b = el.querySelector(".badge"), nb = badge(d);
    if (b) b.outerHTML = nb || ""; else if (nb) el.querySelector(".it-top").insertAdjacentHTML("beforeend", nb);
    const ul = el.querySelector("[data-says]");
    if (ul) { const says = (L.R.says[d.id] || []); ul.innerHTML = says.map(t => `<li>${esc(t)}</li>`).join(""); ul.hidden = !says.length; }
    if (isOn(d) && d.kind !== "auto") {
      const v = st(d.id).v;
      for (const f of d.fields || []) if (f.show) { const w = el.querySelector(`.it-body > .fields > [data-fk="${f.k}"]`); if (w) w.hidden = !f.show(v, L.R); }
    }
  }
}
function rerenderCard(id, focusSel) {
  const el = $("svList").querySelector(`.it[data-id="${id}"]`);
  if (!el) return;
  el.outerHTML = cardHTML(BY[id], showCat());
  fillCards();
  if (focusSel) { const f = $("svList").querySelector(`.it[data-id="${id}"] ${focusSel}`); if (f) f.focus(); }
}
function refresh() { calc(); renderDash(); renderTabs(); fillCards(); save(); }

function parseField(f, raw) {
  if (f.type === "bool") return !!raw;
  if (f.type === "select") return raw;
  let n = +String(raw).replace(/[^\d.\-]/g, "") || 0;
  if (f.type === "int") n = Math.round(n);
  if (f.type === "pct") n = clamp(n, 0, 100);
  if (f.min != null) n = Math.max(f.min, n);
  if (f.max != null) n = Math.min(f.max, n);
  return n;
}
function fieldOf(d, el) { const k = el.dataset.k; return el.dataset.r != null ? d.rows.fields.find(f => f.k === k) : (d.fields || []).find(f => f.k === k); }
function setField(el, fromBlur) {
  const card = el.closest(".it[data-id]"); if (!card) return;
  const d = BY[card.dataset.id], f = fieldOf(d, el); if (!f) return;
  const s = st(d.id), tgt = el.dataset.r != null ? s.v.rows[+el.dataset.r] : s.v;
  tgt[f.k] = parseField(f, f.type === "bool" ? el.checked : el.value);
  if (fromBlur && f.type === "money") el.value = num(tgt[f.k]).toLocaleString("en-CA");
  refresh();
}

const list = $("svList");
list.addEventListener("change", e => {
  const t = e.target;
  if (t.matches("[data-sw]")) {
    const id = t.closest(".it").dataset.id, s = st(id);
    s.on = t.checked;
    calc(); renderDash(); renderTabs(); save();
    if (S.tab === "on" && !S.q.trim() && !s.on) renderList(); else rerenderCard(id, "[data-sw]");
    return;
  }
  if (t.matches("[data-k]") && (t.type === "checkbox" || t.tagName === "SELECT")) setField(t);
});
list.addEventListener("input", e => {
  if (e.target.matches("[data-note]")) { st(e.target.closest(".it").dataset.id).note = e.target.value; save(); return; }
  if (e.target.matches("input[type=text][data-k]")) setField(e.target);
});
list.addEventListener("focusout", e => { if (e.target.matches("input[type=text][data-k]")) setField(e.target, true); });
list.addEventListener("click", e => {
  const star = e.target.closest("[data-star]");
  if (star) {
    const id = star.closest(".it").dataset.id;
    if (S.fav[id]) delete S.fav[id]; else S.fav[id] = true;
    save(); renderTabs();
    if (S.tab === "fav" && !S.q.trim() && !S.fav[id]) renderList(); else rerenderCard(id, "[data-star]");
    return;
  }
  const add = e.target.closest("[data-add]"), rm = e.target.closest("[data-rm]");
  if (!add && !rm) return;
  const id = e.target.closest(".it").dataset.id, d = BY[id], s = st(id);
  if (add) s.v.rows.push(rowDefaults(d)); else s.v.rows.splice(+rm.dataset.rm, 1);
  refresh(); rerenderCard(id, add ? ".rowbox:last-of-type input" : "[data-add]");
});
$("svTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-tab]"); if (!b) return;
  S.tab = b.dataset.tab; S.q = ""; $("svSearch").value = ""; save();
  renderTabs(); renderList(); list.scrollTop = 0;
});
$("svSearch").addEventListener("input", e => { S.q = e.target.value; renderTabs(); renderList(); list.scrollTop = 0; });
let resetArmed = null;
$("svReset").addEventListener("click", e => {
  const b = e.currentTarget;
  if (!resetArmed) { b.textContent = "Click again to turn all off"; resetArmed = setTimeout(() => { resetArmed = null; b.textContent = "Turn all off"; }, 3000); return; }
  clearTimeout(resetArmed); resetArmed = null; b.textContent = "Turn all off";
  for (const s of Object.values(S.sv)) if (s) s.on = false;   // entries, notes and favorites stay
  refresh(); renderList();
});

$("asof").textContent = "as of " + now.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
for (const [id, k] of [["rrspRoom", "rrsp"], ["tfsaRoom", "tfsa"]]) {
  const el = $(id);
  el.addEventListener("input", () => { S.room[k] = +el.value.replace(/[^\d.]/g, "") || 0; renderRooms(); save(); });
  el.addEventListener("blur", () => renderRooms());
}
renderJobs(); calc(); renderDash(); renderTabs(); renderList(); save();

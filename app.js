/* SplitJapan MVP — no backend, state in localStorage + share-link fragment. */
"use strict";

/* ================= currencies & rates ================= */

const CURRENCIES = ["JPY","USD","EUR","GBP","AUD","CAD","SGD","HKD","TWD","KRW","CNY","THB","NZD","INR","PHP"];
const SYMBOL = { JPY:"¥", USD:"$", EUR:"€", GBP:"£", AUD:"A$", CAD:"C$", SGD:"S$", HKD:"HK$", TWD:"NT$", KRW:"₩", CNY:"CN¥", THB:"฿", NZD:"NZ$", INR:"₹", PHP:"₱" };

/* fallback: units of X per 1 JPY (approximate, replaced by live rates when online) */
const FALLBACK_RATES = { USD:1/150, EUR:1/163, GBP:1/190, AUD:1/100, CAD:1/110, SGD:1/112, HKD:1/19.2, TWD:1/4.7, KRW:1/0.107, CNY:1/20.8, THB:1/4.3, NZD:1/91, INR:1/1.75, PHP:1/2.6 };

/* frankfurter (ECB) does not carry TWD — silently drops unknown symbols.
   Primary: frankfurter. Secondary fill for the gaps: open.er-api.com. */
const FRANKFURTER_OK = ["USD","EUR","GBP","AUD","CAD","SGD","HKD","KRW","CNY","THB","NZD","INR","PHP"];

let rates = { ...FALLBACK_RATES };
let ratesLive = false;

async function loadRates() {
  const cached = lsGet("sj_rates");
  if (cached && Date.now() - cached.t < 12 * 3600 * 1000) {
    // Cached rates still count as loaded rates: the first paint used the
    // fallback table, so the screen has to be redrawn or every home-currency
    // figure stays wrong until something else triggers a render.
    rates = cached.r; ratesLive = true; updateRateStatus(); render(); return;
  }
  let got = null;
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=JPY&symbols=${FRANKFURTER_OK.join(",")}`);
    if (res.ok) got = { ...(await res.json()).rates };
  } catch (_) {}
  const missing = CURRENCIES.filter(c => c !== "JPY" && !(got && got[c] > 0));
  if (missing.length) {
    try {
      const res2 = await fetch("https://open.er-api.com/v6/latest/JPY");
      if (res2.ok) {
        const alt = (await res2.json()).rates || {};
        got = got || {};
        missing.forEach(c => { if (alt[c] > 0) got[c] = alt[c]; });
      }
    } catch (_) {}
  }
  if (got && Object.keys(got).length) {
    rates = { ...FALLBACK_RATES, ...got };
    ratesLive = true;
    lsSet("sj_rates", { t: Date.now(), r: rates });
  } else if (cached) {
    rates = cached.r; ratesLive = true;
  }
  updateRateStatus();
  render();
}

function updateRateStatus() {
  const el = document.getElementById("rate-status");
  el.textContent = ratesLive
    ? "Exchange rates: live (locked per expense when you add it)."
    : "Offline — using approximate rates until you're back online.";
}

function jpyTo(cur, jpy) { return cur === "JPY" ? jpy : jpy * (rates[cur] || FALLBACK_RATES[cur] || 0); }
function toJpy(cur, amount) { return cur === "JPY" ? amount : amount / (rates[cur] || FALLBACK_RATES[cur] || 1); }

function fmt(cur, v) {
  const zeroDec = cur === "JPY" || cur === "KRW";
  const n = zeroDec ? Math.round(v) : v;
  return SYMBOL[cur] + n.toLocaleString("en-US", zeroDec
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ================= state ================= */

const CATEGORIES = ["Food & drink","Transport","Hotel","Tickets","Shopping","Konbini","Other"];

let trip = null;          // {v,name,members:[{i,n,c}],ex:[...]}
let viewerId = null;      // which member "I am"
let editingId = null;     // expense being edited in sheet
let sheetState = null;    // working copy for the sheet

function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }

function saveTrip() { if (trip) { trip.u = Date.now(); lsSet("sj_trip", trip); } }
function uid() { return Math.random().toString(36).slice(2, 8); }

/* ================= share-link encoding ================= */

function b64urlFromBytes(bytes) {
  let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bytesFromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  return Uint8Array.from(bin, ch => ch.charCodeAt(0));
}

async function encodeTrip(obj) {
  const json = JSON.stringify(obj);
  const raw = new TextEncoder().encode(json);
  if (typeof CompressionStream !== "undefined") {
    const cs = new CompressionStream("deflate-raw");
    const stream = new Blob([raw]).stream().pipeThrough(cs);
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    return "c." + b64urlFromBytes(buf);
  }
  return "p." + b64urlFromBytes(raw);
}

async function decodeTrip(str) {
  const [mode, payload] = [str.slice(0, 2), str.slice(2)];
  const bytes = bytesFromB64url(payload);
  let raw;
  if (mode === "c.") {
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    raw = new Uint8Array(await new Response(stream).arrayBuffer());
  } else {
    raw = bytes;
  }
  return JSON.parse(new TextDecoder().decode(raw));
}

/* ================= balances & settlement ================= */

function computeBalances() {
  const bal = {};
  trip.members.forEach(m => bal[m.i] = 0);
  trip.ex.forEach(e => {
    const share = e.jpy / e.s.length;
    bal[e.p] += e.jpy;
    e.s.forEach(id => bal[id] -= share);
  });
  return bal; // + means "is owed", - means "owes"
}

function computeSettlement(bal) {
  const debtors = [], creditors = [];
  Object.entries(bal).forEach(([id, v]) => {
    if (v < -1) debtors.push({ id, v: -v });
    else if (v > 1) creditors.push({ id, v });
  });
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    out.push({ from: debtors[i].id, to: creditors[j].id, jpy: pay });
    debtors[i].v -= pay; creditors[j].v -= pay;
    if (debtors[i].v < 1) i++;
    if (creditors[j].v < 1) j++;
  }
  return out;
}

/* ================= rendering ================= */

const $ = id => document.getElementById(id);
function member(id) { return trip.members.find(m => m.i === id); }

function archivedTrips() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith("sj_trip_")) continue;
    const t = lsGet(k);
    if (t && t.id && (!trip || t.id !== trip.id)) out.push({ key: k, trip: t });
  }
  return out.sort((a, b) => (b.trip.u || 0) - (a.trip.u || 0));
}

function renderOtherTrips() {
  const card = $("other-trips"), list = $("other-trips-list");
  if (!card || !list) return;
  const items = archivedTrips();
  card.classList.toggle("hidden", items.length === 0);
  if (!items.length) return;
  list.innerHTML = items.map(({ key, trip: t }) => {
    const total = (t.ex || []).reduce((s, e) => s + e.jpy, 0);
    return `<button class="other-trip" type="button" data-key="${esc(key)}">
      <span class="ot-name">${esc(t.name || "Trip")}</span>
      <span class="ot-meta">${t.members.length} people · ${fmt("JPY", total)} · ${(t.ex || []).length} ${(t.ex || []).length === 1 ? "expense" : "expenses"}</span>
    </button>`;
  }).join("");
  list.querySelectorAll(".other-trip").forEach(el => el.onclick = () => {
    const incoming = lsGet(el.dataset.key);
    if (!incoming) return;
    if (trip) lsSet("sj_trip_" + trip.id, trip);
    localStorage.removeItem(el.dataset.key);
    trip = incoming;
    viewerId = lsGet("sj_viewer_" + trip.id);
    saveTrip();
    render();
    toast(`Reopened "${trip.name}"`);
  });
}

function render() {
  if (!trip) {
    $("setup").classList.remove("hidden"); $("main").classList.add("hidden");
    renderOtherTrips();
    return;
  }
  $("setup").classList.add("hidden");
  $("main").classList.remove("hidden");

  $("trip-title").textContent = trip.name || "Japan trip";
  const total = trip.ex.reduce((s, e) => s + e.jpy, 0);
  $("trip-sub").textContent = `${trip.members.length} people · ${fmt("JPY", total)} total`;

  // viewer chips
  const vc = $("viewer-chips"); vc.innerHTML = "";
  trip.members.forEach(m => {
    const b = document.createElement("button");
    b.className = "chip" + (m.i === viewerId ? " on" : "");
    b.textContent = m.n;
    b.onclick = () => { viewerId = m.i; lsSet("sj_viewer_" + trip.id, viewerId); render(); };
    vc.appendChild(b);
  });

  // hero balance
  const bal = computeBalances();
  const hero = $("my-balance");
  if (viewerId && member(viewerId)) {
    const me = member(viewerId);
    const v = bal[viewerId];
    const cls = v > 1 ? "pos" : v < -1 ? "neg" : "";
    const label = v > 1 ? "you are owed" : v < -1 ? "you owe" : "you're settled";
    hero.innerHTML = `
      <div class="who">${esc(me.n)} — ${label}</div>
      <div class="amt ${cls}">${fmt("JPY", Math.abs(v))}</div>
      <div class="conv">${me.c !== "JPY" ? "≈ " + fmt(me.c, jpyTo(me.c, Math.abs(v))) : "&nbsp;"}</div>`;
  } else {
    hero.innerHTML = `<div class="who">Tap your name above to see your balance</div>`;
  }

  // settlement
  const st = $("settlement");
  const flows = computeSettlement(bal);
  if (trip.ex.length === 0) {
    st.innerHTML = `<p class="hint">Add your first expense — hotel, Shinkansen, izakaya…</p>`;
  } else if (flows.length === 0) {
    st.innerHTML = `<p class="all-settled">All settled.</p>`;
  } else {
    st.innerHTML = flows.map(f => {
      const from = member(f.from), to = member(f.to);
      const homeCur = from.c;
      const home = homeCur !== "JPY" ? `<span class="home">≈ ${fmt(homeCur, jpyTo(homeCur, f.jpy))}</span>` : "";
      return `<div class="settle-line" data-from="${f.from}" data-to="${f.to}" data-jpy="${Math.round(f.jpy)}" title="Tap to copy a payment request">
        <div class="flow"><strong>${esc(from.n)}</strong> pays <strong>${esc(to.n)}</strong></div>
        <div class="val"><span class="jpy">${fmt("JPY", f.jpy)}</span>${home}</div>
      </div>`;
    }).join("") + `<p class="hint">Tap a line to copy a payment request you can paste into your group chat.</p>`;
    st.querySelectorAll(".settle-line").forEach(el => el.onclick = async () => {
      const from = member(el.dataset.from), to = member(el.dataset.to);
      const jpy = +el.dataset.jpy;
      const home = from.c !== "JPY" ? ` (about ${fmt(from.c, jpyTo(from.c, jpy))})` : "";
      const msg = `${from.n} pays ${to.n} ${fmt("JPY", jpy)}${home} to settle "${trip.name}" — via splitjapan.com`;
      try { await navigator.clipboard.writeText(msg); toast("Payment request copied"); }
      catch (_) { toast(msg); }
    });
  }

  // share staleness nudge
  const lastShared = lsGet("sj_shared_" + trip.id) || 0;
  const stale = trip.ex.length > 0 && (trip.u || 0) > lastShared;
  $("share-btn").textContent = stale ? "Share latest" : "Share";
  $("share-btn").classList.toggle("attention", stale);

  // expense list
  const list = $("expense-list");
  $("expense-count").textContent = trip.ex.length ? `(${trip.ex.length})` : "";
  list.innerHTML = trip.ex.length === 0 ? `<p class="hint">Nothing yet.</p>` :
    [...trip.ex].reverse().map(e => {
      const payer = member(e.p);
      const splitTxt = e.s.length === trip.members.length ? "everyone" : e.s.map(id => member(id)?.n).join(", ");
      const orig = e.c !== "JPY" ? `<span class="orig">${fmt(e.c, e.a)}</span>` : "";
      const tf = e.tf ? ` <span class="tf-tag">TAX-FREE</span>` : "";
      return `<div class="exp-item" data-id="${e.i}">
        <div class="l">
          <div class="cat">${esc(e.note || e.cat)}${tf}</div>
          <div class="meta">${esc(payer?.n || "?")} paid · split: ${esc(splitTxt)}</div>
        </div>
        <div class="r"><span class="jpy">${fmt("JPY", e.jpy)}</span>${orig}</div>
      </div>`;
    }).join("");
  list.querySelectorAll(".exp-item").forEach(el => el.onclick = () => openSheet(el.dataset.id));

  // tax-free summary
  const tfTotal = trip.ex.filter(e => e.tf).reduce((s, e) => s + e.jpy, 0);
  const tfCard = $("taxfree-summary");
  if (tfTotal > 0) {
    const refund = tfTotal * 10 / 110;
    const afterFee = refund * 0.98;
    tfCard.classList.remove("hidden");
    tfCard.innerHTML = `<h2 class="section-title">Tax-free tracker</h2>
      <p>Tagged purchases: <strong>${fmt("JPY", tfTotal)}</strong></p>
      <p>Estimated refund at the airport: <strong>${fmt("JPY", afterFee)}</strong> <span class="hint">(10% consumption tax minus ~2% handling fee. From Nov 1, 2026 you pay full price in store and claim the refund when you leave Japan.)</span></p>`;
  } else {
    tfCard.classList.add("hidden");
  }
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

/* ================= setup screen ================= */

function memberRow(name = "", cur = "USD") {
  const row = document.createElement("div");
  row.className = "member-row";
  row.innerHTML = `
    <input type="text" placeholder="Name" maxlength="20" value="${esc(name)}">
    <select>${CURRENCIES.map(c => `<option ${c === cur ? "selected" : ""}>${c}</option>`).join("")}</select>
    <button class="remove" type="button" aria-label="Remove">×</button>`;
  row.querySelector(".remove").onclick = () => {
    if ($("member-rows").children.length > 1) row.remove();
  };
  return row;
}

function initSetup() {
  const rows = $("member-rows");
  rows.appendChild(memberRow());
  rows.appendChild(memberRow());
  $("add-member").onclick = () => rows.appendChild(memberRow());
  $("start-trip").onclick = () => {
    const members = [...rows.querySelectorAll(".member-row")].map(r => ({
      i: uid(),
      n: r.querySelector("input").value.trim(),
      c: r.querySelector("select").value,
    })).filter(m => m.n);
    if (members.length < 2) { toast("Add at least 2 people"); return; }
    trip = { v: 1, id: uid(), name: $("trip-name").value.trim() || "Japan trip", members, ex: [], u: Date.now() };
    saveTrip();
    render();
  };
}

/* ================= expense sheet ================= */

function openSheet(expenseId = null) {
  editingId = expenseId;
  const e = expenseId ? trip.ex.find(x => x.i === expenseId) : null;
  sheetState = e ? { cur: e.c, cat: e.cat, payer: e.p, split: [...e.s], tf: !!e.tf }
                 : { cur: "JPY", cat: CATEGORIES[0], payer: viewerId || trip.members[0].i, split: trip.members.map(m => m.i), tf: false };
  $("sheet-title").textContent = e ? "Edit expense" : "Add expense";
  $("amount-input").value = e ? String(e.a) : "";
  $("note-input").value = e ? (e.note || "") : "";
  $("taxfree-check").checked = sheetState.tf;
  $("delete-expense").classList.toggle("hidden", !e);
  $("save-and-another").classList.toggle("hidden", !!e);
  renderSheet();
  $("sheet-backdrop").classList.remove("hidden");
  if (!e) setTimeout(() => $("amount-input").focus(), 60);
}

function renderSheet() {
  $("currency-toggle").textContent = sheetState.cur;
  const amt = parseFloat($("amount-input").value.replace(/,/g, "")) || 0;
  $("amount-hint").textContent = sheetState.cur !== "JPY" && amt > 0
    ? `≈ ${fmt("JPY", toJpy(sheetState.cur, amt))} at today's rate`
    : sheetState.cur === "JPY" && amt > 0 && viewerId && member(viewerId)?.c !== "JPY"
      ? `≈ ${fmt(member(viewerId).c, jpyTo(member(viewerId).c, amt))}`
      : "";

  const cc = $("category-chips"); cc.innerHTML = "";
  CATEGORIES.forEach(cat => {
    const b = document.createElement("button");
    b.className = "chip" + (cat === sheetState.cat ? " on" : "");
    b.textContent = cat; b.type = "button";
    b.onclick = () => { sheetState.cat = cat; renderSheet(); };
    cc.appendChild(b);
  });

  const pc = $("payer-chips"); pc.innerHTML = "";
  trip.members.forEach(m => {
    const b = document.createElement("button");
    b.className = "chip" + (m.i === sheetState.payer ? " on" : "");
    b.textContent = m.n; b.type = "button";
    b.onclick = () => { sheetState.payer = m.i; renderSheet(); };
    pc.appendChild(b);
  });

  const sc = $("split-chips"); sc.innerHTML = "";
  trip.members.forEach(m => {
    const on = sheetState.split.includes(m.i);
    const b = document.createElement("button");
    b.className = "chip" + (on ? " on" : " dim");
    b.textContent = m.n; b.type = "button";
    b.onclick = () => {
      sheetState.split = on ? sheetState.split.filter(x => x !== m.i) : [...sheetState.split, m.i];
      renderSheet();
    };
    sc.appendChild(b);
  });
}

function cycleCurrency() {
  const used = ["JPY", ...new Set(trip.members.map(m => m.c).filter(c => c !== "JPY"))];
  const idx = used.indexOf(sheetState.cur);
  sheetState.cur = used[(idx + 1) % used.length];
  renderSheet();
}

function saveExpense(keepOpen) {
  const amt = parseFloat($("amount-input").value.replace(/,/g, ""));
  if (!amt || amt <= 0 || !isFinite(amt)) { toast("Enter an amount"); return; }
  if (sheetState.split.length === 0) { toast("Pick who shares this"); return; }
  // keep the entry-time rate when editing without changing the money itself
  const prev = editingId ? trip.ex.find(x => x.i === editingId) : null;
  const jpy = (prev && prev.a === amt && prev.c === sheetState.cur)
    ? prev.jpy
    : Math.round(toJpy(sheetState.cur, amt));
  const base = {
    a: amt, c: sheetState.cur, jpy,
    p: sheetState.payer, s: [...sheetState.split],
    cat: sheetState.cat, note: $("note-input").value.trim(),
    tf: $("taxfree-check").checked, t: Date.now(),
  };
  if (editingId) {
    const i = trip.ex.findIndex(x => x.i === editingId);
    trip.ex[i] = { ...trip.ex[i], ...base };
  } else {
    trip.ex.push({ i: uid(), ...base });
  }
  saveTrip();
  if (keepOpen === true && !editingId) {
    // the end-of-day batch entry pattern: keep payer/split/category, clear the rest
    $("amount-input").value = "";
    $("note-input").value = "";
    $("taxfree-check").checked = false;
    renderSheet();
    render();
    $("amount-input").focus();
    toast("Saved — next one");
    return;
  }
  closeSheet();
  render();
}

function closeSheet() { $("sheet-backdrop").classList.add("hidden"); editingId = null; }

/* ================= share ================= */

async function openShare() {
  const enc = await encodeTrip(trip);
  const url = location.origin + location.pathname + "#d=" + enc;
  $("share-url").value = url;
  const box = $("qr-box");
  box.innerHTML = "";
  try {
    if (typeof qrcode === "function") {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
    }
  } catch (_) { box.innerHTML = ""; }
  $("share-backdrop").classList.remove("hidden");
}

async function copyShare() {
  const url = $("share-url").value;
  try {
    if (navigator.share) { await navigator.share({ title: "SplitJapan — " + trip.name, url }); }
    else { await navigator.clipboard.writeText(url); toast("Link copied"); }
  } catch (_) {
    try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch (_) { toast("Copy manually"); }
  }
  lsSet("sj_shared_" + trip.id, trip.u || Date.now());
  render();
}

/* ================= add member mid-trip ================= */

function openMemberSheet() {
  $("new-member-name").value = "";
  const sel = $("new-member-cur");
  sel.innerHTML = CURRENCIES.map(c => `<option ${c === "USD" ? "selected" : ""}>${c}</option>`).join("");
  $("member-backdrop").classList.remove("hidden");
  setTimeout(() => $("new-member-name").focus(), 60);
}

function saveMember() {
  const n = $("new-member-name").value.trim();
  if (!n) { toast("Enter a name"); return; }
  trip.members.push({ i: uid(), n, c: $("new-member-cur").value });
  saveTrip();
  $("member-backdrop").classList.add("hidden");
  render();
  toast(`${n} added`);
}

/* ================= toast ================= */

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

/* ================= boot ================= */

async function boot() {
  initSetup();

  $("add-expense-btn").onclick = () => openSheet();
  $("save-expense").onclick = () => saveExpense(false);
  $("save-and-another").onclick = () => saveExpense(true);
  $("cancel-expense").onclick = closeSheet;
  $("delete-expense").onclick = () => {
    trip.ex = trip.ex.filter(x => x.i !== editingId);
    saveTrip(); closeSheet(); render();
  };
  $("currency-toggle").onclick = cycleCurrency;
  $("amount-input").addEventListener("input", renderSheet);
  $("sheet-backdrop").addEventListener("click", e => { if (e.target.id === "sheet-backdrop") closeSheet(); });

  $("share-btn").onclick = openShare;
  $("copy-share").onclick = copyShare;
  $("add-member-later").onclick = openMemberSheet;
  $("save-member").onclick = saveMember;
  $("cancel-member").onclick = () => $("member-backdrop").classList.add("hidden");
  $("member-backdrop").addEventListener("click", e => { if (e.target.id === "member-backdrop") $("member-backdrop").classList.add("hidden"); });
  $("new-member-name").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveMember(); } });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  $("close-share").onclick = () => $("share-backdrop").classList.add("hidden");
  $("share-backdrop").addEventListener("click", e => { if (e.target.id === "share-backdrop") $("share-backdrop").classList.add("hidden"); });

  $("new-trip").onclick = () => {
    if (confirm("Start a new trip? This one is kept safe — any shared link still opens it, and nothing is deleted.")) {
      if (trip) lsSet("sj_trip_" + trip.id, trip); // archive, never destroy
      trip = null; viewerId = null;
      localStorage.removeItem("sj_trip");
      location.hash = "";
      location.reload();
    }
  };

  $("share-url").addEventListener("click", e => e.target.select());

  // if a share link is opened while the app is already loaded, re-boot to import it
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#d=")) location.reload(); });

  // Enter saves from the sheet's text fields
  [$("amount-input"), $("note-input")].forEach(el =>
    el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveExpense(); } }));

  // import from share link
  const m = location.hash.match(/#d=(.+)/);
  if (m) {
    try {
      const incoming = await decodeTrip(decodeURIComponent(m[1]));
      const existing = lsGet("sj_trip");
      if (existing && existing.id !== incoming.id) {
        // never lose a different trip — archive it, recoverable via its share link or sj_trip_<id>
        lsSet("sj_trip_" + existing.id, existing);
        trip = incoming; saveTrip();
        toast(`Loaded "${incoming.name}" — your trip "${existing.name}" is archived`);
      } else if (!existing || (incoming.u || 0) >= (existing.u || 0)) {
        trip = incoming; saveTrip();
        toast("Trip loaded from link");
      } else {
        trip = existing;
        toast("You have a newer local version");
      }
      history.replaceState(null, "", location.pathname);
    } catch (_) {
      toast("Couldn't read that link");
      trip = lsGet("sj_trip");
    }
  } else {
    trip = lsGet("sj_trip");
  }

  if (trip) viewerId = lsGet("sj_viewer_" + trip.id);
  render();
  loadRates();
}

boot();

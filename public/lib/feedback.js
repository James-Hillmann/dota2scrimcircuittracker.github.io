// Feedback mode: anyone can mark up the site and say what they'd change. Spec:
// docs/superpowers/specs/2026-09-30-feedback-design.md.
//
// The Feedback button in the top bar turns it on. A sidebar holds the tools: Snip (drag a
// box, like the Snipping Tool), Click (pick an element), Draw (freehand pen) and Use site (the
// page works normally, to reach another page). Every mark asks for a note straight away; mark
// + note + a JPEG of the marked area is one item. Submit sends every item as one ticket
// (store.js submitFeedback, 5 per browser per hour). Unsent items live in sessionStorage.
//
// Coordinates are page coordinates (client + scroll), so marks stay put when the page
// scrolls. Nothing here builds anything from a ticket: they're read outside the app.
import { submitFeedback, MAX_FEEDBACK_ITEMS, FEEDBACK_PER_HOUR } from "./store.js";
import { markPackOffer } from "./bonus-offers.js";

// Renders the page's DOM into a canvas (SVG foreignObject). Loaded on first capture only.
const SHOT_LIB = "https://cdn.jsdelivr.net/npm/modern-screenshot@4.7.0/dist/index.mjs";
const SESSION_KEY = "feedback-items";
const NAME_KEY = "feedback-name";
const MAX_SHOT = 690000; // characters of data URL; the rules cap it at 700 000
const MAX_STROKES = 20000; // characters of SVG path; same as the rules
const FOREIGN_IMG = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#4a453d"/></svg>');
const DRAW_PAUSE = 800; // ms after the last stroke before the note opens (so a mark can be several strokes)

const TOOLS = [
  { id: "snip", key: "1", label: "Snip", hint: "Drag a box around it",
    icon: '<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.2"/><path d="M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4"/>' },
  { id: "click", key: "2", label: "Click", hint: "Click the thing",
    icon: '<path d="M6 3l12 7.5-5.2 1.3 3.2 6.2-2.4 1.2-3.2-6.2L6 17z"/>' },
  { id: "draw", key: "3", label: "Draw", hint: "Circle or scribble on it",
    icon: '<path d="M4 20c2-5 4.5-7 7-7s2 3 4.5 3S19 13 20 11"/><path d="M15.5 4.5l4 4L11 17l-5 1 1-5z"/>' },
  { id: "use", key: "4", label: "Use site", hint: "Browse normally to get to another page",
    icon: '<path d="M8 13V5.5a1.5 1.5 0 013 0V12M11 11.5V4a1.5 1.5 0 013 0v7.5M14 11.5v-6a1.5 1.5 0 013 0V14c0 4-2.5 7-6.5 7S5 18.5 4 15l-1-3a1.5 1.5 0 012.8-1L8 14"/>' },
];
const KIND_LABEL = { snip: "Snip", click: "Click", draw: "Drawing" };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pageKey = () => location.pathname + location.search + location.hash;
const themeNow = () => ["light", "grey"].find((t) => document.documentElement.classList.contains(t)) ?? "dark";
const docSize = () => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight });
const round = (a) => ({ x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h) });

// A box around `box` with padding, at least minW × minH, kept on the page.
function around(box, pad, minW, minH) {
  const { w: dw, h: dh } = docSize();
  const w = Math.min(dw, Math.max(box.w + pad * 2, minW));
  const h = Math.min(dh, Math.max(box.h + pad * 2, minH));
  const x = Math.min(Math.max(0, box.x + box.w / 2 - w / 2), dw - w);
  const y = Math.min(Math.max(0, box.y + box.h / 2 - h / 2), dh - h);
  return { x, y, w, h };
}

// A short CSS selector: up to the nearest id, else six levels, with nth-of-type where needed.
function selectorOf(el) {
  const parts = [];
  for (let e = el; e && e !== document.body && e !== document.documentElement && parts.length < 6; e = e.parentElement) {
    if (e.id) { parts.unshift(`#${CSS.escape(e.id)}`); break; }
    let s = e.tagName.toLowerCase();
    const cls = [...e.classList].slice(0, 2);
    if (cls.length) s += "." + cls.map((c) => CSS.escape(c)).join(".");
    const same = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [];
    if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
    parts.unshift(s);
  }
  return parts.join(" > ").slice(0, 400);
}
const textOf = (el) => (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("alt") || "")
  .replace(/\s+/g, " ").trim().slice(0, 200);

const pathOf = (strokes) => {
  let d = "";
  for (const s of strokes) {
    const seg = s.map((p, i) => `${i ? "L" : "M"}${Math.round(p.x)} ${Math.round(p.y)}`).join("");
    if (d.length + seg.length > MAX_STROKES) break;
    d += seg;
  }
  return d;
};
const boundsOf = (strokes) => {
  const pts = strokes.flat();
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// ---------- screenshot ----------
let shotLib = null;
const SHOT_WAIT = 8000; // past this the note is kept without a picture
// JPEG of `area` (page coordinates) with the pending mark drawn in, or null if it fails or is slow.
function capture(area, mark) {
  let timer;
  const late = new Promise((r) => { timer = setTimeout(() => { console.warn("feedback: screenshot took too long, skipped"); r(null); }, SHOT_WAIT); });
  return Promise.race([shoot(area, mark), late]).finally(() => clearTimeout(timer));
}
async function shoot(area, mark) {
  // Copying every element is what takes the time (~11,000 with the collection open: 30 s), so
  // hidden ones are left out and one wholly outside the area is copied empty at its measured
  // size: nothing in view moves.
  const hollow = new WeakSet(), marked = [];
  const view = { l: area.x - scrollX, t: area.y - scrollY };
  const outside = (r) => r.width > 0 && r.height > 0 &&
    (r.right < view.l || r.left > view.l + area.w || r.bottom < view.t || r.top > view.t + area.h);
  try {
    shotLib ??= import(SHOT_LIB);
    const { domToCanvas } = await shotLib;
    const scale = Math.min(window.devicePixelRatio || 1, 2, 1280 / area.w);
    const page = await domToCanvas(document.documentElement, {
      width: area.w, height: area.h, scale,
      // Lazy images below the fold never finish loading; don't wait the default 30 s for them.
      timeout: 1500,
      // Hero art comes from Steam's CDN, which only allows dota2.com to read it, so any
      // cross-origin image is drawn as a grey box instead of failing (and logging) one by one.
      fetchFn: async (url) => (new URL(url, location.href).origin === location.origin ? false : FOREIGN_IMG),
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      filter: (n) => {
        if (n instanceof Element && n.classList.contains("fb")) return false;
        // Under a lifted dialog the page is dimmed almost black: leave it out.
        if (lifted && n.parentNode === document.body && n !== lifted) return false;
        if (hollow.has(n.parentNode)) return false;
        if (n instanceof HTMLElement && n.parentNode !== document.documentElement) {
          // Not drawn at all (the hidden tabs of a profile are thousands of elements).
          if (n.tagName !== "STYLE" && !n.getClientRects().length && getComputedStyle(n).display === "none") return false;
          const r = n.getBoundingClientRect();
          if (outside(r)) {
            hollow.add(n);
            n.dataset.fbHollow = `${r.width} ${r.height}`; // read back by the copy below
            marked.push(n);
          }
        }
        return true;
      },
      onCloneEachNode: (c) => {
        if (!c.dataset?.fbHollow) return;
        const [w, h] = c.dataset.fbHollow.split(" ");
        delete c.dataset.fbHollow;
        Object.assign(c.style, { boxSizing: "border-box", width: `${w}px`, height: `${h}px`, minWidth: "0", minHeight: "0", maxWidth: "none", maxHeight: "none" });
      },
      style: { transform: `translate(${-area.x}px, ${-area.y}px)`, transformOrigin: "0 0" },
    });
    const ctx = page.getContext("2d");
    ctx.save();
    ctx.scale(page.width / area.w, page.height / area.h);
    ctx.translate(-area.x, -area.y);
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#e8b64c";
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (mark.box) ctx.strokeRect(mark.box.x - 2, mark.box.y - 2, mark.box.w + 4, mark.box.h + 4);
    for (const s of mark.strokes ?? []) {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();
    return jpegUnder(page);
  } catch (e) {
    console.warn("feedback: screenshot failed", e);
    return null;
  } finally {
    for (const n of marked) delete n.dataset.fbHollow;
  }
}
// Lower the quality, then the size, until the data URL fits the rules' cap.
function jpegUnder(canvas) {
  for (let c = canvas; c.width > 40; ) {
    for (const q of [0.85, 0.72, 0.6, 0.45]) {
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= MAX_SHOT) return url;
    }
    const smaller = document.createElement("canvas");
    smaller.width = Math.round(c.width * 0.7); smaller.height = Math.round(c.height * 0.7);
    smaller.getContext("2d").drawImage(c, 0, 0, smaller.width, smaller.height);
    c = smaller;
  }
  return null;
}

// ---------- state ----------
let items = [];
try { items = JSON.parse(sessionStorage.getItem(SESSION_KEY)) ?? []; } catch { items = []; }
const save = () => {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(items)); }
  catch {
    // Over the storage quota: keep the notes, drop the pictures (they stay in memory).
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(items.map((it) => ({ ...it, shot: null })))); } catch { /* not kept */ }
  }
};

let on = false;
let tool = "snip";
let pending = null; // { kind, area, box?, target?, strokes? } — the mark waiting for its note
let editing = null; // the index of the saved note being edited in the list
let drag = null;
let drawTimer = 0;
let seenPage = pageKey();
let watch = 0;
let root, catcher, hoverBox, snipBox, ink, pins, noteBox, listBox, modal, bar, openBtn;
let lifted = null; // a modal dialog reopened as non-modal for feedback mode

// ---------- DOM ----------
function build() {
  root = document.createElement("div");
  root.className = "fb";
  root.innerHTML = `
    <div class="fb-banner" role="status">Feedback mode: pick a tool, mark the page, say what to change. <kbd>Esc</kbd> to leave.</div>
    <div class="fb-catch"></div>
    <div class="fb-layer" aria-hidden="true">
      <svg class="fb-ink"></svg>
      <div class="fb-pins"></div>
      <div class="fb-hover" hidden></div>
      <div class="fb-snip" hidden><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div>
    </div>
    <aside class="fb-bar" role="toolbar" aria-label="Feedback tools" aria-orientation="vertical">
      ${TOOLS.map((t) => `<button type="button" class="fb-tool" data-tool="${t.id}" title="${t.label}: ${t.hint} (${t.key})" aria-pressed="false">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg>
        <span>${t.label}</span></button>`).join("")}
      <hr>
      <button type="button" class="fb-tool fb-list-btn" title="Your notes so far"><b class="fb-count">0</b><span>Notes</span></button>
      <button type="button" class="fb-send" disabled>Submit</button>
      <button type="button" class="fb-exit" title="Leave feedback mode (Esc). Unsent notes are kept.">Exit</button>
    </aside>
    <form class="fb-note" hidden>
      <div class="fb-note-head"></div>
      <textarea maxlength="1000" rows="3" placeholder="What should change here?" aria-label="What should change here?"></textarea>
      <div class="fb-note-foot">
        <span class="fb-note-tip" title="Shift+Enter for a new line">Enter to add</span>
        <button type="button" class="fb-discard">Discard</button>
        <button type="submit" class="fb-add">Add note</button>
      </div>
    </form>
    <div class="fb-list" hidden role="dialog" aria-label="Your notes"></div>
    <div class="fb-modal" hidden role="dialog" aria-modal="true" aria-labelledby="fb-modal-title"><form class="fb-card"></form></div>`;
  document.body.append(root);
  catcher = root.querySelector(".fb-catch");
  hoverBox = root.querySelector(".fb-hover");
  snipBox = root.querySelector(".fb-snip");
  ink = root.querySelector(".fb-ink");
  pins = root.querySelector(".fb-pins");
  noteBox = root.querySelector(".fb-note");
  listBox = root.querySelector(".fb-list");
  modal = root.querySelector(".fb-modal");
  bar = root.querySelector(".fb-bar");

  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tool) setTool(b.dataset.tool);
    else if (b.classList.contains("fb-list-btn")) toggleList();
    else if (b.classList.contains("fb-send")) openSubmit();
    else if (b.classList.contains("fb-exit")) setOn(false);
  });
  catcher.addEventListener("pointerdown", onDown);
  catcher.addEventListener("pointermove", onMove);
  catcher.addEventListener("pointerup", onUp);
  catcher.addEventListener("pointerleave", () => { if (tool === "click") hoverBox.hidden = true; });
  snipBox.addEventListener("pointerdown", onSnipGrab);
  snipBox.addEventListener("pointermove", onMove);
  snipBox.addEventListener("pointerup", onUp);

  noteBox.addEventListener("submit", (e) => { e.preventDefault(); addNote(); });
  noteBox.querySelector(".fb-discard").onclick = () => discard();
  const ta = noteBox.querySelector("textarea");
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); }
  });
  ta.addEventListener("input", () => { noteBox.querySelector(".fb-add").disabled = !ta.value.trim(); });

  listBox.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) { items.splice(Number(rm.dataset.remove), 1); editing = null; save(); refresh(); renderList(); return; }
    const ed = e.target.closest("[data-edit]");
    if (ed) { editing = Number(ed.dataset.edit); renderList(); return; }
    if (e.target.closest("[data-save]")) saveEdit();
    else if (e.target.closest("[data-cancel]")) { editing = null; renderList(); }
  });
  listBox.addEventListener("keydown", (e) => {
    if (e.target.classList.contains("fb-edit") && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
  });
  listBox.addEventListener("input", (e) => {
    if (e.target.classList.contains("fb-edit")) listBox.querySelector("[data-save]").disabled = !e.target.value.trim();
  });
  window.addEventListener("scroll", placeNote, { passive: true });
  window.addEventListener("resize", () => { placeNote(); drawPins(); });
}

// ---------- mode ----------
function setOn(v) {
  if (v === on) return;
  on = v;
  if (on && !root) build();
  if (!root) return;
  root.hidden = !on;
  document.documentElement.classList.toggle("fb-on", on);
  liftDialog(on);
  openBtn?.setAttribute("aria-pressed", String(on));
  clearInterval(watch);
  if (on) {
    seenPage = pageKey();
    // The app changes pages with pushState too (no event): check now and then.
    watch = setInterval(() => { if (pageKey() !== seenPage) { seenPage = pageKey(); discard(); drawPins(); } }, 400);
    setTool(tool);
    refresh();
  } else {
    discard();
    listBox.hidden = true;
    modal.hidden = true;
  }
}

// A modal dialog (the collection) makes the rest of the page inert, the feedback tools included.
// While feedback mode is on it's reopened as a non-modal one under the tools, then put back.
// Its close listener has to ignore these swaps (it's open again when the event arrives).
function liftDialog(up) {
  if (up) {
    const d = document.querySelector("dialog:modal");
    if (!d) return;
    d.close(); d.show(); d.classList.add("fb-lifted");
    lifted = d;
  } else if (lifted) {
    const d = lifted;
    lifted = null;
    d.classList.remove("fb-lifted");
    if (d.isConnected && d.open) { d.close(); d.showModal(); }
  }
}

function setTool(t) {
  if (items.length >= MAX_FEEDBACK_ITEMS && t !== "use") t = "use";
  if (t !== tool) discard();
  tool = t;
  root.dataset.tool = t;
  for (const b of bar.querySelectorAll("[data-tool]")) b.setAttribute("aria-pressed", String(b.dataset.tool === t));
  hoverBox.hidden = true;
}

// Sidebar count, Submit state, the top-bar badge and this page's pins.
function refresh() {
  const n = items.length;
  if (root) {
    root.querySelector(".fb-count").textContent = n;
    root.querySelector(".fb-send").disabled = !n;
    const full = n >= MAX_FEEDBACK_ITEMS;
    for (const b of bar.querySelectorAll("[data-tool]")) if (b.dataset.tool !== "use") b.disabled = full;
    if (full && tool !== "use") setTool("use");
    root.querySelector(".fb-banner").textContent = full
      ? `That's the most one ticket can hold (${MAX_FEEDBACK_ITEMS}). Submit it, then start another.`
      : "Feedback mode: pick a tool, mark the page, say what to change. Esc to leave.";
    drawPins();
  }
  if (openBtn) {
    const badge = openBtn.querySelector(".fb-badge");
    badge.textContent = n;
    badge.hidden = !n;
  }
}

// Marks already added on this page: a numbered pin on the marked thing (the snip, the clicked
// element or the drawing), an outline for snips and clicks, the drawing itself.
function drawPins() {
  if (!root) return;
  const here = items.map((it, i) => ({ it, i })).filter(({ it }) => it.key === pageKey());
  pins.innerHTML = here.map(({ it, i }) => {
    const b = it.box ?? it.area;
    return `${it.kind === "snip" || it.kind === "click" ? `<div class="fb-done" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"></div>` : ""}
      <b class="fb-pin" style="left:${Math.max(12, b.x)}px;top:${Math.max(12, b.y)}px" title="${esc(it.note)}">${i + 1}</b>`;
  }).join("");
  // The layer is clipped to the page, so marks saved at another screen size can't widen it.
  const layer = pins.parentElement;
  Object.assign(layer.style, { width: "0px", height: "0px" });
  const { w, h } = docSize();
  Object.assign(layer.style, { width: `${w}px`, height: `${h}px` });
  ink.setAttribute("width", w); ink.setAttribute("height", h);
  ink.innerHTML = here.filter(({ it }) => it.strokes).map(({ it }) => `<path class="fb-old" d="${esc(it.strokes)}"/>`).join("")
    + (pending?.strokes ? `<path d="${esc(pathOf(pending.strokes))}"/>` : "")
    + (drag?.kind === "draw" ? `<path d="${esc(pathOf([drag.points]))}"/>` : "");
}

// ---------- tools ----------
const at = (e) => ({ x: e.clientX + scrollX, y: e.clientY + scrollY });
// The page element under the pointer, looking through feedback mode's own layers.
const elementAt = (e) => document.elementsFromPoint(e.clientX, e.clientY).find((el) => !el.closest(".fb") && el !== document.documentElement && el !== document.body);

function onDown(e) {
  if (e.button !== 0) return;
  if (tool === "snip") {
    discard();
    const p = at(e);
    drag = { kind: "snip", mode: "new", x0: p.x, y0: p.y };
    catcher.setPointerCapture(e.pointerId);
    showSnip({ x: p.x, y: p.y, w: 0, h: 0 });
  } else if (tool === "draw") {
    clearTimeout(drawTimer);
    drag = { kind: "draw", points: [at(e)] };
    catcher.setPointerCapture(e.pointerId);
  } else if (tool === "click") {
    const el = elementAt(e);
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const box = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    pending = { kind: "click", box, area: around(box, 32, 360, 200), target: { sel: selectorOf(el), text: textOf(el) } };
    showHover(box);
    openNote();
  }
}

function onMove(e) {
  if (tool === "click" && !pending) {
    const el = elementAt(e);
    if (!el) { hoverBox.hidden = true; return; }
    const r = el.getBoundingClientRect();
    showHover({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    return;
  }
  if (!drag) return;
  const p = at(e);
  if (drag.kind === "draw") {
    const last = drag.points.at(-1);
    if (Math.hypot(p.x - last.x, p.y - last.y) >= 3) { drag.points.push(p); drawPins(); }
  } else if (drag.kind === "snip") {
    if (drag.mode === "new") showSnip(norm(drag.x0, drag.y0, p.x, p.y));
    else if (drag.mode === "move") {
      const { w, h } = docSize();
      const a = drag.start;
      showSnip({ ...a, x: clamp(a.x + p.x - drag.p0.x, 0, w - a.w), y: clamp(a.y + p.y - drag.p0.y, 0, h - a.h) });
    } else {
      // Resize from a corner: the opposite corner stays.
      const a = drag.start;
      const fx = drag.mode.includes("w") ? a.x + a.w : a.x, fy = drag.mode.includes("n") ? a.y + a.h : a.y;
      showSnip(norm(fx, fy, p.x, p.y));
    }
    if (pending) { pending.area = snipArea(); placeNote(); }
  }
}

function onUp() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.kind === "snip") {
    const a = snipArea();
    if (a.w < 12 || a.h < 12) { discard(); return; }
    pending = { kind: "snip", area: a };
    snipBox.classList.add("set");
    if (noteBox.hidden) openNote(); else placeNote();
  } else if (d.kind === "draw") {
    if (d.points.length < 2) { drawPins(); return; }
    // Strokes close together are one mark: the note opens after a short pause, and strokes
    // drawn while it's open join the same mark.
    if (pending?.kind === "draw") pending.strokes.push(d.points);
    else pending = { kind: "draw", strokes: [d.points] };
    pending.area = around(boundsOf(pending.strokes), 32, 240, 160);
    drawPins();
    clearTimeout(drawTimer);
    if (noteBox.hidden) drawTimer = setTimeout(openNote, DRAW_PAUSE); else placeNote();
  }
}

function onSnipGrab(e) {
  if (e.button !== 0 || !pending) return;
  e.stopPropagation();
  const h = e.target.dataset.h;
  drag = { kind: "snip", mode: h ?? "move", start: snipArea(), p0: at(e) };
  snipBox.setPointerCapture(e.pointerId);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const norm = (x0, y0, x1, y1) => {
  const { w, h } = docSize();
  x1 = clamp(x1, 0, w); y1 = clamp(y1, 0, h);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
};
function showSnip(a) {
  snipBox.hidden = false;
  root.classList.add("snipping");
  Object.assign(snipBox.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` });
  snipBox.dataset.area = JSON.stringify(a);
}
const snipArea = () => JSON.parse(snipBox.dataset.area || '{"x":0,"y":0,"w":0,"h":0}');
function showHover(b) {
  hoverBox.hidden = false;
  Object.assign(hoverBox.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
}

// ---------- note ----------
function openNote() {
  if (!pending) return;
  const head = noteBox.querySelector(".fb-note-head");
  const what = pending.kind === "click" && pending.target.text ? `: “${esc(pending.target.text.slice(0, 60))}”` : "";
  head.innerHTML = `<b>Note ${items.length + 1}</b> · ${KIND_LABEL[pending.kind]}${what}`;
  const ta = noteBox.querySelector("textarea");
  ta.value = "";
  noteBox.querySelector(".fb-add").disabled = true;
  noteBox.hidden = false;
  noteBox.classList.remove("busy");
  placeNote();
  ta.focus({ preventScroll: true });
}

// Next to the marked area: below it if there's room, else above, else inside; kept on screen.
function placeNote() {
  if (!noteBox || noteBox.hidden || !pending) return;
  const a = pending.area;
  const W = noteBox.offsetWidth, H = noteBox.offsetHeight, vw = innerWidth, vh = innerHeight;
  const left = clamp(a.x - scrollX, 76, vw - W - 12);
  const below = a.y + a.h - scrollY + 10, above = a.y - scrollY - H - 10;
  const top = below + H < vh - 8 ? below : above > 8 ? above : clamp(below, 8, vh - H - 8);
  Object.assign(noteBox.style, { left: `${left}px`, top: `${top}px` });
}

async function addNote() {
  const ta = noteBox.querySelector("textarea");
  const note = ta.value.trim();
  if (!pending || !note || noteBox.classList.contains("busy")) return;
  noteBox.classList.add("busy");
  noteBox.querySelector(".fb-add").textContent = "Saving…";
  const p = pending;
  const area = round(p.area);
  const shot = await capture(area, p);
  // key and box stay in this browser (for the pins); store.js sends only the ticket's fields.
  items.push({
    key: pageKey(), box: round(p.box ?? (p.strokes ? boundsOf(p.strokes) : area)), kind: p.kind, page: location.href.slice(0, 400), league: document.body.dataset.league ?? "",
    theme: themeNow(), viewport: { w: innerWidth, h: innerHeight }, note: note.slice(0, 1000), area,
    target: p.target ?? null, strokes: p.strokes ? pathOf(p.strokes) : null, shot,
  });
  save();
  noteBox.querySelector(".fb-add").textContent = "Add note";
  discard();
  refresh();
}

// Drop the pending mark and close the note.
function discard() {
  clearTimeout(drawTimer);
  pending = null;
  drag = null;
  if (!root) return;
  noteBox.hidden = true;
  noteBox.classList.remove("busy");
  snipBox.hidden = true;
  root.classList.remove("snipping");
  snipBox.classList.remove("set");
  hoverBox.hidden = true;
  drawPins();
}

// ---------- list ----------
function toggleList() {
  listBox.hidden = !listBox.hidden;
  if (!listBox.hidden) renderList();
}
function renderList() {
  if (editing != null && !items[editing]) editing = null;
  listBox.innerHTML = `<div class="fb-list-head"><b>Your notes</b><span>${items.length} of ${MAX_FEEDBACK_ITEMS}</span></div>`
    + (items.length ? `<ol>${items.map((it, i) => `<li>
        ${it.shot ? `<img src="${it.shot}" alt="">` : `<span class="fb-noshot">${KIND_LABEL[it.kind]}</span>`}
        <div><b>${i + 1}. ${KIND_LABEL[it.kind]}</b> <small>${esc(new URL(it.page).pathname + new URL(it.page).search)}</small>
          ${i === editing
            ? `<textarea class="fb-edit" maxlength="1000" rows="3" aria-label="Edit note ${i + 1}">${esc(it.note)}</textarea>
              <div class="fb-edit-row"><button type="button" class="fb-edit-save" data-save>Save</button><button type="button" class="fb-edit-cancel" data-cancel>Cancel</button></div>`
            : `<p>${esc(it.note)}</p>`}</div>
        <div class="fb-li-btns">${i === editing ? "" : `<button type="button" data-edit="${i}" title="Edit this note" aria-label="Edit note ${i + 1}">✎</button>`}
          <button type="button" data-remove="${i}" title="Remove this note" aria-label="Remove note ${i + 1}">×</button></div></li>`).join("")}</ol>`
      : `<p class="fb-empty">Nothing yet. Pick a tool on the left and mark something.</p>`);
  const ta = listBox.querySelector(".fb-edit");
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
// Keeps the edited note's text (an empty note isn't saved; remove it with × instead).
function saveEdit() {
  const ta = listBox.querySelector(".fb-edit");
  if (editing == null || !ta) return;
  const note = ta.value.trim();
  if (!note) return;
  items[editing] = { ...items[editing], note };
  editing = null;
  save(); refresh(); renderList();
}

// ---------- submit ----------
function openSubmit() {
  if (!items.length) return;
  discard();
  listBox.hidden = true;
  const pages = new Set(items.map((it) => it.key)).size;
  let name = "";
  try { name = localStorage.getItem(NAME_KEY) ?? ""; } catch { /* storage blocked */ }
  const card = modal.querySelector(".fb-card");
  card.innerHTML = `
    <h3 id="fb-modal-title">Send your feedback</h3>
    <p>${items.length} note${items.length === 1 ? "" : "s"} on ${pages} page${pages === 1 ? "" : "s"}, sent as one ticket.</p>
    <label>Your name <input name="name" maxlength="40" required autocomplete="nickname" value="${esc(name)}"></label>
    <p class="fb-msg" role="alert"></p>
    <div class="fb-card-foot"><button type="button" class="fb-cancel">Back</button><button type="submit" class="fb-go">Submit ticket</button></div>`;
  modal.hidden = false;
  card.querySelector("input").focus();
  card.querySelector(".fb-cancel").onclick = () => { modal.hidden = true; };
  card.onsubmit = async (e) => {
    e.preventDefault();
    const nm = card.querySelector("input").value.trim();
    if (!nm) return;
    try { localStorage.setItem(NAME_KEY, nm); } catch { /* not remembered */ }
    const go = card.querySelector(".fb-go"), msg = card.querySelector(".fb-msg");
    go.disabled = true; go.textContent = "Sending…"; msg.textContent = "";
    try {
      const res = await submitFeedback(nm, items);
      if (res.retryAt) {
        msg.textContent = `You've sent ${FEEDBACK_PER_HOUR} tickets in the last hour. Try again after ${res.retryAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Your notes are kept.`;
        go.disabled = false; go.textContent = "Submit ticket";
        return;
      }
      items = [];
      save();
      refresh();
      markPackOffer("feedback");
      card.innerHTML = `<h3 id="fb-modal-title">Thanks, ${esc(nm)}</h3>
        <p>Your ticket is <b class="fb-id">${esc(res.id)}</b>. Fav reads every one.</p>
        <div class="fb-card-foot"><button type="submit" class="fb-go">Done</button></div>`;
      card.onsubmit = (ev) => { ev.preventDefault(); modal.hidden = true; setOn(false); };
      card.querySelector(".fb-go").focus();
    } catch (err) {
      console.warn("feedback: submit failed", err);
      msg.textContent = err?.code === "permission-denied"
        // The limit is checked before sending (retryAt above), so a refusal here is something else.
        ? "The server refused it. Try again in a minute; if it keeps happening, tell Fav. Your notes are kept."
        : "Couldn't send it. Check your connection and try again. Your notes are kept.";
      go.disabled = false; go.textContent = "Submit ticket";
    }
  };
}

// ---------- keys ----------
function onKey(e) {
  if (!on) return;
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
  if (e.key === "Escape") {
    e.stopImmediatePropagation();
    e.preventDefault(); // or a dialog just put back to modal (liftDialog) takes it as a close
    if (!modal.hidden) modal.hidden = true;
    else if (pending || !noteBox.hidden) discard();
    else if (editing != null) { editing = null; renderList(); }
    else if (!listBox.hidden) listBox.hidden = true;
    else setOn(false);
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = TOOLS.find((x) => x.key === e.key);
  if (t) { e.preventDefault(); e.stopImmediatePropagation(); setTool(t.id); }
}

// Feedback mode from inside a modal (the collection's own Feedback button).
export function startFeedback() { setOn(true); }

// Any other modal dialog (a full-size card, the tier breakdown, an image zoom) blocks the top-bar
// button, so each one gets its own Feedback button in its corner when it opens.
function addDialogButtons() {
  new MutationObserver(() => {
    for (const d of document.querySelectorAll("dialog[open]")) {
      if (!d.matches(":modal") || d.querySelector("[data-feedback]")) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fb-dialog-btn";
      b.dataset.feedback = "";
      b.title = "Suggest a change: mark up what's on screen and say what you'd change";
      b.textContent = "Feedback";
      b.onclick = (e) => { e.stopPropagation(); setOn(true); };
      d.append(b);
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
}

export function initFeedback() {
  openBtn = document.getElementById("fb-open");
  if (!openBtn) return;
  openBtn.onclick = () => setOn(!on);
  document.addEventListener("keydown", onKey, true);
  addDialogButtons();
  refresh();
  // Local server only: replay a ticket (?fbreview=FB-XXXXXX, files from scripts/feedback.cjs show).
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) import("./feedback-review.js").then((m) => m.initReview()).catch(() => {});
}

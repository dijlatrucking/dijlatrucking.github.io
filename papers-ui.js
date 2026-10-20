// Dijla Ops: how papers look and open. Paper tiles with a preview, a full-screen viewer (swipe, zoom,
// share, download, delete) and the "What is this?" sheet after picking photos. Used by the office app
// (index.html) and the driver app (driver/). Each page tells it how to load, delete and label papers: PUI.setup({...}).
(() => {
  const H = { data: null, remove: null, saveThumb: null, nameOf: e => e, toast: m => alert(m) };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const day = d => new Date(d + "T12:00:00");
  const niceDate = d => d ? day(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const niceFull = d => d ? day(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const ymd = x => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  const daysTo = d => Math.round((day(d) - day(ymd(new Date()))) / 864e5);
  const fileSafe = t => String(t).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const b64Bytes = data => { const bin = atob(data.slice(data.indexOf(",") + 1)), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };
  const toast = m => H.toast(m);
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", PDFJS_W = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  let pdfP = null;
  const pdfjs = () => pdfP || (pdfP = (window.pdfjsLib ? Promise.resolve() : new Promise((ok, bad) => { const el = document.createElement("script"); el.src = PDFJS; el.onload = ok; el.onerror = () => { pdfP = null; bad(new Error("Couldn't load the PDF viewer. Check your connection.")); }; document.head.appendChild(el); }))
    .then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_W; return window.pdfjsLib; }));
  const locLink = loc => !loc || typeof loc.lat !== "number" ? "" : `<a href="https://www.google.com/maps?q=${loc.lat},${loc.lng}" target="_blank" rel="noopener">📍 ${esc(loc.place || loc.lat.toFixed(3) + ", " + loc.lng.toFixed(3))}</a>`;

  // ---- styles + the viewer and sheet (one copy per page)
  const style = document.createElement("style"); style.textContent = `.ptiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px} .ptile{position:relative;display:flex;flex-direction:column;text-align:left;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden;cursor:pointer;color:var(--text);font:inherit} .ptile .pv{position:relative;aspect-ratio:4/3;background:#e9edf3 center/cover no-repeat;display:grid;place-items:center;border-bottom:1px solid var(--line)} .ptile .pv svg{width:34px;height:34px;color:#8a94a6} .ptile .pv .pdft{position:absolute;right:6px;bottom:6px;background:rgba(19,26,38,.78);color:#fff;font:700 10px/1 var(--body);letter-spacing:.06em;padding:4px 5px;border-radius:4px} .ptile .pl{padding:8px 10px 9px;display:grid;gap:2px;min-width:0} .ptile .pl b{font-size:13.5px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere} .ptile .pl span{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .ptile .st{position:absolute;left:6px;top:6px;font:700 10.5px/1 var(--body);letter-spacing:.04em;padding:5px 7px;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(15,42,92,.18)} .st.ok{color:var(--good)} .st.soon{color:#9a5b00;background:#fff4e0} .st.late{color:#fff;background:var(--bad)} .st.none{color:var(--muted)} .ptile.add,.ptile.ghost{border-style:dashed;border-width:1.5px;background:transparent;justify-content:center;align-items:center;min-height:100%;text-align:center;color:var(--acc)} .ptile.add .pv,.ptile.ghost .pv{background:transparent;border:0;aspect-ratio:auto;padding:18px 8px 4px} .ptile.add .pl,.ptile.ghost .pl{text-align:center;padding-top:0} .ptile.ghost{color:var(--muted)} .ptile.ghost b{font-weight:600} .ptile input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer} .ptile:focus-within,.ptile:focus-visible{outline:2px solid var(--blue);outline-offset:2px} .ptile.busy{opacity:.55;pointer-events:none} .docview{position:fixed;inset:0;z-index:160;background:#0d1118;color:#fff;display:flex;flex-direction:column} .dv-top{display:flex;align-items:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) 12px 10px} .dv-top .t{flex:1;min-width:0} .dv-top .t b{display:block;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .dv-top .t span{font-size:12.5px;color:#aeb6c4} .dv-top button,.dv-nav{background:rgba(255,255,255,.1);border:0;color:#fff;border-radius:999px;min-width:40px;height:40px;padding:0 12px;font-size:16px} .dv-track{flex:1;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior:contain} .dv-track::-webkit-scrollbar{display:none} .dv-slide{flex:0 0 100%;scroll-snap-align:center;overflow:auto;display:flex;flex-direction:column;align-items:center;justify-content:safe center;gap:10px;padding:8px 10px} .dv-slide img{max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;touch-action:pan-x pan-y pinch-zoom} .dv-slide.zoom{justify-content:flex-start;align-items:flex-start} .dv-slide.zoom img{max-width:none;max-height:none;width:240%} .dv-slide canvas{width:100%;max-width:820px;background:#fff;border-radius:4px} .dv-slide .msg{color:#aeb6c4;text-align:center;padding:30px 16px;max-width:360px} .dv-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:2;width:44px;height:44px;padding:0;font-size:22px} .dv-nav.prev{left:10px} .dv-nav.next{right:10px} @media (hover:none){.dv-nav{display:none}} .dv-bar{display:flex;gap:8px;padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(255,255,255,.08)} .dv-bar button{flex:1;background:rgba(255,255,255,.1);border:0;color:#fff;padding:13px 8px;border-radius:10px;font-weight:600;font-size:15px} .dv-bar button.danger{color:#ff9a92} .dv-bar button.danger.sure{background:var(--bad);color:#fff} .dv-info{font-size:12.5px;color:#aeb6c4;text-align:center;padding:0 12px 4px;min-height:16px} .dv-info a{color:#9cc0ff} .sheet-bg{position:fixed;inset:0;z-index:170;background:rgba(6,14,32,.5);display:flex;align-items:flex-end;justify-content:center} .sheet2{background:var(--panel);width:100%;max-width:520px;border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));display:grid;gap:12px;max-height:92vh;overflow-y:auto;box-shadow:0 -10px 40px rgba(0,0,0,.25)} @media (min-width:700px){.sheet-bg{align-items:center}.sheet2{border-radius:18px}} .sheet2 h3{margin:0;font-size:18px} .sheet2 .thumbs{display:flex;gap:8px;overflow-x:auto} .sheet2 .thumbs div{flex:none;width:64px;height:64px;border-radius:8px;background:#e9edf3 center/cover;display:grid;place-items:center;font:700 11px var(--body);color:var(--muted);border:1px solid var(--line)} .kchips{display:flex;flex-wrap:wrap;gap:8px} .kchips button{border-radius:999px;padding:9px 14px;font-size:14px;background:var(--panel2)} .kchips button[aria-pressed=true]{background:var(--acc);border-color:var(--acc);color:#fff} .datequick{display:flex;gap:6px;flex-wrap:wrap} .datequick button{padding:6px 10px;font-size:12.5px;border-radius:999px}`; document.head.appendChild(style);
  const box = document.createElement("div");
  box.innerHTML = `<div class="docview" id="docView" hidden role="dialog" aria-modal="true" aria-labelledby="dvTitle">
  <div class="dv-top"><button type="button" id="dvClose" aria-label="Close">✕</button><div class="t"><b id="dvTitle">Paper</b><span id="dvSub"></span></div><span id="dvCount" style="font-size:13px;color:#aeb6c4"></span></div>
  <div style="position:relative;flex:1;display:flex;min-height:0"><button type="button" class="dv-nav prev" id="dvPrev" aria-label="Previous">‹</button><div class="dv-track" id="dvTrack"></div><button type="button" class="dv-nav next" id="dvNext" aria-label="Next">›</button></div>
  <div class="dv-info" id="dvInfo"></div>
  <div class="dv-bar"><button type="button" id="dvShare">Share</button><button type="button" id="dvSave">Download</button><button type="button" class="danger" id="dvDel" hidden>Delete</button></div>
</div>
<div class="sheet-bg" id="addSheet" hidden role="dialog" aria-modal="true" aria-labelledby="asTitle">
  <div class="sheet2">
    <h3 id="asTitle">What is this?</h3>
    <div class="thumbs" id="asThumbs"></div>
    <div class="kchips" id="asKinds" role="group" aria-label="Kind of paper"></div>
    <div id="asExpWrap" class="stack" style="gap:6px"><label>Expires<input type="date" id="asExp"></label><div class="datequick" id="asQuick"></div></div>
    <p class="meta" id="asMsg" style="margin:0;color:var(--bad)"></p>
    <div class="btns" style="display:flex;gap:8px"><button type="button" id="asCancel" style="flex:1">Cancel</button><button type="button" class="primary" id="asSave" style="flex:2">Save</button></div>
  </div>
</div>`;
  while (box.firstChild) document.body.appendChild(box.firstChild);
  const unlock = () => { if (!document.querySelector(".docview:not([hidden]), .tpage:not([hidden]), .pdfview:not([hidden]), .authgate:not([hidden]), .sheet-bg:not([hidden])")) document.body.classList.remove("auth-lock"); };

  const ICON_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3h8l4 4v14h-12z"/><path d="M14.5 3v4h4M9 12h6M9 15.5h6"/></svg>';
  const ICON_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10.5H4z"/><circle cx="12" cy="13.5" r="3.2"/></svg>';
  // expiry status of a paper (truck papers)
  function xpState(f){
    if (!f.expiresAt) return { c: "none", t: "No expiry" };
    const n = daysTo(f.expiresAt);
    return n < 0 ? { c: "late", t: "Expired" } : n === 0 ? { c: "soon", t: "Expires today" } : n <= 30 ? { c: "soon", t: n + (n === 1 ? " day left" : " days left") } : { c: "ok", t: "Valid" };
  }
  // a paper as a tile: preview, kind, and the date (or expiry, for truck papers)
  function paperTile(f, o = {}){
    const st = o.expiry ? xpState(f) : null;
    const sub = o.expiry ? (f.expiresAt ? (daysTo(f.expiresAt) < 0 ? "Expired " : "Expires ") + niceFull(f.expiresAt) : "No expiry date")
      : [niceDate(String(f.created || "").slice(0, 10)), f.driverEmail && o.who !== false ? H.nameOf(f.driverEmail) : "", f.claim ? "$" + Number(f.claim.amount || 0).toFixed(2) : ""].filter(Boolean).join(" · ");
    const bg = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f.thumb || "") ? ` style="background-image:url(${f.thumb})"` : "";
    return `<button type="button" class="ptile" data-f="${esc(f.id)}"${o.attr ? " " + o.attr : ""} aria-label="${esc(f.kind)}: ${esc(sub)}">
      <span class="pv"${bg}>${bg ? "" : ICON_DOC}${f.type === "pdf" ? '<span class="pdft">PDF</span>' : ""}${st ? `<span class="st ${st.c}">${esc(st.t)}</span>` : ""}</span>
      <span class="pl"><b>${esc(f.kind)}</b><span>${esc(sub)}</span></span></button>`;
  }
  // "+" tile (or a dashed "add this one" tile for a paper that's missing); the camera / file picker opens straight away
  const addTile = (label, kind = "", sub = "") => `<label class="ptile ${kind ? "ghost" : "add"}"${kind ? ` data-kind="${esc(kind)}"` : ""}>
      <span class="pv">${ICON_ADD}</span><span class="pl"><b>${esc(label)}</b><span>${esc(sub || (kind ? "Missing" : "Photo or PDF"))}</span></span>
      <input type="file" accept="image/*,application/pdf" multiple aria-label="${esc(label)}"></label>`;

  // a small preview for the tile (about 240 px), from a photo or the first page of a PDF
  async function makeThumb(data){
    const draw = src => { const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, sc = Math.min(1, 240 / Math.max(w, h));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.62); };
    if (/^data:application\/pdf/.test(data)) {
      const lib = await pdfjs(), pdf = await lib.getDocument({ data: b64Bytes(data) }).promise, pg = await pdf.getPage(1), vp0 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: 480 / Math.max(vp0.width, vp0.height) }), c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      return draw(c);
    }
    const img = new Image(); img.src = data; await img.decode(); return draw(img);
  }

  // ----- full-screen viewer: swipe between papers, zoom, share, download, delete -----
  const DocView = (() => {
    let list = [], idx = 0, opts = {}, sure = "", loaded = {}, datas = {};
    const slide = i => $("dvTrack").children[i];
    function open(l, i, o = {}){
      list = l.slice(); idx = Math.max(0, Math.min(i, list.length - 1)); opts = o; sure = ""; loaded = {}; datas = {};
      $("dvTrack").innerHTML = list.map((f, j) => `<div class="dv-slide" data-i="${j}"><p class="msg">Loading…</p></div>`).join("");
      $("docView").hidden = false; document.body.classList.add("auth-lock");
      if (!(history.state && history.state.doc)) { try { history.pushState({ ...(history.state || {}), doc: 1 }, "", location.href); } catch (e) {} }
      requestAnimationFrame(() => { $("dvTrack").scrollLeft = idx * $("dvTrack").clientWidth; head(); near(); });
    }
    function hide(){ $("docView").hidden = true; $("dvTrack").innerHTML = ""; datas = {}; unlock(); }
    function close(){ hide(); if (history.state && history.state.doc) history.back(); }
    function head(){
      const f = list[idx]; if (!f) return;
      $("dvTitle").textContent = f.kind || "Paper";
      $("dvSub").textContent = [f.expiresAt ? (daysTo(f.expiresAt) < 0 ? "Expired " : "Expires ") + niceFull(f.expiresAt) : "", "Added " + niceFull(String(f.created || "").slice(0, 10)),
        f.driverEmail && opts.who !== false ? "from " + H.nameOf(f.driverEmail) : ""].filter(Boolean).join(" · ");
      $("dvCount").textContent = list.length > 1 ? `${idx + 1} of ${list.length}` : "";
      $("dvInfo").innerHTML = f.loc ? "Sent from " + locLink(f.loc) : f.freed ? "Kept in Google Drive" : "";
      $("dvPrev").hidden = idx === 0; $("dvNext").hidden = idx >= list.length - 1;
      const del = !!(opts.canDelete && opts.canDelete(f) && H.remove); $("dvDel").hidden = !del;
      $("dvDel").textContent = sure === f.id ? "Delete?" : "Delete"; $("dvDel").classList.toggle("sure", sure === f.id);
    }
    const near = () => [idx, idx + 1, idx - 1].forEach(load);
    async function load(i){
      const f = list[i]; if (!f || loaded[f.id]) return; loaded[f.id] = 1;
      const el = slide(i);
      try {
        const data = await H.data(f); datas[f.id] = data;
        if (!el.isConnected) return;
        if (/^data:application\/pdf/.test(data)) {
          const lib = await pdfjs(), pdf = await lib.getDocument({ data: b64Bytes(data) }).promise; el.innerHTML = "";
          const width = Math.min(820, el.clientWidth || 360);
          for (let n = 1; n <= pdf.numPages; n++) {
            const pg = await pdf.getPage(n), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: width / vp0.width * Math.min(2, window.devicePixelRatio || 1) });
            const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
            await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise; el.appendChild(c);
          }
        } else { el.innerHTML = `<img alt="${esc(f.kind || "Paper")}" src="${data}">`; }
        // older papers get their tile preview the first time someone opens them
        if (!f.thumb && H.saveThumb) makeThumb(data).then(t => H.saveThumb(f, t)).catch(() => {});
      } catch (e) {
        console.warn(e); loaded[f.id] = 0;
        el.innerHTML = `<p class="msg">${esc(e && e.message && !/fetch/i.test(e.message) ? e.message : "Couldn't open this paper. Check your connection.")}</p>`;
      }
    }
    let st = 0;
    $("dvTrack").addEventListener("scroll", () => { clearTimeout(st); st = setTimeout(() => { const w = $("dvTrack").clientWidth || 1, i = Math.round($("dvTrack").scrollLeft / w);
      if (i !== idx && list[i]) { idx = i; sure = ""; head(); near(); } }, 60); });
    const go = d => { const i = Math.max(0, Math.min(list.length - 1, idx + d)); $("dvTrack").scrollTo({ left: i * $("dvTrack").clientWidth, behavior: "smooth" }); };
    $("dvPrev").onclick = () => go(-1); $("dvNext").onclick = () => go(1);
    addEventListener("keydown", e => { if ($("docView").hidden) return; if (e.key === "Escape") close(); if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); });
    // double tap / double click a photo to zoom in, again to zoom out
    $("dvTrack").addEventListener("dblclick", e => { const s = e.target.closest(".dv-slide"); if (s && s.querySelector("img")) s.classList.toggle("zoom"); });
    $("dvClose").onclick = close;
    const fileOf = f => { const d = datas[f.id]; if (!d) return null; const type = d.slice(5, d.indexOf(";")), ext = type === "application/pdf" ? "pdf" : "jpg";
      return new File([b64Bytes(d)], `${fileSafe(f.kind || "paper")}-${String(f.created || "").slice(0, 10)}.${ext}`, { type }); };
    $("dvSave").onclick = () => { const f = list[idx], file = f && fileOf(f); if (!file) { toast("Still loading…"); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    $("dvShare").onclick = async () => { const f = list[idx], file = f && fileOf(f); if (!file) { toast("Still loading…"); return; }
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: f.kind }); } catch (e) {} } else $("dvSave").click(); };
    $("dvDel").onclick = async () => {
      const f = list[idx]; if (!f) return;
      if (sure !== f.id) { sure = f.id; head(); setTimeout(() => { if (sure === f.id) { sure = ""; head(); } }, 4000); return; }
      sure = ""; $("dvDel").disabled = true;
      try { await H.remove(f); toast((f.kind || "Paper") + " deleted"); list.splice(idx, 1);
        if (!list.length) close(); else { const keep = idx >= list.length ? list.length - 1 : idx; open(list, keep, opts); }
        if (opts.onChange) opts.onChange();
      } catch (e) { console.warn(e); toast("Couldn't delete. Check your connection."); }
      finally { $("dvDel").disabled = false; }
    };
    addEventListener("popstate", () => { if (!$("docView").hidden) hide(); });
    return { open, close, isOpen: () => !$("docView").hidden };
  })();

  // ----- after picking photos/PDFs: "What is this?" (and when it expires, for truck papers) -----
  const PaperAdd = (() => {
    let files = [], o = null, kind = "", urls = [];
    const plusMonths = m => { const d = new Date(); d.setMonth(d.getMonth() + m); return ymd(d); };
    function start(list, opts){
      files = [...list]; o = opts; kind = opts.kind || (opts.kinds.length === 1 ? opts.kinds[0] : "");
      urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
      $("asTitle").textContent = opts.title || (files.length > 1 ? `What are these ${files.length} papers?` : "What is this?");
      $("asThumbs").innerHTML = files.map(f => { if (/^image\//.test(f.type)) { const u = URL.createObjectURL(f); urls.push(u); return `<div style="background-image:url(${u})"></div>`; } return `<div>PDF</div>`; }).join("");
      $("asKinds").innerHTML = o.kinds.map(k => `<button type="button" aria-pressed="${k === kind}">${esc(k)}</button>`).join("");
      $("asExpWrap").hidden = !o.expiry; $("asExp").value = "";
      $("asQuick").innerHTML = [["In 6 months", 6], ["In 1 year", 12], ["In 2 years", 24]].map(([l, m]) => `<button type="button" data-d="${plusMonths(m)}">${l}</button>`).join("");
      $("asMsg").textContent = ""; $("asSave").disabled = false; $("asSave").textContent = opts.saveLabel || "Save";
      $("addSheet").hidden = false; document.body.classList.add("auth-lock");
    }
    const stop = () => { $("addSheet").hidden = true; urls.forEach(u => URL.revokeObjectURL(u)); urls = []; files = []; unlock(); };
    $("asKinds").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; kind = b.textContent; $("asKinds").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); $("asMsg").textContent = ""; });
    $("asQuick").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) $("asExp").value = b.dataset.d; });
    $("asCancel").onclick = stop;
    $("addSheet").addEventListener("click", e => { if (e.target.id === "addSheet") stop(); });
    $("asSave").onclick = async () => {
      if (!kind) { $("asMsg").textContent = "Pick what it is."; return; }
      $("asSave").disabled = true; $("asSave").textContent = "Saving…";
      let ok = 0; const done = o.done, d = files.slice(), exp = $("asExp").value, k = kind;
      for (const f of d) { try { await o.save(f, k, exp); ok++; } catch (err) { console.warn(err); toast(err.message || "Couldn't save that paper."); } }
      if (ok) toast(o.saved ? o.saved(k, ok) : ok === 1 ? `${k} saved` : `${ok} papers saved`);
      stop(); if (done) done(ok);
    };
    return { start, isOpen: () => !$("addSheet").hidden };
  })();

  window.PUI = { setup: h => Object.assign(H, h), xpState, paperTile, addTile, makeThumb, DocView, PaperAdd, daysTo };
})();

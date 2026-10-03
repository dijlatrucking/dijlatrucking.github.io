// Dijla Ops → Google Drive backup
//
// Setup (once):
//   1. Go to script.google.com while signed in to the Google account whose Drive should hold the backups.
//   2. New project → delete what's there → paste this whole file → Save (name it "Dijla Ops Backup").
//   3. Deploy → New deployment → gear icon → Web app.
//      Execute as: Me.   Who has access: Anyone.   → Deploy → Authorize access (pick your account,
//      "Advanced" → "Go to Dijla Ops Backup" → Allow).
//   4. Copy the Web app URL and paste it in Dijla Ops → Settings → Google Drive backup → Connect.
// Updating later: paste the new version, Save, then Deploy → Manage deployments → pencil →
// Version: New version → Deploy. The URL stays the same.
//
// How it stays safe:
// - Dijla Ops sends only the signed-in person's Firebase sign-in token, nothing else.
// - This script reads the loads, expenses, applicants and settings from Firestore *as that person*,
//   so the same approved-accounts list that guards the app decides who can make a backup.
//   Anyone else gets "not approved" and nothing is written.
// - Files land only in your own Drive. Nobody else gets access unless you share the folder.
//
// What it makes, in Drive → "Dijla Ops Backups":
//   Dijla Ops backup (Google Sheet)   tabs: Loads, Expenses, Papers, Recurring, Applicants, Settings, About.
//                                      Rewritten on every backup, so it always matches the app.
//   Dijla Ops snapshot.json            Every record, exactly as stored. Replaced on every backup, so it always
//                                      matches the app. This is what a restore would use.
//   Papers / 2026-10 / 2026-10-03 · BOL · Echo #4471823.jpg
//                                      Every rate con, receipt, BOL, POD… saved in Ops. Once a copy here is
//                                      checked, Ops may clear its own copy to save space; it then opens this one.
//                                      A paper deleted in Ops goes to the Drive trash (recoverable for 30 days).
//   Reports / Loads - all time.pdf, Expenses - all time.pdf, 1099 2026 - Truck 1.pdf …
//                                      Remade on every backup.

const FIREBASE_API_KEY = "AIzaSyCK7StNNquwyFNTkUAgm6rzt2PPAiJ0WlU";
const PROJECT_ID = "dijla-trucking";
const ROOT_FOLDER = "Dijla Ops Backups";
const SNAP_FOLDER = "Snapshots", OLD_SNAP_FOLDER = "Daily snapshots";
const PAPERS_FOLDER = "Papers", REPORTS_FOLDER = "Reports";
const MARK = "Dijla Ops paper ";
const SHEET_NAME = "Dijla Ops backup";
const SNAP_FILE = "Dijla Ops snapshot.json";

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.ping) return reply({ ok: true, ping: "pong", version: 3 });
    const token = String(body.idToken || "");
    if (!token) return reply({ ok: false, error: "Sign in to Dijla Ops again." });
    const email = whoIs(token);
    if (!email) return reply({ ok: false, error: "Your sign-in expired. Reload Dijla Ops and try again." });

    // The approved-accounts check: can this person read the app's data?
    const settingsDoc = fsGet("meta/settings", token);
    if (settingsDoc === DENIED) return reply({ ok: false, error: email + " isn't approved for Dijla Ops." });

    if (body.backup) return reply(backup(token, email, settingsDoc));
    if (body.papers) return reply({ ok: true, results: (body.ids || []).slice(0, 10).map((id) => copyPaper(String(id), token)) });
    if (body.remove) return reply({ ok: true, results: (body.items || []).slice(0, 200).map((it) => removePaper(it, token)) });
    if (body.verify) return reply({ ok: true, results: (body.items || []).slice(0, 200).map(verifyPaper) });
    if (body.fetch) return reply(fetchPaper(String(body.id || ""), token));
    if (body.savePdf) return reply(savePdf(String(body.name || ""), String(body.data || "")));
    return reply({ ok: false, error: "Unknown request" });
  } catch (err) {
    return reply({ ok: false, error: String((err && err.message) || err) });
  }
}

function doGet() {
  return HtmlService.createHtmlOutput("<p style='font-family:sans-serif'>Dijla Ops backup is running. Paste this page's address into Dijla Ops → Settings → Google Drive backup.</p>");
}

// ---------- the backup ----------
function backup(token, email, settingsDoc) {
  const data = {
    app: "Dijla Ops",
    backedUpAt: new Date().toISOString(),
    backedUpBy: email,
    loads: fsList("loads", token),
    expenses: fsList("expenses", token),
    applications: fsList("applications", token, true),
    files: fsList("files", token, true),
    settings: settingsDoc || {}
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const root = folder(DriveApp.getRootFolder(), ROOT_FOLDER);
    // one snapshot that always matches the app (so anything deleted in Ops is gone from it too)
    const name = SNAP_FILE, json = JSON.stringify(data, null, 1);
    const same = root.getFilesByName(name);
    let snap = null;
    while (same.hasNext()) { const f = same.next(); if (!snap) snap = f; else f.setTrashed(true); }
    if (snap) snap.setContent(json); else snap = root.createFile(name, json, "application/json");
    // older versions kept dated copies in a folder: move those to the Drive trash
    [SNAP_FOLDER, OLD_SNAP_FOLDER].forEach((n) => { const it = root.getFoldersByName(n); while (it.hasNext()) it.next().setTrashed(true); });
    const sheet = writeSheet(root, data);
    return {
      ok: true, at: data.backedUpAt, by: email,
      loads: data.loads.length, expenses: data.expenses.length, applicants: data.applications.length, papers: data.files.length,
      folderUrl: root.getUrl(), sheetUrl: sheet.getUrl(), snapshot: name
    };
  } finally { lock.releaseLock(); }
}


// ---------- the Google Sheet ----------
const LOAD_COLS = [["created", "Created"], ["stage", "Stage"], ["truck", "Truck"], ["broker", "Broker"], ["loadNo", "Load #"],
  ["from", "From"], ["fromDate", "Pickup"], ["to", "To"], ["toDate", "Delivery"], ["rate", "Rate"], ["miles", "Loaded mi"],
  ["empty", "Empty mi"], ["factored", "Factored"], ["deposit", "Deposit"], ["weight", "Weight"], ["commodity", "Commodity"],
  ["notes", "Notes"], ["link", "Paperwork link"], ["hist", "Stage history"], ["id", "ID"]];
const EXP_COLS = [["date", "Date"], ["cat", "Category"], ["amount", "Amount"], ["truck", "Truck"], ["paidWith", "Paid with"],
  ["gallons", "Gallons"], ["state", "State"], ["note", "Note"], ["link", "Link"], ["rec", "Recurring item"], ["created", "Created"], ["id", "ID"]];
const APP_COLS = [["created", "Applied"], ["status", "Status"], ["name", "Name"], ["phone", "Phone"], ["email", "Email"],
  ["city", "City"], ["state", "State"], ["cdl", "CDL"], ["years", "Years driving"], ["reefer", "Reefer"], ["medcard", "Med card"],
  ["endorse", "Endorsements"], ["violations", "Violations"], ["accidents", "Accidents"], ["start", "Can start"], ["notes", "Notes"],
  ["consent", "Consent"], ["id", "ID"]];

function writeSheet(root, data) {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty("sheetId");
  if (id) { try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    const f = DriveApp.getFileById(ss.getId());
    f.moveTo(root);
    props.setProperty("sheetId", ss.getId());
  }
  const s = data.settings || {};
  const truckName = (t) => (t === "t1" ? s.t1 || "Truck 1" : t === "t2" ? s.t2 || "Truck 2" : t === "shared" ? "Both trucks" : t);
  const byNew = (k) => (a, b) => String(b[k] || "").localeCompare(String(a[k] || ""));
  const loads = data.loads.slice().sort(byNew("created")).map((l) => Object.assign({}, l, { truck: truckName(l.truck) }));
  const exps = data.expenses.slice().sort(byNew("date")).map((x) => Object.assign({}, x, { truck: truckName(x.truck) }));
  const apps = data.applications.slice().sort(byNew("created"));
  tab(ss, "Loads", LOAD_COLS, loads);
  tab(ss, "Expenses", EXP_COLS, exps);
  const loadName = {}; data.loads.forEach((l) => { loadName[l.id] = [l.broker, l.loadNo ? "#" + l.loadNo : ""].filter(Boolean).join(" "); });
  tab(ss, "Papers", [["created", "Saved"], ["kind", "Kind"], ["name", "Name"], ["load", "Load"], ["type", "Type"], ["driveUrl", "Google Drive copy"],
    ["freed", "Only in Drive"], ["by", "Saved by"], ["id", "ID"]],
    (data.files || []).slice().sort(byNew("created")).map((f) => ({ created: f.created, kind: f.kind, name: f.name, load: f.loadId ? loadName[f.loadId] || f.loadId : "",
      type: f.type, driveUrl: f.driveUrl || "", freed: !!f.freed, by: f.by, id: f.id })));
  tab(ss, "Recurring", [["name", "Name"], ["cat", "Category"], ["amount", "Amount"], ["truck", "Truck"], ["freq", "How often"],
    ["start", "Starts"], ["paidWith", "Paid with"], ["note", "Note"], ["skip", "Skipped"], ["created", "Created"], ["id", "ID"]],
    (Array.isArray(s.recurring) ? s.recurring : []).map((r) => Object.assign({}, r, { truck: truckName(r.truck) })));
  tab(ss, "Applicants", APP_COLS, apps);
  const flat = Object.keys(s).filter((k) => k !== "recurring" && k !== "backup").sort().map((k) => ({ setting: k, value: s[k] }));
  tab(ss, "Settings", [["setting", "Setting"], ["value", "Value"]], flat);
  tab(ss, "About", [["what", ""], ["value", ""]], [
    { what: "Backed up", value: Utilities.formatDate(new Date(data.backedUpAt), "America/Chicago", "MMM d, yyyy h:mm a") + " (Central)" },
    { what: "By", value: data.backedUpBy },
    { what: "Loads", value: loads.length }, { what: "Expenses", value: exps.length }, { what: "Papers", value: (data.files || []).length }, { what: "Applicants", value: apps.length },
    { what: "Note", value: "This sheet is rewritten on every backup and after anything is deleted in Ops. Edits here are not sent back to Dijla Ops. The full copy is 'Dijla Ops snapshot.json', papers are in 'Papers', reports in 'Reports'." }
  ]);
  const blank = ss.getSheetByName("Sheet1");
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);
  return ss;
}

// One tab: the known columns first (in order), then any other field found, so nothing is ever left out.
function tab(ss, name, cols, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const known = cols.map((c) => c[0]);
  const extra = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => { if (known.indexOf(k) < 0 && extra.indexOf(k) < 0) extra.push(k); }));
  const keys = known.concat(extra.sort()), head = cols.map((c) => c[1] || c[0]).concat(extra.sort());
  const cell = (v) => (v === null || v === undefined ? "" : Array.isArray(v) && v.every((x) => typeof x !== "object") ? v.join(", ")
    : typeof v === "object" ? JSON.stringify(v) : typeof v === "boolean" ? (v ? "Yes" : "No") : v);
  const body = rows.map((r) => keys.map((k) => cell(r[k])));
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setNumberFormat("@").setValues([head]);
  if (body.length) {
    // money and miles stay numbers (so you can add them up); everything else is kept exactly as typed (load #s, phones, dates)
    keys.forEach((k, c) => {
      const numeric = body.every((row) => row[c] === "" || typeof row[c] === "number");
      const col = sh.getRange(2, c + 1, body.length, 1);
      if (numeric) col.setValues(body.map((row) => [row[c]]));
      else col.setNumberFormat("@").setValues(body.map((row) => [String(row[c])]));
    });
  }
  sh.getRange(1, 1, 1, head.length).setFontWeight("bold").setBackground("#eef1f5");
  sh.setFrozenRows(1);
  return sh;
}

// ---------- papers ----------
// Copy one paper into Drive (or confirm the copy that's already there). Reads it from Firestore as the person.
function copyPaper(id, token) {
  try {
    const meta = fsGet("files/" + id, token);
    if (!meta || meta === DENIED) return { id: id, ok: false, error: "paper not found" };
    const have = paperCopy(id, meta.driveFileId);
    if (have) return { id: id, ok: true, fileId: have.getId(), url: have.getUrl(), bytes: have.getSize(), existed: true };
    if (meta.freed) return { id: id, ok: false, error: "only copy was in Drive and it's gone" };
    let data = "";
    for (let i = 0; i < (meta.parts || 1); i++) {
      const part = fsGet("fileData/" + id + "_" + i, token);
      if (!part || part === DENIED || !part.data) return { id: id, ok: false, error: "scan part " + i + " missing" };
      data += part.data;
    }
    const m = /^data:([^;,]+);base64,(.*)$/.exec(data);
    if (!m) return { id: id, ok: false, error: "unreadable scan" };
    const pdf = m[1] === "application/pdf", bytes = Utilities.base64Decode(m[2]);
    const day = String(meta.created || "").slice(0, 10) || Utilities.formatDate(new Date(), "America/Chicago", "yyyy-MM-dd");
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    let f;
    try {
      const where = folder(folder(folder(DriveApp.getRootFolder(), ROOT_FOLDER), PAPERS_FOLDER), day.slice(0, 7));
      const base = clean(day + " · " + (meta.name || meta.kind || "Paper"));
      f = where.createFile(Utilities.newBlob(bytes, pdf ? "application/pdf" : "image/jpeg", base + (pdf ? ".pdf" : ".jpg")));
      f.setDescription(MARK + id);
    } finally { lock.releaseLock(); }
    return { id: id, ok: true, fileId: f.getId(), url: f.getUrl(), bytes: f.getSize() };
  } catch (err) { return { id: id, ok: false, error: String((err && err.message) || err) }; }
}

// The Drive copy recorded for a paper, if it's still there (not in the trash) and really is that paper.
function paperCopy(id, fileId) {
  if (!fileId) return null;
  try { const f = DriveApp.getFileById(fileId); return !f.isTrashed() && String(f.getDescription() || "") === MARK + id ? f : null; }
  catch (e) { return null; }
}

// A paper deleted in Ops: move its Drive copy to the Drive trash (Drive empties it after 30 days).
// Only for papers that really are gone from Ops, and only files this script made for that paper.
function removePaper(it, token) {
  const id = String(it.id || ""), fileId = String(it.fileId || "");
  const still = fsGet("files/" + id, token);
  if (still && still !== DENIED) return { id: id, ok: false, error: "still in Ops" };
  if (still === DENIED) return { id: id, ok: false, error: "not allowed" };
  const f = paperCopy(id, fileId);
  if (f) f.setTrashed(true);
  return { id: id, ok: true, trashed: !!f };
}

// Before Ops clears its own copy: is the Drive copy there, whole (same size), and the right paper?
function verifyPaper(it) {
  const f = paperCopy(String(it.id || ""), String(it.fileId || ""));
  if (!f) return { id: it.id, ok: false, error: "not in Drive" };
  if (Number(it.bytes) > 0 && f.getSize() !== Number(it.bytes)) return { id: it.id, ok: false, error: "size doesn't match" };
  return { id: it.id, ok: true };
}

// Open a paper whose scan now lives only in Drive.
function fetchPaper(id, token) {
  const meta = fsGet("files/" + id, token);
  if (!meta || meta === DENIED) return { ok: false, error: "That paper isn't in Dijla Ops anymore." };
  const f = paperCopy(id, meta.driveFileId);
  if (!f) return { ok: false, error: "That paper's copy isn't in Google Drive anymore." };
  const blob = f.getBlob();
  return { ok: true, data: "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes()) };
}

// Reports: one PDF per name, replaced on every backup.
function savePdf(name, b64) {
  name = clean(name).slice(0, 120);
  if (!/\.pdf$/i.test(name)) name += ".pdf";
  const bytes = Utilities.base64Decode(b64);
  if (String.fromCharCode.apply(null, bytes.slice(0, 4)) !== "%PDF") return { ok: false, error: "not a PDF" };
  const reports = folder(folder(DriveApp.getRootFolder(), ROOT_FOLDER), REPORTS_FOLDER);
  const same = reports.getFilesByName(name);
  while (same.hasNext()) same.next().setTrashed(true);
  const f = reports.createFile(Utilities.newBlob(bytes, "application/pdf", name));
  return { ok: true, url: f.getUrl() };
}

function clean(s) { return String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim() || "Paper"; }

// ---------- Firebase / Firestore (as the signed-in person) ----------
const DENIED = { denied: true };

function whoIs(idToken) {
  const r = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) return "";
  const u = (JSON.parse(r.getContentText()).users || [])[0];
  return u ? u.email || u.localId : "";
}

const BASE = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents/";

function fsGet(path, token) {
  const r = UrlFetchApp.fetch(BASE + path, { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true });
  const code = r.getResponseCode();
  if (code === 404) return null;
  if (code === 401 || code === 403) return DENIED;
  if (code !== 200) throw new Error("Firestore answered " + code + " for " + path);
  return fields(JSON.parse(r.getContentText()).fields || {});
}

function fsList(coll, token, optional) {
  const out = [];
  let page = "";
  do {
    const r = UrlFetchApp.fetch(BASE + coll + "?pageSize=300" + (page ? "&pageToken=" + encodeURIComponent(page) : ""),
      { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true });
    const code = r.getResponseCode();
    if (code === 401 || code === 403) { if (optional) return out; throw new Error("Not allowed to read " + coll + ". Check the Firestore rules."); }
    if (code !== 200) throw new Error("Firestore answered " + code + " for " + coll);
    const j = JSON.parse(r.getContentText());
    (j.documents || []).forEach((d) => { const v = fields(d.fields || {}); v.id = v.id || d.name.split("/").pop(); out.push(v); });
    page = j.nextPageToken || "";
  } while (page);
  return out;
}

function fields(f) { const o = {}; Object.keys(f).forEach((k) => { o[k] = value(f[k]); }); return o; }
function value(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return fields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(value);
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  return null;
}

// ---------- helpers ----------
function folder(parent, name) {
  const it = parent.getFoldersByName(name);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) return f; }
  return parent.createFolder(name);
}
function reply(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// Run this once from the editor (▶ Run) if Google asks you to authorize before deploying.
function authorize() { DriveApp.getRootFolder(); SpreadsheetApp.flush(); UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true }); }

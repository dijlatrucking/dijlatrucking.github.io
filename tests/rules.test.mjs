// Who can do what in Dijla Ops. Run inside the Firestore emulator:
//   cd tests && npx firebase emulators:exec --only firestore --project demo-dijla "node rules.test.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, query, where, writeBatch } from "firebase/firestore";
import { readFileSync } from "node:fs";

const env = await initializeTestEnvironment({
  projectId: "demo-dijla",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "team/bakrabd2@gmail.com"), { email: "bakrabd2@gmail.com", name: "Bakr", addedBy: "dijlatrucking@gmail.com", added: "2026-10-03T00:00:00Z" });
  await setDoc(doc(db, "loads/L1"), { rate: 2000 });
  await setDoc(doc(db, "expenses/E1"), { amount: 50 });
  await setDoc(doc(db, "meta/settings"), { company: "Dijla" });
  await setDoc(doc(db, "applications/A1"), { name: "Jo", status: "new" });
  await setDoc(doc(db, "team/remove-me@gmail.com"), { email: "remove-me@gmail.com", addedBy: "dijlatrucking@gmail.com", added: "2026-10-03T00:00:00Z" });
  await setDoc(doc(db, "secret/x"), { a: 1 });
});
const who = (email, verified = true) => env.authenticatedContext("u-" + email, { email, email_verified: verified }).firestore();
const owner = who("dijlatrucking@gmail.com"), ownerCaps = who("DijlaTrucking@gmail.com");
const member = who("bakrabd2@gmail.com");
const outsider = who("spartanbiolabs.info@gmail.com");      // was in the old hard-coded list; now must be added
const unverified = who("dijlatrucking@gmail.com", false);
const anon = env.unauthenticatedContext().firestore();
let pass = 0, fail = 0;
async function t(name, p, allow) {
  try { await (allow ? assertSucceeds(p) : assertFails(p)); pass++; console.log(`✓ ${allow ? "ALLOW" : "DENY"}: ${name}`); }
  catch (e) { fail++; console.log(`✗ ${allow ? "ALLOW" : "DENY"}: ${name}\n    ${String(e.message || e).split("\n")[0]}`); }
}
const app = () => ({ name: "Sam Driver", phone: "2085550100", city: "Boise", state: "ID", cdl: "Class A", years: "3-5", reefer: "Yes", medcard: "Yes",
  violations: "No", accidents: "No", start: "Now", consent: true, status: "new", created: serverTimestamp() });
const member2 = (email, extra = {}) => ({ email, name: "New", addedBy: "dijlatrucking@gmail.com", added: "2026-10-03T08:00:00.000Z", ...extra });

// owner: everything
for (const [n, db] of [["owner", owner], ["owner (capital letters in email)", ownerCaps]]) {
  await t(`${n} reads loads`, getDocs(collection(db, "loads")), true);
  await t(`${n} writes a load`, setDoc(doc(db, "loads/L9"), { rate: 1 }), true);
  await t(`${n} reads settings`, getDoc(doc(db, "meta/settings")), true);
}
await t("owner reads expenses", getDocs(collection(owner, "expenses")), true);
await t("owner reads applicants", getDocs(collection(owner, "applications")), true);
await t("owner updates an applicant", updateDoc(doc(owner, "applications/A1"), { status: "contacted" }), true);
await t("owner reads the team", getDocs(collection(owner, "team")), true);
await t("owner adds a team member", setDoc(doc(owner, "team/dodge94.aa@gmail.com"), member2("dodge94.aa@gmail.com")), true);
await t("owner removes a team member", deleteDoc(doc(owner, "team/remove-me@gmail.com")), true);
await t("owner can't add with capital letters in the id", setDoc(doc(owner, "team/Some@Gmail.com"), member2("Some@Gmail.com")), false);
await t("owner can't add a non-email", setDoc(doc(owner, "team/not-an-email"), member2("not-an-email")), false);
await t("owner can't add with a mismatched email field", setDoc(doc(owner, "team/a@gmail.com"), member2("b@gmail.com")), false);
await t("owner can't add extra fields (e.g. a role)", setDoc(doc(owner, "team/c@gmail.com"), member2("c@gmail.com", { role: "owner" })), false);
await t("owner can't add themselves to the list", setDoc(doc(owner, "team/dijlatrucking@gmail.com"), member2("dijlatrucking@gmail.com")), false);

// team member: all the data, but not the team list
await t("member reads loads", getDocs(collection(member, "loads")), true);
await t("member writes a load", setDoc(doc(member, "loads/L2"), { rate: 5 }), true);
await t("member deletes a load", deleteDoc(doc(member, "loads/L2")), true);
await t("member writes expenses", setDoc(doc(member, "expenses/E2"), { amount: 9 }), true);
await t("member writes settings", setDoc(doc(member, "meta/settings"), { company: "Dijla", driveUrl: "https://script.google.com/macros/s/x/exec" }), true);
await t("member reads applicants", getDocs(collection(member, "applications")), true);
await t("member deletes an applicant", deleteDoc(doc(member, "applications/A1")), true);
await t("member sees the team list", getDocs(collection(member, "team")), true);
await t("member can't add someone", setDoc(doc(member, "team/friend@gmail.com"), member2("friend@gmail.com", { addedBy: "bakrabd2@gmail.com" })), false);
await t("member can't remove someone", deleteDoc(doc(member, "team/dodge94.aa@gmail.com")), false);
await t("member can't change their own entry", updateDoc(doc(member, "team/bakrabd2@gmail.com"), { name: "Boss" }), false);
await t("member can't reach other collections", getDoc(doc(member, "secret/x")), false);

// not on the team (incl. accounts from the old hard-coded list)
await t("outsider can't read loads", getDocs(collection(outsider, "loads")), false);
await t("outsider can't read settings", getDoc(doc(outsider, "meta/settings")), false);
await t("outsider can't write a load", setDoc(doc(outsider, "loads/X"), { rate: 1 }), false);
await t("outsider can't read applicants", getDocs(collection(outsider, "applications")), false);
await t("outsider can't see the team", getDocs(collection(outsider, "team")), false);
await t("outsider can't add themselves", setDoc(doc(outsider, "team/spartanbiolabs.info@gmail.com"), member2("spartanbiolabs.info@gmail.com", { addedBy: "spartanbiolabs.info@gmail.com" })), false);
await t("owner's email but not verified: denied", getDocs(collection(unverified, "loads")), false);
await t("signed out: can't read loads", getDocs(collection(anon, "loads")), false);
await t("signed out: can't read the team", getDocs(collection(anon, "team")), false);

// removed member loses access right away
await t("removed member can't read loads", getDocs(collection(who("remove-me@gmail.com"), "loads")), false);
// newly added member gets access right away
await t("newly added member reads loads", getDocs(collection(who("dodge94.aa@gmail.com"), "loads")), true);

// hiring page still works for the public
await t("public can send a valid application", addDoc(collection(anon, "applications"), app()), true);
await t("public can't send a bad application", addDoc(collection(anon, "applications"), { ...app(), status: "hired" }), false);
await t("public can't read applications", getDocs(collection(anon, "applications")), false);

// papers
await t("member saves a paper record", setDoc(doc(member, "files/pp1"), { kind: "BOL", loadId: "L1", parts: 1 }), true);
await t("member saves a paper scan", setDoc(doc(member, "fileData/pp1_0"), { data: "data:image/jpeg;base64,AAAA" }), true);
await t("member opens a paper scan", getDoc(doc(member, "fileData/pp1_0")), true);
await t("owner frees a scan after backup", deleteDoc(doc(owner, "fileData/pp1_0")), true);
await t("outsider can't list papers", getDocs(collection(outsider, "files")), false);
await t("outsider can't open a scan", getDoc(doc(outsider, "fileData/pp1_0")), false);
await t("outsider can't add a paper", setDoc(doc(outsider, "files/x"), { kind: "BOL" }), false);
await t("signed out: can't open a scan", getDoc(doc(anon, "fileData/pp1_0")), false);
await t("member queues a Drive copy for the trash", setDoc(doc(member, "trash/pp1"), { fileId: "abc", at: "2026-10-03" }), true);
await t("member reads and clears the queue", getDocs(collection(member, "trash")), true);
await t("outsider can't see the trash queue", getDocs(collection(outsider, "trash")), false);

// access requests
const newbie = who("newbie@gmail.com"), other = who("other@gmail.com");
const req = (email, extra = {}) => ({ email, name: "New Person", status: "pending", requested: serverTimestamp(), ...extra });
await t("a new Google account asks for access", setDoc(doc(newbie, "requests/newbie@gmail.com"), req("newbie@gmail.com")), true);
await t("…and can see its own request", getDoc(doc(newbie, "requests/newbie@gmail.com")), true);
await t("…can check for a request before sending one", getDoc(doc(other, "requests/other@gmail.com")), true);
await t("…but can't read someone else's", getDoc(doc(other, "requests/newbie@gmail.com")), false);
await t("…or list all requests", getDocs(collection(newbie, "requests")), false);
await t("…or send one for another email", setDoc(doc(other, "requests/someone@gmail.com"), req("someone@gmail.com")), false);
await t("…or approve itself", updateDoc(doc(newbie, "requests/newbie@gmail.com"), { status: "approved" }), false);
await t("…or send it already approved", setDoc(doc(other, "requests/other@gmail.com"), req("other@gmail.com", { status: "approved" })), false);
await t("…or add extra fields", setDoc(doc(other, "requests/other@gmail.com"), req("other@gmail.com", { role: "owner" })), false);
await t("…or send it again over the first one", setDoc(doc(newbie, "requests/newbie@gmail.com"), req("newbie@gmail.com", { name: "Again" })), false);
await t("…and still can't read any data", getDocs(collection(newbie, "loads")), false);
await t("signed out: can't ask for access", setDoc(doc(anon, "requests/x@gmail.com"), req("x@gmail.com")), false);
await t("unverified email: can't ask for access", setDoc(doc(who("unv@gmail.com", false), "requests/unv@gmail.com"), req("unv@gmail.com")), false);
await t("a team member doesn't need to ask", setDoc(doc(member, "requests/bakrabd2@gmail.com"), req("bakrabd2@gmail.com")), false);
await t("a member can't see requests", getDocs(collection(member, "requests")), false);
await t("owner lists requests", getDocs(collection(owner, "requests")), true);
await t("owner approves: request marked approved", updateDoc(doc(owner, "requests/newbie@gmail.com"), { status: "approved", decidedBy: "dijlatrucking@gmail.com", decided: "2026-10-03T09:00:00Z" }), true);
await t("owner can't change the request's email or name", updateDoc(doc(owner, "requests/newbie@gmail.com"), { name: "x" }), false);
await t("owner approves: person added to the team", setDoc(doc(owner, "team/newbie@gmail.com"), member2("newbie@gmail.com")), true);
await t("approved person now reads loads", getDocs(collection(newbie, "loads")), true);
await t("approved person tidies up their request", deleteDoc(doc(newbie, "requests/newbie@gmail.com")), true);
await setDoc(doc(other, "requests/other@gmail.com"), req("other@gmail.com"));
await t("owner rejects", updateDoc(doc(owner, "requests/other@gmail.com"), { status: "rejected", decidedBy: "dijlatrucking@gmail.com", decided: "2026-10-03T09:00:00Z" }), true);
await t("rejected person can't delete it to ask again", deleteDoc(doc(other, "requests/other@gmail.com")), false);
await t("rejected person can't ask again", setDoc(doc(other, "requests/other@gmail.com"), req("other@gmail.com")), false);
await t("rejected person can't read data", getDocs(collection(other, "loads")), false);
await t("owner clears the rejected request", deleteDoc(doc(owner, "requests/other@gmail.com")), true);
await setDoc(doc(who("cancel@gmail.com"), "requests/cancel@gmail.com"), req("cancel@gmail.com"));
await t("someone can cancel their own pending request", deleteDoc(doc(who("cancel@gmail.com"), "requests/cancel@gmail.com")), true);

// ---------- drivers ----------
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "drivers/drew@gmail.com"), { email: "drew@gmail.com", name: "Drew", payType: "perMile", payRate: 0.6, truckId: "t1", active: true });
  await setDoc(doc(db, "drivers/old@gmail.com"), { email: "old@gmail.com", name: "Old", truckId: "t1", active: false });
  await setDoc(doc(db, "drivers/sam@gmail.com"), { email: "sam@gmail.com", name: "Sam", truckId: "t2", active: true });
  await setDoc(doc(db, "trips/L1"), { driverEmail: "drew@gmail.com", loadNo: "447", stage: "booked", pay: 300 });
  await setDoc(doc(db, "trips/L2"), { driverEmail: "sam@gmail.com", loadNo: "448", stage: "booked" });
  await setDoc(doc(db, "statements/S1"), { driverEmail: "drew@gmail.com", total: 300 });
  await setDoc(doc(db, "statements/S2"), { driverEmail: "sam@gmail.com", total: 500 });
  await setDoc(doc(db, "trucksPublic/t1"), { name: "Red Pete", vin: "1XP" });
  await setDoc(doc(db, "trucksPublic/t2"), { name: "Blue KW" });
  await setDoc(doc(db, "shared/app"), { company: "Dijla", driveUrl: "x" });
  await setDoc(doc(db, "files/tdoc1"), { kind: "Insurance card", truckId: "t1", parts: 1 });
  await setDoc(doc(db, "fileData/tdoc1_0"), { data: "x" });
  await setDoc(doc(db, "files/tdoc2"), { kind: "Insurance card", truckId: "t2", parts: 1 });
  await setDoc(doc(db, "fileData/tdoc2_0"), { data: "x" });
  await setDoc(doc(db, "files/rc1"), { kind: "Rate con", loadId: "L1", parts: 1 });
  await setDoc(doc(db, "fileData/rc1_0"), { data: "x" });
  await setDoc(doc(db, "files/samb"), { kind: "BOL", loadId: "L2", driverEmail: "sam@gmail.com", parts: 1 });
  await setDoc(doc(db, "fileData/samb_0"), { data: "x" });
  await setDoc(doc(db, "files/backedup"), { kind: "BOL", loadId: "L1", driverEmail: "drew@gmail.com", parts: 1, driveFileId: "d1" });
  await setDoc(doc(db, "files/okr"), { kind: "Receipt", driverEmail: "drew@gmail.com", parts: 1, claim: { status: "approved", amount: 5 } });
});
const drew = who("drew@gmail.com"), oldD = who("old@gmail.com");
const dpaper = (extra = {}) => ({ kind: "BOL", loadId: "L1", driverEmail: "drew@gmail.com", parts: 1, ...extra });
async function upload(db, id, meta) { const b = writeBatch(db); b.set(doc(db, "files/" + id), meta); b.set(doc(db, "fileData/" + id + "_0"), { data: "x" }); return b.commit(); }
await t("driver reads their own driver entry", getDoc(doc(drew, "drivers/drew@gmail.com")), true);
await t("driver can't read another driver", getDoc(doc(drew, "drivers/sam@gmail.com")), false);
await t("driver can't change their own pay", updateDoc(doc(drew, "drivers/drew@gmail.com"), { payRate: 5 }), false);
await t("driver lists their own trips", getDocs(query(collection(drew, "trips"), where("driverEmail", "==", "drew@gmail.com"))), true);
await t("driver can't read another driver's trip", getDoc(doc(drew, "trips/L2")), false);
await t("driver can't list all trips", getDocs(collection(drew, "trips")), false);
await t("driver marks their trip picked up", updateDoc(doc(drew, "trips/L1"), { stage: "pickedup", stageBy: "driver", stageAt: "2026-10-03" }), true);
await t("driver can't mark it paid", updateDoc(doc(drew, "trips/L1"), { stage: "paid", stageBy: "driver", stageAt: "x" }), false);
await t("driver can't change their pay on a trip", updateDoc(doc(drew, "trips/L1"), { pay: 9999 }), false);
await t("driver can't move another driver's trip", updateDoc(doc(drew, "trips/L2"), { stage: "delivered", stageBy: "driver", stageAt: "x" }), false);
await t("driver can't read loads (rates)", getDocs(collection(drew, "loads")), false);
await t("driver can't read expenses", getDocs(collection(drew, "expenses")), false);
await t("driver can't read settings", getDoc(doc(drew, "meta/settings")), false);
await t("driver can't see the team", getDocs(collection(drew, "team")), false);
await t("driver reads the app info", getDoc(doc(drew, "shared/app")), true);
await t("driver reads their truck's profile", getDoc(doc(drew, "trucksPublic/t1")), true);
await t("driver can't read another truck's profile", getDoc(doc(drew, "trucksPublic/t2")), false);
await t("driver lists their truck's papers", getDocs(query(collection(drew, "files"), where("truckId", "==", "t1"))), true);
await t("driver opens their truck's paper", getDoc(doc(drew, "fileData/tdoc1_0")), true);
await t("driver can't open another truck's paper", getDoc(doc(drew, "fileData/tdoc2_0")), false);
await t("driver can't open the rate con (rates)", getDoc(doc(drew, "fileData/rc1_0")), false);
await t("driver can't list all papers", getDocs(collection(drew, "files")), false);
await t("driver uploads a BOL to their trip", upload(drew, "dp1", dpaper()), true);
await t("driver lists their own uploads", getDocs(query(collection(drew, "files"), where("driverEmail", "==", "drew@gmail.com"))), true);
await t("driver opens their own upload", getDoc(doc(drew, "fileData/dp1_0")), true);
await t("driver can't open another driver's upload", getDoc(doc(drew, "fileData/samb_0")), false);
await t("driver can't upload to another driver's trip", upload(drew, "dp2", dpaper({ loadId: "L2" })), false);
await t("driver can't upload as someone else", upload(drew, "dp3", dpaper({ driverEmail: "sam@gmail.com" })), false);
await t("driver can't add papers to a truck", upload(drew, "dp4", dpaper({ loadId: null, truckId: "t1" })), false);
await t("driver sends a receipt (pending)", upload(drew, "dr1", dpaper({ kind: "Receipt", loadId: null, claim: { status: "pending", amount: 42.5, cat: "Lumper" } })), true);
await t("driver can't send a receipt already approved", upload(drew, "dr2", dpaper({ kind: "Receipt", loadId: null, claim: { status: "approved", amount: 42.5 } })), false);
await t("driver can't approve their receipt", updateDoc(doc(drew, "files/dr1"), { "claim.status": "approved" }), false);
await t("driver can't write a scan part alone for someone else's paper", setDoc(doc(drew, "fileData/samb_9"), { data: "x" }), false);
const delBatch = (db, id) => { const b = writeBatch(db); b.delete(doc(db, "files/" + id)); b.delete(doc(db, "fileData/" + id + "_0")); return b.commit(); };
await t("driver takes back their own upload", delBatch(drew, "dp1"), true);
await t("driver can't delete one already backed up", deleteDoc(doc(drew, "files/backedup")), false);
await t("driver can't delete an approved receipt", deleteDoc(doc(drew, "files/okr")), false);
await t("driver can't delete another driver's paper", delBatch(drew, "samb"), false);
await t("driver reads their statements", getDocs(query(collection(drew, "statements"), where("driverEmail", "==", "drew@gmail.com"))), true);
await t("driver can't read another driver's statement", getDoc(doc(drew, "statements/S2")), false);
await t("driver can't change a statement", updateDoc(doc(drew, "statements/S1"), { total: 9999 }), false);
await t("a turned-off driver can't read trips", getDocs(query(collection(oldD, "trips"), where("driverEmail", "==", "old@gmail.com"))), false);
await t("a turned-off driver can't open truck papers", getDoc(doc(oldD, "fileData/tdoc1_0")), false);
await t("outsider can't read trips", getDocs(query(collection(outsider, "trips"), where("driverEmail", "==", "drew@gmail.com"))), false);
await t("outsider can't read shared app info", getDoc(doc(outsider, "shared/app")), false);
await t("office adds a driver", setDoc(doc(member, "drivers/new@gmail.com"), { email: "new@gmail.com", name: "New", payType: "percent", payRate: 25, truckId: "t2", active: true, added: "2026-10-03", addedBy: "bakrabd2@gmail.com" }), true);
await t("office can't add a driver with a bad pay type", setDoc(doc(member, "drivers/bad@gmail.com"), { email: "bad@gmail.com", payType: "whatever" }), false);
await t("office writes trips, statements, truck profiles", setDoc(doc(member, "trips/L9"), { driverEmail: "drew@gmail.com", stage: "booked" }).then(() => setDoc(doc(member, "statements/S9"), { driverEmail: "drew@gmail.com" })).then(() => setDoc(doc(member, "trucksPublic/t9"), { name: "x" })), true);
await t("office approves a driver receipt", updateDoc(doc(member, "files/dr1"), { "claim.status": "approved", expenseIds: ["E1"] }), true);
await t("driver can't add drivers", setDoc(doc(drew, "drivers/pal@gmail.com"), { email: "pal@gmail.com", payType: "flat", payRate: 1 }), false);
await t("driver can't ask for office access while a driver… but can't read loads either way", getDocs(collection(drew, "loads")), false);

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);

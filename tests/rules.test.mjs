// Who can do what in Dijla Ops. Run inside the Firestore emulator:
//   cd tests && npx firebase emulators:exec --only firestore --project demo-dijla "node rules.test.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
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

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);

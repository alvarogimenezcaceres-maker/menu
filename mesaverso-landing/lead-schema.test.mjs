import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLead, PRIVACY_VERSION } from "./src/lead-schema.js";

const base = { name: "Ana Pérez", business: "Café Ana", phone: "0981 123 456", type: "Cafetería" };
const now = new Date("2026-11-15T12:00:00.000Z");

test("privacy checkbox is required", () => {
  const r = validateLead({ ...base }, now);
  assert.equal(r.ok, false);
  assert.ok(r.fields.privacy);
  assert.equal(validateLead({ ...base, privacy: "on" }, now).ok, false, "only a real boolean counts");
});

test("privacy accepted, marketing off by default", () => {
  const r = validateLead({ ...base, privacy: true }, now);
  assert.equal(r.ok, true);
  assert.deepEqual(r.lead.consent, { privacy: PRIVACY_VERSION, marketing: false, at: "2026-11-15T12:00:00.000Z" });
  assert.equal(PRIVACY_VERSION, "2026-11-15");
});

test("marketing opt-in is stored only when true", () => {
  assert.equal(validateLead({ ...base, privacy: true, marketing: true }, now).lead.consent.marketing, true);
  assert.equal(validateLead({ ...base, privacy: true, marketing: "true" }, now).lead.consent.marketing, false);
});

test("legacy consent:true still accepted; other errors unchanged", () => {
  assert.equal(validateLead({ ...base, consent: true }, now).ok, true);
  const r = validateLead({ ...base, privacy: true, phone: "abc" }, now);
  assert.equal(r.fields.phone, "Revisá el número: solo números, por ejemplo 0981 123 456.");
});

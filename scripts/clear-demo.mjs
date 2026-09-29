// Deletes every record tagged `demo: true` (written by seed-demo.mjs). Real records are untouched.
//   npm run clear-demo                                  → local emulator
//   node scripts/clear-demo.mjs --project <id> --yes    → a cloud project
import { COLLECTIONS, firestoreTarget } from "./firestore-target.mjs";

const T = await firestoreTarget();
if (T.cloud && !process.argv.includes("--yes")) {
  console.error(`This deletes all demo records in ${T.label}. Re-run with --yes to confirm.`);
  process.exit(1);
}

async function call(url, body) {
  const res = await fetch(url, { method: "POST", headers: T.headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

let total = 0;
for (const col of COLLECTIONS) {
  const rows = await call(`${T.base}:runQuery`, {
    structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: "demo" }, op: "EQUAL", value: { booleanValue: true } } } },
  });
  const names = rows.map((r) => r.document?.name).filter(Boolean);
  for (let i = 0; i < names.length; i += 400) await call(`${T.base}:commit`, { writes: names.slice(i, i + 400).map((n) => ({ delete: n })) });
  total += names.length;

  // Reset serial numbering for a module once it holds no records at all.
  const left = await call(`${T.base}:runQuery`, { structuredQuery: { from: [{ collectionId: col }], limit: 1 } });
  if (!left.some((r) => r.document)) {
    const counters = await call(`${T.base}:runQuery`, { structuredQuery: { from: [{ collectionId: "counters" }] } });
    const mine = counters.map((r) => r.document?.name).filter((n) => n && n.split("/").pop().startsWith(`${col}-`));
    if (mine.length) await call(`${T.base}:commit`, { writes: mine.map((n) => ({ delete: n })) });
  }
}
console.log(`Removed ${total} demo records from ${T.label}.`);

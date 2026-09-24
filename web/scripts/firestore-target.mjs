// Where the maintenance scripts write:
//   (no flag)            → local emulator (demo-erp), no credentials needed
//   --project <id>       → that cloud project, using the Firebase CLI's login (run `firebase login` first).
//                          Admin credentials bypass security rules, so only use on your own project.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export async function firestoreTarget(argv = process.argv.slice(2)) {
  const i = argv.indexOf("--project");
  if (i === -1) {
    return {
      label: "local emulator",
      cloud: false,
      base: "http://127.0.0.1:8080/v1/projects/demo-erp/databases/(default)/documents",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, // emulator-only admin bypass
    };
  }
  const project = argv[i + 1];
  if (!project) throw new Error("--project needs a project id");
  const require = createRequire(import.meta.url);
  const auth = require(path.join(execSync("npm root -g").toString().trim(), "firebase-tools", "lib", "auth.js"));
  const cfg = require(path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"));
  if (!cfg.tokens?.refresh_token) throw new Error("Not logged in to the Firebase CLI — run `firebase login`.");
  const { access_token } = await auth.getAccessToken(cfg.tokens.refresh_token, []);
  return {
    label: `cloud project ${project}`,
    cloud: true,
    base: `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
  };
}

export const COLLECTIONS = ["clients", "suppliers", "marketing", "rfqs", "quotations", "salesOrders", "purchaseOrders", "proformaInvoices", "payments", "deliveries", "companyDocs", "investors", "expenses", "financeEntries"];

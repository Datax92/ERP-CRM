/**
 * End-to-end: drives the real UI through the Excel/conversation workflow on the LOCAL emulators.
 * Wipes the emulator database first. Screenshots land in tests/e2e/screenshots/.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

const FS = "http://127.0.0.1:8080/emulator/v1/projects/demo-erp/databases/(default)/documents";
const AUTH = "http://127.0.0.1:9099";
const SHOTS = "tests/e2e/screenshots";

async function resetEmulator() {
  await fetch(FS, { method: "DELETE" });
  await fetch(`${AUTH}/emulator/v1/projects/demo-erp/accounts`, { method: "DELETE" });
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@test.local", password: "test1234" }),
  });
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@test.local");
  await page.getByLabel("Password").fill("test1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

const drawer = (page: Page) => page.getByRole("dialog");
const field = (page: Page, label: string | RegExp) => drawer(page).getByLabel(label, { exact: typeof label === "string" ? false : undefined }).first();

async function saveDrawer(page: Page) {
  await drawer(page).getByRole("button", { name: /^(Create|Save changes)$/ }).click();
  await expect(drawer(page).getByRole("button", { name: "Saved" })).toBeVisible();
}

const title = (page: Page) => drawer(page).locator(".truncate.font-semibold").first();
async function nextStep(page: Page, label: string | RegExp, heading: RegExp) {
  await drawer(page).getByRole("button", { name: label }).click();
  await expect(title(page)).toHaveText(heading);
  await expect(drawer(page).getByRole("button", { name: "Saved" })).toBeVisible();
}

const overview = (page: Page) => drawer(page).locator("section").filter({ hasText: "Overview" }).first();
async function expectOverview(page: Page, label: string, value: string | RegExp) {
  const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const item = overview(page).locator("dl > div").filter({ has: page.locator("dt", { hasText: exact }) });
  await expect(item.locator("dd")).toHaveText(value);
}
const itemRow = (page: Page, n: number): Locator => drawer(page).locator("section").filter({ hasText: /Items/ }).locator("tbody tr").nth(n);

test("Excel + conversation workflow through the UI", async ({ page }) => {
  await resetEmulator();
  await login(page);

  // --- Suppliers data
  await page.goto("/suppliers/?new=1");
  await field(page, /Supplier name/).fill("Grundfos ME");
  await field(page, /^Region/).selectOption("Middle East");
  await field(page, /Usual payment terms/).selectOption("LC (Letter of Credit)");
  await saveDrawer(page);

  // --- Clients data
  await page.goto("/clients/?new=1");
  await field(page, /Client \/ company name/).fill("Karachi Water Board");
  await field(page, /^Email/).fill("buyer@kwb.test");
  await field(page, /^Region/).selectOption("Sindh");
  await field(page, /^Sector/).selectOption("Water & Sanitation");
  await field(page, /Registration status/).selectOption("Registered");
  await saveDrawer(page);
  await expectOverview(page, "Stage", "Lead");

  // --- RFQ from the client
  await nextStep(page, /New RFQ for this client/, /^RFQ · RFQ-\d{4}-0001/);
  await expect(field(page, /^Region/)).toHaveValue("Sindh");
  await drawer(page).getByRole("button", { name: "Add item" }).click();
  const r0 = itemRow(page, 0).locator("input, textarea");
  await r0.nth(0).fill("Pump 50 m3/h");
  await r0.nth(1).fill("Water Pump");
  await r0.nth(2).fill("Grundfos");
  await r0.nth(3).fill("4");
  await saveDrawer(page);
  await page.screenshot({ path: `${SHOTS}/01-rfq.png`, fullPage: true });

  // --- Quotation (costing, offered rate, margin)
  await nextStep(page, /Convert to quotation/, /^Quotation · QT-\d{4}-0001/);
  await expect(itemRow(page, 0).locator("textarea")).toHaveValue("Pump 50 m3/h");
  await itemRow(page, 0).locator("select").selectOption({ label: "Grundfos ME" });
  const q0 = itemRow(page, 0).locator('input[type="number"]');
  await q0.nth(1).fill("250000");
  await q0.nth(2).fill("310000");
  await field(page, /^Status/).selectOption("Sent");
  await field(page, /Follow-up status/).selectOption("Awaiting response");
  await saveDrawer(page);
  await expectOverview(page, "Total price", "PKR 1,240,000");
  await expectOverview(page, "Margin", "PKR 240,000");
  await expectOverview(page, "Margin %", "19.4%");
  await page.screenshot({ path: `${SHOTS}/02-quotation.png`, fullPage: true });

  // --- Sales order
  await nextStep(page, /Convert to sales order/, /^Sales order · SO-\d{4}-0001/);
  await field(page, /Incoterm/).selectOption("CIF");
  await field(page, /Shipment date \(delivery\)/).fill("2026-03-10");
  await saveDrawer(page);
  await expectOverview(page, "Payment", "Unpaid");

  // --- Purchase order to the supplier named on the quotation line
  await nextStep(page, /Issue PO to Grundfos ME/, /^Purchase order · PO-\d{4}-0001/);
  await expectOverview(page, "PO value", "PKR 1,000,000");
  await expect(field(page, /Supplier payment terms/)).toHaveValue("LC (Letter of Credit)");
  await nextStep(page, /Record payment to vendor/, /^Payment · PAY-\d{4}-0001/);
  await page.goBack();
  await page.goBack();
  await expect(title(page)).toHaveText(/^Sales order · SO-\d{4}-0001/);
  await expectOverview(page, "PO issued to supplier", "Grundfos ME");

  // --- Proforma to client + partial payment receipt
  await nextStep(page, /Create proforma invoice to client/, /^Proforma invoice · PI-\d{4}-0001/);
  await nextStep(page, /Record payment received/, /^Payment · PAY-\d{4}-0002/);
  await field(page, /^Amount/).fill("500000");
  await field(page, /Payment method/).selectOption("Bank Transfer");
  await saveDrawer(page);
  await page.goBack();
  await expect(title(page)).toHaveText(/^Proforma invoice · PI-\d{4}-0001/);
  await expectOverview(page, "Pending", "PKR 740,000");
  await expectOverview(page, "Status", "Partially paid");

  // --- Delivery, delivered late
  await page.goto("/sales-orders/");
  await page.getByRole("cell", { name: /SO-\d{4}-0001/ }).click();
  await nextStep(page, /Create delivery/, /^Delivery · DN-\d{4}-0001/);
  await expect(field(page, /Incoterm/)).toHaveValue("CIF");
  await field(page, /Delivered on/).fill("2026-03-20");
  await field(page, /^Status/).selectOption("Delivered");
  await saveDrawer(page);
  await expectOverview(page, "Late delivery", "10 days");
  await page.screenshot({ path: `${SHOTS}/03-delivery.png`, fullPage: true });

  // --- Sales order now shows everything linked
  await drawer(page).getByRole("button", { name: /Sales order.*SO-\d{4}-0001/ }).click();
  await expectOverview(page, "Payment", "Partially paid");
  await expectOverview(page, "Late delivery", "10 days");
  for (const kind of ["Quotation", "Purchase order", "Proforma invoice", "Delivery", "Payment"]) {
    await expect(drawer(page).locator("section").filter({ hasText: "Linked records" }).getByText(kind, { exact: true }).first()).toBeVisible();
  }
  await page.screenshot({ path: `${SHOTS}/04-sales-order-linked.png`, fullPage: true });

  // --- Client stages updated by the workflow
  await page.goto("/clients/");
  const row = page.getByRole("row", { name: /Karachi Water Board/ });
  await expect(row).toContainText("Delivered");
  await expect(row).toContainText("Converted");
  await expect(row).toContainText("Won");
  await expect(row).toContainText("Partially paid");
  await page.screenshot({ path: `${SHOTS}/05-clients-stages.png`, fullPage: true });
});

const PAGES: [string, string][] = [
  ["/", "10-dashboard"],
  ["/clients/?tab=reports", "11-clients-report"],
  ["/suppliers/?tab=reports", "12-suppliers-report"],
  ["/marketing/?tab=reports", "13-marketing-report"],
  ["/rfqs/?tab=reports", "14-rfq-report"],
  ["/quotations/?tab=reports", "15-quotation-report"],
  ["/sales-orders/?tab=reports", "16-sales-order-report"],
  ["/purchase-orders/?tab=reports", "17-purchase-order-report"],
  ["/proforma-invoices/?tab=reports", "18-proforma-report"],
  ["/deliveries/?tab=reports", "19-delivery-report"],
  ["/payments/?tab=reports", "20-payments-report"],
  ["/finance/", "21-account-finance"],
  ["/expenses/?tab=reports", "22-expenses-report"],
  ["/investors/?tab=reports", "23-investors-report"],
  ["/profit-loss/", "24-profit-loss"],
  ["/company/?tab=reports", "25-company-report"],
  ["/settings/", "26-settings"],
];

test("every module page renders with demo data (desktop + phone)", async ({ page }) => {
  await resetEmulator();
  execSync("node scripts/seed-emulator.mjs", { stdio: "inherit" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  for (const [url, name] of PAGES) {
    await page.goto(url);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [url, name] of [["/", "30-phone-dashboard"], ["/quotations/", "31-phone-quotations"], ["/quotations/?tab=reports", "32-phone-quotation-report"]] as const) {
    await page.goto(url);
    await expect(page.locator("main h1")).toBeVisible();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
  await page.goto("/sales-orders/");
  await page.getByRole("row").nth(1).click();
  await expect(drawer(page)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/33-phone-sales-order.png` });
  expect(errors).toEqual([]);
});

// Runs after the render test, on its demo data.
const ROUTES = ["/", "/clients/", "/suppliers/", "/marketing/", "/rfqs/", "/quotations/", "/sales-orders/", "/purchase-orders/", "/proforma-invoices/", "/deliveries/", "/payments/", "/finance/", "/expenses/", "/investors/", "/profit-loss/", "/company/", "/settings/"];

test("no console errors on any page, report or record", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${page.url()} [${m.type()}] ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => problems.push(`${page.url()} [pageerror] ${e.message}`));
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@test.local");
  await page.getByLabel("Password").fill("test1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  for (const r of ROUTES) {
    await page.goto(r);
    await expect(page.locator("main h1")).toBeVisible();
    const reports = page.getByRole("button", { name: "Reports & graphs" });
    if (await reports.count()) await reports.click();
    await page.waitForTimeout(500);
    const records = page.getByRole("button", { name: /^Records/ });
    if (await records.count()) {
      await records.click();
      const firstRow = page.locator("main tbody tr").first();
      if (await firstRow.count()) {
        await firstRow.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.waitForTimeout(400);
      }
    }
  }
  expect(problems).toEqual([]);
});

/* Tools, expenses, documents, notifications, assistant, recap E2E.
 * Run the app with BETA_ALL_PRO=true so Pro sections are reachable.
 * Usage: BASE_URL=http://localhost:3000 SHOTS=/tmp/shots node e2e/modules.cjs
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: Boolean(cond) });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const vis = (l) => l.first().waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function makePng(file, rgb) {
  const w = 40, h = 30;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  const t = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

(async () => {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const email = `e2e-m-${stamp}@apprenticeos.test`;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: "Australia/Sydney" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const toolPng = path.join(SHOTS, "tool.png");
  const receiptPng = path.join(SHOTS, "receipt.png");
  makePng(toolPng, [220, 120, 30]);
  makePng(receiptPng, [240, 240, 240]);

  await page.goto(`${BASE}/signup`);
  await page.fill("#full_name", "Modules Tester");
  await page.fill("#email", email);
  await page.fill("#password", `Test-${stamp}-pw!`);
  await page.click("button[type=submit]");
  await page.waitForURL(/onboarding/);
  await page.fill("#start_date", "2025-02-03");
  await page.fill("#expected_completion_date", "2029-02-03");
  await page.click("button[type=submit]");
  await page.waitForURL(/dashboard/);

  /* ---------------------------------- Tools ---------------------------------- */
  await page.goto(`${BASE}/tools?new=1`);
  let dlg = page.getByRole("dialog");
  await dlg.locator('input[type=file][accept="image/*"]').setInputFiles(toolPng);
  await dlg.getByRole("button", { name: "Remove Add photo" }).waitFor({ timeout: 20000 });
  await dlg.locator("#tool-name").fill("18V hammer drill");
  await dlg.locator("#tool-brand").fill("Makita");
  await dlg.locator("#tool-serial").fill("SN-12345");
  await dlg.locator("#tool-price").fill("329.00");
  await dlg.locator("#tool-warranty").fill(daysFromNow(20));
  await dlg.getByRole("button", { name: "Save tool" }).click();
  await page.getByText("Tool added").waitFor();
  check("tool added with photo", await vis(page.locator("main img[alt='18V hammer drill']")));
  check("inventory value shown", await vis(page.getByText("$329.00").first()));
  check("warranty ending badge", await vis(page.getByText("Warranty ending")));
  await page.goto(`${BASE}/tools?q=SN-12345`);
  check("search by serial", await vis(page.getByText("18V hammer drill")));
  await page.getByText("18V hammer drill").first().click();
  await page.waitForURL(/\/tools\/[0-9a-f-]{36}/);
  await page.fill("#m-desc", "Test and tag");
  await page.fill("#m-cost", "15");
  await page.getByRole("button", { name: "Log maintenance" }).click();
  await page.getByText("Maintenance logged").waitFor();
  check("maintenance history", await vis(page.getByText("Test and tag")));
  await page.screenshot({ path: `${SHOTS}/m1-tool.png`, fullPage: true });

  /* --------------------------------- Expenses -------------------------------- */
  await page.goto(`${BASE}/expenses?new=1`);
  dlg = page.getByRole("dialog");
  await dlg.locator('input[type=file][accept="image/*,application/pdf"]').setInputFiles(receiptPng);
  await dlg.getByText("Receipt attached").waitFor({ timeout: 20000 });
  check("receipt uploaded", true);
  await dlg.locator("#ex-amount").fill("89.95");
  await dlg.locator("#ex-gst").fill("8.18");
  await dlg.locator("#ex-merchant").fill("Bunnings");
  await dlg.locator("#ex-desc").fill("Safety boots");
  await dlg.locator("#ex-cat").selectOption("ppe");
  await dlg.getByRole("button", { name: "Save expense" }).click();
  await page.getByText("Expense saved").waitFor();
  check("expense listed", await vis(page.locator("main").getByText("Bunnings")));
  check("month total", await vis(page.getByText("$89.95").first()));
  await page.locator("main").getByRole("button", { name: "Add expense" }).click();
  dlg = page.getByRole("dialog");
  await dlg.locator("#ex-amount").fill("10");
  await dlg.locator("#ex-gst").fill("20");
  await dlg.getByRole("button", { name: "Save expense" }).click();
  check("GST > total rejected", await vis(dlg.getByText("GST can't be more than the total")));
  await page.keyboard.press("Escape");
  const csv = await page.evaluate(async () => (await fetch(`/api/export/expenses?from=2020-01-01&to=2030-01-01&format=csv`)).text());
  check("expenses CSV export", csv.includes("Bunnings") && csv.includes("89.95"));
  const pdf = await page.evaluate(async () => { const r = await fetch(`/api/export/expenses?from=2020-01-01&to=2030-01-01&format=pdf`); return { s: r.status, t: r.headers.get("content-type") }; });
  check("expenses PDF export", pdf.s === 200 && pdf.t === "application/pdf");
  await page.screenshot({ path: `${SHOTS}/m2-expenses.png`, fullPage: true });

  /* -------------------------------- Documents -------------------------------- */
  await page.goto(`${BASE}/documents`);
  await page.getByRole("button", { name: "Add document" }).click();
  dlg = page.getByRole("dialog");
  await dlg.locator('input[type=file]').setInputFiles(toolPng);
  await dlg.getByText("tool.png").waitFor({ timeout: 20000 });
  await dlg.locator("#doc-title").fill("White Card");
  await dlg.locator("#doc-expires").fill(daysFromNow(30));
  await dlg.getByRole("button", { name: "Save" }).click();
  await page.getByText("Document saved").waitFor();
  check("document stored", await vis(page.locator("main").getByText("White Card")));
  check("expiring soon flagged", await vis(page.getByText(/^Expires /)));

  /* ------------------------------ Notifications ------------------------------ */
  await page.goto(`${BASE}/notifications`);
  check("document expiry alert", await vis(page.getByText("Expiring soon: White Card")));
  check("warranty alert", await vis(page.getByText("Warranty ending: 18V hammer drill")));
  await page.getByRole("button", { name: "Reminder", exact: true }).click();
  dlg = page.getByRole("dialog");
  await dlg.locator("#rem-title").fill("Hand timesheet to supervisor");
  await dlg.locator("#rem-due").fill(`${daysFromNow(1)}T09:00`);
  await dlg.getByRole("button", { name: "Set reminder" }).click();
  await page.getByText("Reminder set").waitFor();
  await page.reload();
  check("reminder becomes an alert", await vis(page.locator("main").getByText("Hand timesheet to supervisor").first()));
  await page.getByRole("button", { name: "Mark all read" }).click();
  await page.getByText("All caught up").waitFor();
  check("mark all read", true);
  await page.screenshot({ path: `${SHOTS}/m3-notifications.png`, fullPage: true });

  /* -------------------------------- Assistant -------------------------------- */
  await page.goto(`${BASE}/dashboard`);
  const navHasAi = await page.locator("aside nav").getByText("AI Assistant").count();
  await page.goto(`${BASE}/assistant`);
  const configured = !page.url().includes("/dashboard");
  if (!configured) {
    check("no-AI mode: assistant hidden from navigation", navHasAi === 0);
    check("no-AI mode: /assistant redirects to dashboard", page.url().includes("/dashboard"));
    const r = await page.evaluate(async () => { const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "hi" }) }); return { s: res.status }; });
    check("no-AI mode: chat API refuses cleanly", r.s === 503);
    await page.goto(`${BASE}/expenses?new=1`);
    check("no-AI mode: no receipt scanning promise", !(await page.getByText("We'll read the merchant").isVisible()));
    await page.keyboard.press("Escape");
    await page.goto(`${BASE}/`);
    check("no-AI mode: landing page doesn't mention AI", !(await page.locator("body").innerText()).includes("AI "));
  } else {
    await page.getByRole("textbox", { name: "Message" }).fill("In one sentence, what is an RCD?");
    await page.getByRole("button", { name: "Send" }).click();
    check("assistant streams an answer", await page.getByRole("button", { name: "Copy" }).first().waitFor({ timeout: 90000 }).then(() => true).catch(() => false));
  }
  await page.screenshot({ path: `${SHOTS}/m4-assistant.png`, fullPage: true });

  /* ---------------------------------- Recap ---------------------------------- */
  await page.goto(`${BASE}/recap`);
  check("recap page renders stats", await vis(page.getByText("Hours worked")));
  await page.screenshot({ path: `${SHOTS}/m5-recap.png`, fullPage: true });

  /* --------------------------------- Mobile ---------------------------------- */
  const m = await browser.newContext({ ...devices["iPhone 13"], storageState: await ctx.storageState(), timezoneId: "Australia/Sydney" });
  const mp = await m.newPage();
  for (const [p, n] of [["/tools", "m6-mobile-tools"], ["/expenses", "m7-mobile-expenses"], ["/assistant", "m8-mobile-assistant"]]) {
    await mp.goto(`${BASE}${p}`);
    await mp.waitForTimeout(800);
    await mp.screenshot({ path: `${SHOTS}/${n}.png` });
  }
  await m.close();

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed\naccount: ${email}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("E2E crashed:", e.message.split("\n").slice(0, 6).join("\n"));
  console.log(results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}`).join("\n"));
  process.exit(2);
});

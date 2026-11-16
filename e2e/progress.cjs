/* Apprenticeship progress E2E. Usage: BASE_URL=http://localhost:3000 SHOTS=/tmp/shots node e2e/progress.cjs */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: Boolean(cond) });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const isoDaysFromNow = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

(async () => {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const email = `e2e-p-${stamp}@apprenticeos.test`;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: "Australia/Sydney" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());

  await page.goto(`${BASE}/signup`);
  await page.fill("#full_name", "Progress Tester");
  await page.fill("#email", email);
  await page.fill("#password", `Test-${stamp}-pw!`);
  await page.click("button[type=submit]");
  await page.waitForURL(/onboarding/);
  await page.fill("#start_date", "2025-02-03");
  await page.fill("#expected_completion_date", "2029-02-03");
  await page.click("button[type=submit]");
  await page.waitForURL(/dashboard/);

  await page.goto(`${BASE}/progress`);
  check("progress page renders with rings", await page.getByText("time elapsed").isVisible());
  check("year shown", await page.getByText("2nd of 4").isVisible());
  check("disclaimer shown", await page.getByText(/isn't an official assessment/).isVisible());
  check("starter categories created", await page.getByText("Cabling & wiring").isVisible());

  // Add competency
  await page.getByRole("button", { name: "Competency", exact: true }).click();
  let dlg = page.getByRole("dialog");
  await dlg.locator("#comp-title").fill("Cable installation and termination");
  await dlg.locator("#comp-code").fill("UEECD0001");
  await dlg.locator("#comp-cat").selectOption({ label: "Cabling & wiring" });
  await dlg.getByText("This is a TAFE / training unit").click();
  await dlg.getByRole("button", { name: "Save" }).click();
  await page.getByText("Competency added").waitFor();
  check("competency added", await page.getByText("Cable installation and termination").isVisible());

  await page.getByRole("button", { name: "Competency", exact: true }).click();
  dlg = page.getByRole("dialog");
  await dlg.locator("#comp-title").fill("Switchboard wiring");
  await dlg.getByRole("button", { name: "Save" }).click();
  await page.getByText("Competency added").last().waitFor();

  // Status change inline
  await page.getByLabel("Status of Switchboard wiring").selectOption("learning");
  await page.waitForTimeout(1500);
  await page.reload();
  check("inline status change persists", (await page.getByLabel("Status of Switchboard wiring").inputValue()) === "learning");

  // Sign-off requires supervisor; then recorded
  await page.getByRole("button", { name: /Switchboard wiring/ }).first().click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Record sign-off" }).click();
  await dlg.getByRole("button", { name: "Save sign-off" }).click();
  check("sign-off without supervisor rejected", await dlg.getByText("Who signed it off?").isVisible({ timeout: 5000 }).catch(() => false) || await dlg.locator("#rec-sup:invalid").count() > 0);
  await dlg.locator("#rec-sup").fill("Sam Supervisor");
  await dlg.locator("#rec-lic").fill("EC12345");
  await dlg.getByRole("button", { name: "Save sign-off" }).click();
  await page.getByText("Sign-off recorded").first().waitFor();
  check("sign-off recorded", true);
  await page.keyboard.press("Escape");
  await page.reload();
  check("sign-off badge on list", await page.getByText("Sign-off recorded").first().isVisible());

  // Assessment due in 3 days → appears on dashboard + notification
  await page.getByRole("tab", { name: /Assessments/ }).click();
  await page.getByRole("button", { name: "Assessment", exact: true }).click();
  dlg = page.getByRole("dialog");
  await dlg.locator("#as-title").fill("Practical: switchboard assessment");
  await dlg.locator("#as-date").fill(isoDaysFromNow(3));
  await dlg.getByRole("button", { name: "Save" }).click();
  await page.getByText("Assessment added").waitFor();
  check("assessment listed", await page.getByText("Practical: switchboard assessment").isVisible());
  await page.goto(`${BASE}/dashboard`);
  check("assessment in dashboard Upcoming", await page.locator("main").getByText("Practical: switchboard assessment").first().isVisible());
  check("assessment notification generated", await page.locator("main").getByText(/Assessment due: Practical/).isVisible());

  // Goal + milestone
  await page.goto(`${BASE}/progress`);
  await page.getByRole("tab", { name: /Goals/ }).click();
  await page.getByRole("button", { name: "Goal", exact: true }).click();
  dlg = page.getByRole("dialog");
  await dlg.locator("#goal-title").fill("Terminate a three-phase motor confidently");
  await dlg.getByRole("button", { name: "Add goal" }).click();
  await page.getByText("Goal added").waitFor();
  await page.getByRole("button", { name: "Mark achieved" }).first().click();
  await page.getByText(/Goal achieved/).waitFor();
  check("goal achieved", true);
  await page.getByRole("tab", { name: "Timeline" }).click();
  check("timeline shows year markers", await page.getByText("Start of 2nd year").isVisible());
  await page.getByRole("button", { name: "Milestone" }).click();
  dlg = page.getByRole("dialog");
  await dlg.locator("#ms-title").fill("First solo fit-off");
  await dlg.getByRole("button", { name: "Add milestone" }).click();
  await page.getByText("Milestone added").waitFor();
  await page.getByRole("tab", { name: "Timeline" }).click();
  check("milestone on timeline", await page.getByText("First solo fit-off").isVisible());
  await page.getByRole("tab", { name: /Competencies/ }).click();
  await page.screenshot({ path: `${SHOTS}/p1-progress.png`, fullPage: true });

  // Diary → competency practice suggestion (explicit confirmation, never completed)
  await page.goto(`${BASE}/diary/new`);
  await page.fill("#raw_notes", "Ran and terminated cable for kitchen circuits.");
  await page.fill("#title", "Kitchen circuits");
  await page.fill("#skills", "Cable termination");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Save entry" }).click();
  await page.waitForURL(/\/diary\/[0-9a-f-]{36}/);
  const suggestion = page.getByLabel("Cable installation and termination");
  check("matching competency suggested", await suggestion.isVisible());
  check("unrelated competency not pre-suggested", !(await page.getByLabel("Switchboard wiring").isVisible().catch(() => false)));
  check("nothing logged until confirmed", !(await page.getByText("Logged as practice:").isVisible()));
  await suggestion.check();
  await page.getByRole("button", { name: "Log as practice" }).click();
  await page.getByText(/Practice logged for 1 competency/).waitFor();
  await page.reload();
  check("practice shown on entry", await page.getByText("Logged as practice:").isVisible());
  await page.goto(`${BASE}/progress`);
  const status = await page.getByLabel("Status of Cable installation and termination").inputValue();
  check("status moved to practised, not completed", status === "practised", status);

  // Mobile
  const m = await browser.newContext({ ...devices["iPhone 13"], storageState: await ctx.storageState(), timezoneId: "Australia/Sydney" });
  const mp = await m.newPage();
  await mp.goto(`${BASE}/progress`);
  await mp.screenshot({ path: `${SHOTS}/p2-mobile-progress.png`, fullPage: true });
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

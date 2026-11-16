/* End-to-end flow against a running app + real Supabase project.
 * Usage: BASE_URL=http://localhost:3000 SHOTS=/tmp/shots node e2e/flow.cjs
 * Creates two throwaway accounts (e2e-*@apprenticeos.test). Requires email confirmation off.
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const PARRAMATTA = { latitude: -33.8151, longitude: 151.0011, accuracy: 15 };

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function signUp(page, email, password, name) {
  await page.goto(`${BASE}/signup`);
  await page.fill("#full_name", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/onboarding/, { timeout: 30000 });
}

async function onboard(page) {
  await page.fill("#full_name", "Jordan Test");
  await page.selectOption("#trade", "electrical");
  await page.selectOption("#state", "NSW");
  await page.fill("#employer_name", "Sparky Co Pty Ltd");
  await page.fill("#qualification", "Certificate III in Electrotechnology");
  await page.fill("#start_date", "2025-02-03");
  await page.fill("#expected_completion_date", "2029-02-03");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
}

(async () => {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const userA = { email: `e2e-a-${stamp}@apprenticeos.test`, password: `Test-${stamp}-pw!` };
  const userB = { email: `e2e-b-${stamp}@apprenticeos.test`, password: `Test-${stamp}-pw!` };
  const consoleErrors = [];

  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    geolocation: PARRAMATTA,
    permissions: ["geolocation"],
    timezoneId: "Australia/Sydney",
    locale: "en-AU",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource.*404/.test(m.text())) consoleErrors.push(m.text());
  });

  // 1. Sign up + onboarding
  await signUp(page, userA.email, userA.password, "Jordan Test");
  check("sign up redirects to onboarding", page.url().includes("/onboarding"));
  await onboard(page);
  check("onboarding lands on dashboard", page.url().includes("/dashboard"));
  check("dashboard greets user", await page.getByRole("heading", { name: /Good (morning|afternoon|evening), Jordan/ }).isVisible());
  check("apprenticeship year shown", await page.locator("main").getByText(/2nd-year electrical apprentice/).isVisible());
  await page.screenshot({ path: `${SHOTS}/01-dashboard-empty.png`, fullPage: true });

  // 2. Clock in with GPS
  const main = page.locator("main");
  await main.getByRole("button", { name: "Clock in" }).click();
  await main.getByText(/Clocked in .* ·/).waitFor({ timeout: 30000 });
  check("clock in shows live session", await main.getByText("On the clock").first().isVisible());
  await page.waitForTimeout(1500);
  const timer1 = await main.locator(".font-mono").first().textContent();
  await page.waitForTimeout(2200);
  const timer2 = await main.locator(".font-mono").first().textContent();
  check("live timer ticks", timer1 !== timer2, `${timer1} → ${timer2}`);
  check("GPS badge shown", await main.getByText("GPS detected").isVisible());
  check("accuracy shown", await main.getByText(/±15 m · good/).isVisible());
  const addrVisible = await main.getByText(/Approx\. .*NSW/).isVisible().catch(() => false);
  check("reverse-geocoded address shown", addrVisible, addrVisible ? (await main.getByText(/Approx\. .*NSW/).textContent()) : "no address (geocoder?)");
  await page.screenshot({ path: `${SHOTS}/02-dashboard-clocked-in.png`, fullPage: true });

  // 3. Double clock-in is impossible: the button is replaced; server also guards (DB unique index tested separately)
  check("no second clock-in button while active", (await main.getByRole("button", { name: "Clock in" }).count()) === 0);

  // 4. Break
  await main.getByRole("button", { name: "Break" }).click();
  await main.getByText(/On break/).waitFor({ timeout: 15000 });
  check("break started", true);
  await page.waitForTimeout(1500);
  await main.getByRole("button", { name: "End break" }).click();
  await main.getByText("On the clock").first().waitFor({ timeout: 15000 });
  check("break ended", true);

  // 5. Save as job site
  await main.getByRole("button", { name: /Save as job site/ }).click();
  await page.fill("#site-name", "Parramatta Fit-out");
  await page.getByRole("button", { name: "Save job site" }).click();
  await main.getByText("Parramatta Fit-out").waitFor({ timeout: 15000 });
  check("session saved as job site", true);

  // 6. Correct address
  await main.getByRole("button", { name: /Correct address|Add address/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("input").fill("1 Example St, Parramatta NSW 2150");
  await dlg.getByRole("button", { name: "Save address" }).click();
  await main.getByText("Entered manually").waitFor({ timeout: 15000 });
  check("address correction marks manual", true);

  // 7. Clock out → summary + diary prompt
  await main.getByRole("button", { name: "Clock out" }).click();
  const summary = page.getByRole("dialog", { name: "Clocked out" });
  await summary.waitFor({ timeout: 30000 });
  check("clock-out summary shown", await summary.isVisible());
  check("diary prompt offered", await summary.getByRole("link", { name: /Add diary entry/ }).isVisible());
  await page.screenshot({ path: `${SHOTS}/03-clocked-out.png` });
  await summary.getByRole("button", { name: "Later" }).click();

  // 8. Clock in again at the same place → site recognised automatically
  await main.getByRole("button", { name: "Clock in" }).click();
  await main.getByText(/Clocked in .* ·/).waitFor({ timeout: 30000 });
  check("saved job site auto-recognised on next clock-in", await main.getByText("Parramatta Fit-out").first().isVisible());
  await main.getByRole("button", { name: "Clock out" }).click();
  await page.getByRole("dialog", { name: "Clocked out" }).waitFor({ timeout: 30000 });
  await page.getByRole("dialog", { name: "Clocked out" }).getByRole("button", { name: "Later" }).click();

  // 9. Manual session + overlap guard
  await page.goto(`${BASE}/timesheets`);
  await page.getByRole("button", { name: "Add manually" }).click();
  const d = page.getByRole("dialog");
  await d.locator("#start_local").fill("2026-11-10T07:00");
  await d.locator("#end_local").fill("2026-11-10T15:30");
  await d.locator("#break_minutes").fill("30");
  await d.getByRole("button", { name: "Save session" }).click();
  await page.getByText("Session added").waitFor({ timeout: 15000 });
  check("manual session saved", true);
  await page.getByRole("button", { name: "Add manually" }).click();
  const d2 = page.getByRole("dialog");
  await d2.locator("#start_local").fill("2026-11-10T09:00");
  await d2.locator("#end_local").fill("2026-11-10T10:00");
  await d2.getByRole("button", { name: "Save session" }).click();
  check("overlapping session rejected", await d2.getByText(/overlaps another session/i).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
  await page.keyboard.press("Escape");

  // 10. Week view of that week: 8h worked (8.5h - 30m)
  await page.goto(`${BASE}/timesheets?view=week&week=2026-11-10`);
  check("week view shows 8h for manual day", await page.getByText("8h", { exact: true }).first().isVisible());
  check("week total shows overtime split", await page.getByText("Overtime").first().isVisible());
  await page.waitForSelector(".recharts-bar-rectangle path", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/04-timesheet-week.png`, fullPage: true });

  // 11. Edit with reason → history
  await page.getByRole("link", { name: /7:00 am – 3:30 pm/i }).first().click();
  await page.waitForURL(/\/timesheets\/[0-9a-f-]{36}/);
  await page.fill("#end_local", "2026-11-10T16:00");
  await page.fill("#change_reason", "Stayed back to finish testing");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Session updated").waitFor({ timeout: 15000 });
  await page.reload();
  check("audit history records edit with reason", await page.getByText("“Stayed back to finish testing”").isVisible());
  check("audit shows finish change", await page.getByText(/Finish: .*3:30 pm → /i).isVisible());
  await page.screenshot({ path: `${SHOTS}/05-session-detail.png`, fullPage: true });

  // 12. Month + trends render
  await page.goto(`${BASE}/timesheets?view=month&month=2026-11&day=2026-11-10`);
  check("month view day detail", await page.getByText("Tuesday 10 November").isVisible());
  await page.screenshot({ path: `${SHOTS}/06-timesheet-month.png`, fullPage: true });
  await page.goto(`${BASE}/timesheets?view=trends`);
  check("trends render", await page.getByText("Weekly hours").isVisible());

  // 13. CSV export
  const csv = await page.request.get(`${BASE}/api/export/timesheets?from=2026-11-09&to=2026-11-16&format=csv`);
  const csvText = await csv.text();
  check("CSV export works", csv.ok() && csvText.includes("Hours worked") && csvText.includes("8.50"), `status ${csv.status()}`);
  const pdf = await page.request.get(`${BASE}/api/export/timesheets?from=2026-11-09&to=2026-11-16&format=pdf`);
  check("PDF export gated on Free plan", pdf.status() === 402);

  // 14. Job sites + settings pages render
  await page.goto(`${BASE}/job-sites`);
  check("job site listed with sessions", await page.getByText(/2 sessions/).isVisible());
  for (const p of ["/settings", "/settings/work", "/settings/employers", "/settings/notifications", "/settings/plan", "/settings/data"]) {
    const r = await page.goto(`${BASE}${p}`);
    check(`renders ${p}`, r && r.ok());
  }
  const exp = await page.request.get(`${BASE}/api/export/all`);
  const json = await exp.json();
  check("full data export includes sessions", exp.ok() && json.work_sessions.length === 3, `sessions=${json.work_sessions?.length}`);

  // 15. Mobile layout
  const mctx = await browser.newContext({ ...devices["iPhone 13"], geolocation: PARRAMATTA, permissions: ["geolocation"], timezoneId: "Australia/Sydney", storageState: await ctx.storageState() });
  const m = await mctx.newPage();
  await m.goto(`${BASE}/dashboard`);
  await m.screenshot({ path: `${SHOTS}/07-mobile-dashboard.png` });
  await m.getByRole("button", { name: "Clock in" }).last().click();
  await m.getByRole("dialog").waitFor();
  await m.screenshot({ path: `${SHOTS}/08-mobile-clock-sheet.png` });
  await m.goto(`${BASE}/timesheets`);
  await m.screenshot({ path: `${SHOTS}/09-mobile-timesheets.png` });
  await mctx.close();

  // 16. Dark mode screenshot
  const dctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: "dark", timezoneId: "Australia/Sydney", storageState: await ctx.storageState() });
  const dp = await dctx.newPage();
  await dp.goto(`${BASE}/timesheets?view=week&week=2026-11-10`);
  await dp.waitForSelector(".recharts-bar-rectangle path", { timeout: 10000 }).catch(() => {});
  await dp.waitForTimeout(600);
  await dp.screenshot({ path: `${SHOTS}/10-dark-timesheets.png` });
  await dctx.close();

  // 17. Isolation: user B sees none of A's data
  const bctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const b = await bctx.newPage();
  await signUp(b, userB.email, userB.password, "Other Person");
  await onboard(b);
  await b.goto(`${BASE}/timesheets?view=week&week=2026-11-10`);
  check("user B cannot see user A's sessions", !(await b.getByText("7:00 am – 4:00 pm").isVisible().catch(() => false)));
  await b.goto(`${BASE}/job-sites`);
  check("user B cannot see user A's job sites", !(await b.getByText("Parramatta Fit-out").isVisible().catch(() => false)));
  const bExport = await (await b.request.get(`${BASE}/api/export/all`)).json();
  check("user B export contains no A rows", bExport.work_sessions.length === 0 && bExport.job_sites.length === 0);
  await bctx.close();

  // 18. Signed-out access blocked
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  const r = await ap.request.get(`${BASE}/api/export/all`);
  check("signed-out export rejected", r.status() === 401);
  await anon.close();

  check("no console/page errors", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`accounts: ${userA.email}, ${userB.email}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("E2E crashed:", e.message);
  console.log(results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}`).join("\n"));
  process.exit(2);
});

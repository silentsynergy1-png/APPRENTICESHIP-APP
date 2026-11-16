/* Work diary E2E: session-linked entry, photo upload, search, calendar, offline draft sync.
 * Usage: BASE_URL=http://localhost:3000 SHOTS=/tmp/shots node e2e/diary.cjs
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

/** Tiny valid PNG (solid colour) so the upload path is exercised without fixtures. */
function makePng(file) {
  const w = 64, h = 48;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([47, 111, 235], y * (w * 3 + 1) + 1 + x * 3);
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

(async () => {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const email = `e2e-d-${stamp}@apprenticeos.test`;
  const password = `Test-${stamp}-pw!`;
  const errors = [];
  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    geolocation: { latitude: -33.8076, longitude: 150.9878, accuracy: 20 },
    permissions: ["geolocation"],
    timezoneId: "Australia/Sydney",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/signup`);
  await page.fill("#full_name", "Diary Tester");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/onboarding/);
  await page.fill("#start_date", "2025-02-03");
  await page.fill("#expected_completion_date", "2029-02-03");
  await page.fill("#employer_name", "Westside Electrical");
  await page.click("button[type=submit]");
  await page.waitForURL(/dashboard/);

  // Clock in + out, then follow the diary prompt.
  const main = page.locator("main");
  await main.getByRole("button", { name: "Clock in" }).click();
  await main.getByText(/Clocked in .* ·/).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  await main.getByRole("button", { name: "Clock out" }).click();
  const summary = page.getByRole("dialog", { name: "Clocked out" });
  await summary.waitFor({ timeout: 30000 });
  await summary.getByRole("link", { name: /Add diary entry/ }).click();
  await page.waitForURL(/\/diary\/new\?session=/);
  check("diary prompt opens a session-linked entry", await page.getByText("Linked session").isVisible());
  check("employer prefilled from session", (await page.locator("#employer_id option:checked").textContent()) === "Westside Electrical");
  check("AI button gated for Free plan", await page.getByRole("link", { name: /Improve with AI/ }).isVisible());

  await page.fill("#raw_notes", "Helped install lights, ran cable through ceiling, drilled holes and assisted electrician with testing.");
  await page.fill("#title", "Lighting install, upstairs");
  await page.fill("#tasks", "Ran cable through ceiling");
  await page.keyboard.press("Enter");
  await page.fill("#skills", "Cable installation, Testing");
  await page.keyboard.press("Enter");
  await page.fill("#lessons_learned", "Check the cable route before drilling joists.");
  await page.screenshot({ path: `${SHOTS}/d1-new-entry.png`, fullPage: true });
  await page.getByRole("button", { name: "Save entry" }).click();
  await page.waitForURL(/\/diary\/[0-9a-f-]{36}\?new=1/, { timeout: 20000 });
  check("entry saved", await page.getByRole("heading", { name: "Lighting install, upstairs" }).isVisible());
  check("chips saved", await page.getByText("Cable installation").isVisible() && await page.getByText("Testing", { exact: true }).isVisible());

  // Photo upload to private storage
  const png = path.join(SHOTS, "test-photo.png");
  makePng(png);
  await page.locator('input[type=file][multiple]').setInputFiles(png);
  await page.getByText("1 file added").waitFor({ timeout: 30000 });

  const img = page.locator("main img").first();
  await img.waitFor({ timeout: 15000 });
  const src = await img.getAttribute("src");
  check("photo uploaded and shown via signed URL", src && src.includes("/storage/v1/object/sign/user-files/"), src ? src.slice(0, 80) : "");
  const probe = (url) => page.evaluate(async (u) => { const r = await fetch(u); return { ok: r.ok, status: r.status, type: r.headers.get("content-type") || "" }; }, url);
  const imgRes = await probe(src);
  check("signed URL serves the image", imgRes.ok && imgRes.type.startsWith("image/"));
  const publicTry = await probe(src.replace("/object/sign/", "/object/public/").replace(/\?.*$/, ""));
  check("file is NOT publicly accessible", !publicTry.ok, `public status ${publicTry.status}`);
  await page.screenshot({ path: `${SHOTS}/d2-entry-with-photo.png`, fullPage: true });

  // Search + calendar + photos view
  await page.goto(`${BASE}/diary?q=ceiling`);
  check("full-text search finds entry", await page.getByText("Lighting install, upstairs").isVisible());
  await page.goto(`${BASE}/diary?q=plumbing`);
  check("search excludes non-matching", await page.getByText("No matching entries").isVisible());
  await page.goto(`${BASE}/diary?view=calendar`);
  check("calendar shows entry", await page.getByText("Lighting install, upstairs").first().isVisible());
  await page.goto(`${BASE}/diary?view=photos`);
  check("photo timeline shows photo", (await page.locator("main img").count()) >= 1);

  // Offline draft → queued → synced exactly once
  await page.goto(`${BASE}/diary/new?date=2026-11-12`);

  await ctx.setOffline(true);
  await page.getByText("You're offline").waitFor({ timeout: 10000 });
  check("offline banner shown on diary form", true);
  await page.fill("#raw_notes", "Offline entry: fitted off switches in unit 4.");
  await page.fill("#title", "Offline fit-off");
  await page.getByRole("button", { name: "Save entry" }).click();
  await page.getByText("Saved on this device", { exact: true }).waitFor({ timeout: 10000 });
  check("offline save queues on device (not claimed as saved to server)", true);
  await page.waitForTimeout(500);
  const queued = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("apprentice-os");
    r.onsuccess = () => { const tx = r.result.transaction("diary-drafts", "readonly"); const c = tx.objectStore("diary-drafts").count(); c.onsuccess = () => res(c.result); };
    r.onerror = () => res(-1);
  }));
  check("draft stored in IndexedDB", queued === 1, `count=${queued}`);
  await ctx.setOffline(false);
  await page.goto(`${BASE}/diary`);
  await page.getByText(/offline diary entry synced/).waitFor({ timeout: 20000 }).catch(() => {});
  await page.reload();
  const count = await page.getByText("Offline fit-off").count();
  check("offline draft synced exactly once", count === 1, `found ${count}`);
  const left = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("apprentice-os");
    r.onsuccess = () => { const tx = r.result.transaction("diary-drafts", "readonly"); const c = tx.objectStore("diary-drafts").count(); c.onsuccess = () => res(c.result); };
  }));
  check("draft removed from device after server confirmed", left === 0);

  // Mobile render
  const m = await browser.newContext({ ...devices["iPhone 13"], storageState: await ctx.storageState(), timezoneId: "Australia/Sydney" });
  const mp = await m.newPage();
  await mp.goto(`${BASE}/diary`);
  await mp.screenshot({ path: `${SHOTS}/d3-mobile-diary.png` });
  await mp.goto(`${BASE}/diary/new`);
  await mp.screenshot({ path: `${SHOTS}/d4-mobile-new.png` });
  await m.close();

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed\naccount: ${email}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("E2E crashed:", e.message.split("\n").slice(0, 6).join("\n"));
  process.exit(2);
});

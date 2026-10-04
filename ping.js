const { chromium } = require('playwright');

// ─────────────────────────────────────────────────────────────────────────────
// SELF-RENEWING PINGER
//
// Before: one workflow run = one visit, so a visit only happened when something
// outside (cron-job.org / GitHub's schedule) managed to start the workflow.
// When that outside trigger skipped, nothing ran and no alert was sent.
//
// Now: ONE workflow run keeps visiting every site over and over for LOOP_SECONDS
// (default 20 minutes), then ping.yml starts the next run by itself. The chain
// no longer depends on any outside scheduler. cron-job.org and the GitHub
// schedule remain only as backups that restart the chain if it ever breaks.
//
// To ping something else later, add a line to TARGETS.
//   every:  seconds between visits to that address
//   expect: optional text the page must contain; the visit counts as failed if
//           it is missing (used to notice when the host's check page was
//           returned instead of the real answer)
// ─────────────────────────────────────────────────────────────────────────────
const LOOP_SECONDS = Math.max(0, parseInt(process.env.LOOP_SECONDS || '1200', 10));

const TARGETS = [
  // Dezloh: runs the notification sweep (paid orders, bank transfers, plan changes)
  // and pushes the alerts to phones, even when no seller has a page open.
  // src=cron tells dz_push.php "this is the background check", so it pushes
  // BEFORE it replies. Visited every 30 s so a payment is never kept waiting.
  { name: 'Dezloh notification sweep', url: 'https://dezloh.com/dz_push.php?action=sweep&src=cron', expect: '"ok":true', every: 30 },

  // Daitah: data & airtime auto-recharge
  { name: 'Daitah data/airtime cron', url: 'https://www.daitah.win/auto_recharge_cron.php', every: 60 },

  // Daitah: electricity auto-recharge
  { name: 'Daitah electricity cron', url: 'https://www.daitah.win/auto_electricity_cron.php', every: 60 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

(async () => {
  const endAt = Date.now() + LOOP_SECONDS * 1000;
  const browser = await chromium.launch();
  const state = TARGETS.map((target) => ({ target, nextAt: 0, context: null, visits: 0 }));
  let okCount = 0;
  let failCount = 0;

  // One visit to one address. Never throws, so one bad site can't stop the others.
  async function visit(s) {
    const t = s.target;
    const tag = `[${stamp()}] [${t.name}]`;
    let page;
    try {
      // The browser context is kept between visits, so the host's JavaScript check
      // is solved once and its cookie is reused (fewer requests to the host).
      if (!s.context) s.context = await browser.newContext();
      page = await s.context.newPage();
      const res = await page.goto(t.url, { waitUntil: 'networkidle', timeout: 30000 });
      const html = await page.content();
      const status = res ? res.status() : 'no response';
      s.visits++;

      if (t.expect && !html.includes(t.expect)) {
        failCount++;
        console.error(`${tag} FAILED - status ${status}, page did not contain ${t.expect}. The host may have returned its check page. Body: ${html.slice(0, 300)}`);
        // Start fresh next time in case the host's cookie went stale.
        await s.context.close().catch(() => {});
        s.context = null;
      } else {
        okCount++;
        // Full detail on the first visit of each site, one short line after that.
        console.log(s.visits === 1
          ? `${tag} OK - status ${status}. Body: ${html.slice(0, t.bodyChars || 300)}`
          : `${tag} OK - status ${status}`);
      }
    } catch (err) {
      failCount++;
      console.error(`${tag} FAILED: ${err.message}`);
      if (s.context) { await s.context.close().catch(() => {}); s.context = null; }
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  console.log(`Pinger started: ${TARGETS.length} sites, looping for ${LOOP_SECONDS}s.`);

  let round = 0;
  while (true) {
    for (const s of state) {
      const now = Date.now();
      if (now < s.nextAt) continue;                 // not due yet
      if (round > 0 && now >= endAt) continue;      // time is up (the first round always runs)
      s.nextAt = now + s.target.every * 1000;       // next visit counted from the start of this one
      await visit(s);
    }
    round++;
    if (Date.now() >= endAt) break;
    const nextDue = Math.min(endAt, ...state.map((s) => s.nextAt));
    await sleep(Math.max(500, nextDue - Date.now()));
  }

  for (const s of state) if (s.context) await s.context.close().catch(() => {});
  await browser.close();

  console.log(`Pinger finished: ${okCount} visits OK, ${failCount} failed.`);
  // Red run only when NOTHING worked in the whole run (site down / blocked).
  // A single slow visit no longer turns the whole run red.
  if (okCount === 0 && failCount > 0) process.exit(1);
})().catch((err) => {
  console.error('Pinger crashed:', err);
  process.exit(2);
});

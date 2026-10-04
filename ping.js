const { chromium } = require('playwright');

// Every endpoint this workflow pings. A real browser is used (same as before)
// so the host's JavaScript check is passed on each site.
//
// To ping something else later, just add a line here.
const TARGETS = [
  // Daitah — data & airtime auto-recharge (unchanged from before)
  { name: 'Daitah data/airtime cron', url: 'https://www.daitah.win/auto_recharge_cron.php' },
  // Daitah — electricity auto-recharge (new)
  { name: 'Daitah electricity cron',  url: 'https://www.daitah.win/auto_electricity_cron.php' },
  // Dezloh — runs the notification sweep: turns new paid orders / bank transfers into
  // in-app alerts + push notifications, even when no seller has a page open.
  // (Replaces the old https://dezloh.com/cron.php, which did not exist.)
  { name: 'Dezloh notification sweep', url: 'https://dezloh.com/dz_push.php?action=sweep' },
];

(async () => {
  const browser = await chromium.launch();
  let failures = 0;

  // Each target gets its own fresh browser context and its own try/catch, so a
  // slow or failing site can never stop the others from being pinged.
  for (const target of TARGETS) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const res = await page.goto(target.url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      console.log(`[${target.name}] Status:`, res ? res.status() : 'no response');
      console.log(`[${target.name}] Body:`, (await page.content()).slice(0, 300));
    } catch (err) {
      failures++;
      console.error(`[${target.name}] FAILED:`, err.message);
    } finally {
      await context.close();
    }
  }

  await browser.close();

  // Still turns the workflow red if any ping failed, but only after every
  // site has had its turn.
  if (failures > 0) process.exit(1);
})();

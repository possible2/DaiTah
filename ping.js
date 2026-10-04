const { chromium } = require('playwright');

// Every endpoint this workflow pings. A real browser is used (same as before)
// so the host's JavaScript check is passed on each site.
//
// To ping something else later, just add a line here.
// Optional field:  expect: 'text'  -> the run is marked failed if the page does
// not contain that text (used to notice when a host's check page was returned
// instead of the real answer). Targets without it behave exactly as before.
const TARGETS = [
  // Daitah — data & airtime auto-recharge (unchanged from before)
  { name: 'Daitah data/airtime cron', url: 'https://www.daitah.win/auto_recharge_cron.php' },
  // Daitah — electricity auto-recharge (new)
  { name: 'Daitah electricity cron',  url: 'https://www.daitah.win/auto_electricity_cron.php' },
  // Dezloh — runs the notification sweep: turns new paid orders / bank transfers into
  // in-app alerts + push notifications, even when no seller has a page open.
  // src=cron tells dz_push.php "this is the background check" (it shows green in
  // Notifications -> Check my notifications). expect makes a blocked/blank answer visible.
  { name: 'Dezloh notification sweep', url: 'https://dezloh.com/dz_push.php?action=sweep&src=cron', expect: '"ok":true' },
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
      const html = await page.content();
      console.log(`[${target.name}] Status:`, res ? res.status() : 'no response');
      console.log(`[${target.name}] Body:`, html.slice(0, 300));

      if (target.expect) {
        if (html.includes(target.expect)) {
          console.log(`[${target.name}] Check: OK (found ${target.expect})`);
        } else {
          failures++;
          console.error(`[${target.name}] Check: FAILED - the page did not contain ${target.expect}. The host may be showing its browser-check page instead of the real answer.`);
        }
      }
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

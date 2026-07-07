const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const res = await page.goto('https://www.daitah.win/auto_recharge_cron.php', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('Status:', res.status());
  console.log('Body:', (await page.content()).slice(0, 300));
  await browser.close();
})();

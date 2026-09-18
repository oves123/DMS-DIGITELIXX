import puppeteer from "puppeteer";
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on("console", msg => console.log("PAGE LOG:", msg.text()));
  page.on("requestfailed", request => {
    console.log("REQUEST FAILED:", request.url(), request.failure().errorText);
  });
  await page.goto("https://dms-digitelixx-web.pages.dev/");
  
  await page.waitForSelector("input[type=text]");
  await page.type("input[type=text]", "8828807773");
  await page.type("input[type=password]", "password123");
  
  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes("/api/auth/login"), { timeout: 10000 }).catch(e => console.log("Response wait timeout")),
    page.click("button[type=submit]")
  ]);
  
  if (response) {
    console.log("RESPONSE STATUS:", response.status());
    console.log("RESPONSE HEADERS:", response.headers());
  }
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();

import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
const font = await readFile(
  new URL(
    "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
    import.meta.url,
  ),
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<!doctype html><style>@font-face{font-family:plex;src:url(data:font/woff2;base64,${font.toString("base64")})}*{box-sizing:border-box}body{margin:0;background:#101411;color:#f0f3e9;font-family:plex,monospace;padding:64px}header{display:flex;align-items:center;gap:18px;font-size:24px}header img{width:52px;height:52px}h1{font-weight:500;font-size:76px;line-height:1.15;letter-spacing:-4px;margin:70px 0 22px;max-width:900px}p{color:#a8b3a7;font-size:28px}footer{border-top:1px solid #4e5c50;margin-top:55px;padding-top:24px;color:#c4f56f;font-size:20px;display:flex;justify-content:space-between}</style><header><img src="data:image/svg+xml;base64,${(await readFile(new URL("../public/favicon.svg", import.meta.url))).toString("base64")}">Forecast Bounty</header><h1>Forecast the number.</h1><p>Closest guess takes the bounty.</p><footer><span>Fully refundable bonds.</span><span>Verifiable onchain.</span></footer>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await mkdir(new URL("../public/", import.meta.url), { recursive: true });
  await page.screenshot({
    path: new URL("../public/share.png", import.meta.url).pathname,
  });
} finally {
  await browser.close();
}

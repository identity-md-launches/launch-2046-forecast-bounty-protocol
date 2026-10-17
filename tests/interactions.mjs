import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { decodeFunctionData } from "viem";
import { fixture, injectWallet } from "./fixtures.mjs";
const dist = resolve("dist"),
  out = resolve("test/scratch/interaction");
await mkdir(out, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = resolve(
      dist,
      pathname.replace(/^\/preview\//, "") || "index.html",
    );
    if (!file.startsWith(dist + "/")) throw Error();
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const results = [];
const browsers = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
    console.error(`FAIL ${name}: ${e.message}`);
  }
}
const visible = async (page, text) => {
  await page.getByText(text, { exact: true }).waitFor({ timeout: 15000 });
};
async function overflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Horizontal overflow",
  );
}
async function setup(
  browser,
  {
    deployed = false,
    wallet = false,
    chain = "0x1",
    reject = false,
    mobile = false,
    eipOnly = false,
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...(mobile
      ? {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
        }
      : {}),
  });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  const f = await fixture();
  if (wallet) await injectWallet(page, { chain, reject, hash: f.hash });
  if (eipOnly)
    await page.addInitScript(() => {
      delete window.ethereum;
    });
  if (deployed) {
    await page.route("**/forecast.config.json", (route) =>
      route.fulfill({ json: f.config }),
    );
    await page.route(f.config.chain.rpcUrl, async (route) => {
      const body = route.request().postDataJSON();
      try {
        const result = Array.isArray(body)
          ? await Promise.all(body.map(f.rpc))
          : await f.rpc(body);
        await route.fulfill({ json: result });
      } catch (e) {
        errors.push(e.message);
        await route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32603, message: e.message },
          },
        });
      }
    });
  }
  await page.goto(url);
  await page.getByRole("heading", { name: "Forecast the number." }).waitFor();
  return { context, page, f, errors, requests };
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Test browser wallet" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
try {
  const chromiumBrowser = await chromium.launch({ headless: true });
  browsers.push(chromiumBrowser);
  for (const engine of ["Chromium", "WebKit"]) {
    let browser = chromiumBrowser;
    if (engine === "WebKit") {
      try {
        browser = await webkit.launch({ headless: true });
        browsers.push(browser);
      } catch (e) {
        results.push({
          name: "WebKit availability",
          passed: null,
          skipped: true,
          error:
            "WebKit could not launch because its runtime dependencies are unavailable.",
        });
        console.log("SKIP WebKit: runtime dependencies unavailable");
        continue;
      }
    }
    await check(
      `${engine}: production subpath, mobile/desktop reflow, metadata and no fabricated numbers`,
      async () => {
        const { context, page, errors, f, requests } = await setup(browser);
        const external = [];
        page.on("request", (r) => {
          if (r.url().startsWith(f.config.chain.rpcUrl)) external.push(r.url());
        });
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await overflow(page);
          await page.screenshot({
            path: `${out}/${engine.toLowerCase()}-${width}.png`,
            fullPage: true,
          });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        const rect = await page
          .getByRole("button", { name: "Create a bounty", exact: true })
          .boundingBox();
        assert.ok(rect.y + rect.height < 844);
        assert.ok((await page.locator(".board").boundingBox()).y < 844);
        assert.equal(
          /\d/.test(await page.locator("main").innerText()),
          false,
          "No numbers while undeployed",
        );
        for (const selector of [
          "title",
          "link[rel=icon]",
          "meta[name=description]",
          'meta[property="og:title"]',
          'meta[property="og:image"]',
        ])
          assert.equal(await page.locator(selector).count(), 1);
        const card = await page.request.get(
          new URL(
            await page
              .locator('meta[property="og:image"]')
              .getAttribute("content"),
            url,
          ).href,
        );
        assert.equal(card.status(), 200);
        assert.deepEqual(external, []);
        assert.equal(
          requests.some((u) => u.startsWith(f.config.chain.rpcUrl)),
          false,
        );
        assert.deepEqual(errors, []);
        await context.close();
      },
    );
    await check(
      `${engine}: draft, filters, routes and keyboard dialog return`,
      async () => {
        const { context, page } = await setup(browser);
        await page
          .getByRole("button", { name: "Resolved", exact: true })
          .click();
        assert.equal(
          await page
            .getByRole("button", { name: "Resolved", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
        await page.getByLabel("Sort", { exact: true }).selectOption("reward");
        const create = page.getByRole("button", {
          name: "Create a bounty",
          exact: true,
        });
        await create.click();
        await page
          .getByLabel("Question", { exact: true })
          .fill("A draft with a clear numeric unit");
        assert.equal(
          await page
            .getByRole("button", { name: "Review transaction" })
            .isDisabled(),
          true,
        );
        await page.keyboard.press("Escape");
        assert.equal(
          await create.evaluate((el) => el === document.activeElement),
          true,
        );
        await page
          .getByRole("link", { name: "My positions", exact: true })
          .click();
        await visible(page, "Your forecasts belong here.");
        await page
          .getByRole("link", { name: "How it works", exact: true })
          .click();
        await visible(page, "Your bond comes back.");
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .click();
        assert.equal(
          await page
            .getByRole("button", { name: "Coinbase Wallet", exact: true })
            .count(),
          1,
        );
        await page.keyboard.press("Escape");
        await context.close();
      },
    );
  }
  await check(
    "Accessibility: axe on home, create, wallet, positions and guide",
    async () => {
      const { context, page } = await setup(chromiumBrowser);
      const audit = async (name) => {
        const r = await new AxeBuilder({ page }).analyze();
        assert.deepEqual(
          r.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target),
          })),
          [],
          name,
        );
      };
      await audit("home");
      await page
        .getByRole("button", { name: "Create a bounty", exact: true })
        .click();
      await audit("create");
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await audit("wallet");
      await page.keyboard.press("Escape");
      await page
        .getByRole("link", { name: "My positions", exact: true })
        .click();
      await audit("positions");
      await page.locator(".skip-link").focus();
      await page.keyboard.press("Enter");
      assert.equal(new URL(page.url()).hash, "#positions");
      assert.equal(
        await page
          .locator("main")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page
        .getByRole("link", { name: "How it works", exact: true })
        .click();
      await audit("guide");
      await context.close();
    },
  );
  await check("Mobile wallet links and Coinbase Smart Wallet", async () => {
    const { context, page } = await setup(chromiumBrowser, { mobile: true });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"]) {
      const link = page.getByRole("link", {
        name: `Open in ${name}`,
        exact: true,
      });
      assert.equal(await link.count(), 1);
      assert.ok((await link.getAttribute("href")).includes("127.0.0.1"));
    }
    assert.equal(
      await page
        .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Browser wallet", exact: true })
        .count(),
      0,
    );
    await page.screenshot({
      path: `out/mobile-wallet.png`.replace("out/", `${out}/`),
    });
    await overflow(page);
    await context.close();
  });
  await check(
    "Wallet discovery, rejected connect, wrong-chain switch, disconnect and no signatures",
    async () => {
      const { context, page } = await setup(chromiumBrowser, {
        wallet: true,
        chain: "0x2",
        reject: true,
      });
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Browser wallet", exact: true })
          .count(),
        0,
      );
      await page.getByRole("button", { name: "Test browser wallet" }).click();
      await visible(
        page,
        "Request declined in your wallet. You can try again.",
      );
      await page.evaluate(() => {
        window.__rejectWallet = false;
      });
      await page.getByRole("button", { name: "Test browser wallet" }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Switch to Ethereum" }).click();
      await page
        .getByRole("button", { name: "Switch to Ethereum" })
        .waitFor({ state: "hidden" });
      const calls = await page.evaluate(() => window.__walletCalls);
      assert.ok(calls.some((c) => c.method === "wallet_switchEthereumChain"));
      assert.ok(!calls.some((c) => /sign|sendTransaction/.test(c.method)));
      await page.locator(".wallet-control").click();
      await page.getByRole("button", { name: "Disconnect wallet" }).click();
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .waitFor();
      await context.close();
    },
  );
  await check(
    "Configured RPC: totals, filtering, ordering, provenance and forecast privacy",
    async () => {
      const { context, page, f, errors } = await setup(chromiumBrowser, {
        deployed: true,
      });
      await page.locator(".bounty-row").first().waitFor();
      assert.equal(await page.locator(".bounty-row").count(), 3);
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page
        .getByRole("button", {
          name: "Copy bounty contract address",
          exact: true,
        })
        .click();
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        f.config.contracts.bounty.address,
      );

      assert.match(
        await page.locator(".bounty-row").first().innerText(),
        /research papers/,
      );
      const values = await page.locator(".stat-value").allTextContents();
      assert.deepEqual(
        values.map((x) => x.replace(/FORECAST/g, "").trim()),
        ["3", "40", "6", "25"],
      );
      assert.ok(
        await page
          .locator(".stat-value a")
          .first()
          .getAttribute("href")
          .then((h) => h.includes("/tx/") && h.includes("#eventlog#")),
      );
      await page
        .getByRole("button", { name: "View source events" })
        .first()
        .click();
      assert.equal(await page.locator(".evidence-list li").count(), 3);
      await page.keyboard.press("Escape");
      await page.getByLabel("Sort", { exact: true }).selectOption("deadline");
      assert.match(
        await page.locator(".bounty-row").first().innerText(),
        /rainfall/,
      );
      await page
        .getByRole("button", { name: "Claimable", exact: true })
        .click();
      assert.equal(await page.locator(".bounty-row").count(), 1);
      await page
        .getByRole("button", { name: "All bounties", exact: true })
        .click();
      await page.getByRole("searchbox").fill("unmatched");
      await visible(page, "No matching bounties.");
      await page.getByRole("button", { name: "Clear filters" }).click();
      await page
        .getByRole("link", { name: /How many research papers/ })
        .click();
      await visible(page, "Forecasts stay hidden here.");
      assert.equal(
        f.calls.filter((c) => c.functionName === "getForecasts").length,
        0,
      );
      assert.equal(await page.locator(".forecast-table").count(), 0);
      await page.goto(`${url}#bounty/1`);
      await page.locator(".forecast-table tbody tr").first().waitFor();
      assert.equal(await page.locator(".forecast-table tbody tr").count(), 2);
      assert.match(
        await page.locator(".forecast-table tbody tr").first().innerText(),
        /43/,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Claim reward", exact: true })
          .count(),
        0,
      );
      const resolvedAudit = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(
        resolvedAudit.violations.map((v) => v.id),
        [],
        "resolved detail accessibility",
      );
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await overflow(page);
        await page.screenshot({
          path: `${out}/resolved-${width}.png`,
          fullPage: true,
        });
      }
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "Create: form validation, exact approval and bounty transaction calldata",
    async () => {
      const { context, page, f, errors } = await setup(chromiumBrowser, {
        deployed: true,
        wallet: true,
      });
      await page.locator(".bounty-row").first().waitFor();
      await connect(page);
      await page
        .getByRole("button", { name: "Create a bounty", exact: true })
        .click();
      await page
        .getByLabel("Question", { exact: true })
        .fill("How many readings will be published?");
      await page
        .getByLabel("Reward (FORECAST)", { exact: true })
        .fill("12.1234567");
      await page
        .getByLabel("Forecast deadline", { exact: true })
        .fill("2099-01-01T12:00");
      await page
        .getByLabel("Resolution source", { exact: true })
        .fill("Published annual report, total readings.");
      await page.getByRole("button", { name: "Review transaction" }).click();
      await visible(
        page,
        "Enter a positive reward within the token precision.",
      );
      await page.getByLabel("Reward (FORECAST)", { exact: true }).fill("12.5");
      await page.getByRole("button", { name: "Review transaction" }).click();
      await visible(page, "Approve exact token amount");
      await page.getByText("Exact transaction data", { exact: true }).click();
      assert.match(await page.locator(".calldata code").innerText(), /^0x/);
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await page
        .getByRole("heading", { name: "Create bounty", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await visible(page, "Transaction confirmed");
      const sent = (await page.evaluate(() => window.__walletCalls)).filter(
        (c) => c.method === "eth_sendTransaction",
      );
      assert.equal(sent.length, 2);
      const approval = decodeFunctionData({
        abi: f.tokenAbi,
        data: sent[0].params[0].data,
      });
      assert.equal(approval.functionName, "approve");
      assert.equal(approval.args[1], 12500000n);
      const create = decodeFunctionData({
        abi: f.bountyAbi,
        data: sent[1].params[0].data,
      });
      assert.equal(create.functionName, "createBounty");
      assert.equal(create.args[0], "How many readings will be published?");
      assert.equal(create.args[1], 12500000n);
      assert.ok(
        !sent.some((c) => c.params[0].value && c.params[0].value !== "0x0"),
      );
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "Submit, losing-participant withdrawal, winner claim and positions",
    async () => {
      const { context, page, f, errors } = await setup(chromiumBrowser, {
        deployed: true,
        wallet: true,
      });
      await page.locator(".bounty-row").first().waitFor();
      await connect(page);
      await page
        .getByRole("link", { name: /How many research papers/ })
        .click();
      await page.getByRole("button", { name: "Review forecast" }).waitFor();
      await page.getByLabel("Your numeric forecast").fill("-3.2");
      await page.getByRole("button", { name: "Review forecast" }).click();
      await visible(
        page,
        "Enter a whole number, using the unit in the question.",
      );
      await page.getByLabel("Your numeric forecast").fill("-3");
      await page.getByRole("button", { name: "Review forecast" }).click();
      await visible(page, "Approve exact token amount");
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await page
        .getByRole("heading", { name: "Submit forecast", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await visible(page, "Transaction confirmed");
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.goto(`${url}#bounty/2`);
      await page
        .getByRole("button", { name: "Withdraw bond", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Claim reward", exact: true })
          .isDisabled(),
        true,
      );
      await page
        .getByRole("button", { name: "Withdraw bond", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await visible(page, "Transaction confirmed");
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.goto(`${url}#bounty/1`);
      await page
        .getByRole("button", { name: "Claim reward", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Claim reward", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await visible(page, "Transaction confirmed");
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page
        .getByRole("link", { name: "My positions", exact: true })
        .click();
      await page.locator(".position-row").first().waitFor();
      assert.equal(await page.locator(".position-row").count(), 2);
      const firstPosition = page.locator(".position-row").first();
      assert.equal(
        await firstPosition
          .getByRole("button", { name: "Claim reward", exact: true })
          .isDisabled(),
        true,
      );
      await firstPosition
        .getByRole("button", { name: "Withdraw bond", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Withdraw bond", exact: true })
        .waitFor();
      assert.match(
        await page.locator(".transaction-fields").innerText(),
        /withdrawBond/,
      );
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await page
        .locator(".position-row")
        .last()
        .getByRole("button", { name: "Claim reward", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Claim reward", exact: true })
        .waitFor();
      assert.match(
        await page.locator(".transaction-fields").innerText(),
        /claimReward/,
      );
      await page.getByRole("button", { name: "Back", exact: true }).click();

      const sent = (await page.evaluate(() => window.__walletCalls)).filter(
        (c) => c.method === "eth_sendTransaction",
      );
      const names = sent
        .filter(
          (c) =>
            c.params[0].to.toLowerCase() ===
            f.config.contracts.bounty.address.toLowerCase(),
        )
        .map((c) =>
          decodeFunctionData({ abi: f.bountyAbi, data: c.params[0].data }),
        );
      assert.deepEqual(
        names.map((n) => n.functionName),
        ["submitForecast", "withdrawBond", "claimReward"],
      );
      assert.equal(names[0].args[1], -3n);
      assert.equal(
        f.calls.some(
          (c) => c.functionName === "getForecasts" && c.args[0] === 3n,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check("RPC failure hides stale data and retry recovers", async () => {
    const { context, page, f } = await setup(chromiumBrowser, {
      deployed: true,
    });
    await page.locator(".bounty-row").first().waitFor();
    f.setFail(true);
    await page.getByRole("button", { name: "Refresh onchain data" }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.locator(".bounty-row").count(), 0);
    assert.equal(await page.locator(".stat-value").count(), 0);
    f.setFail(false);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.locator(".bounty-row").first().waitFor();
    await context.close();
  });
  await check(
    "Invalid config fails closed; missing token address has no figures",
    async () => {
      const { context, page, f } = await setup(chromiumBrowser);
      const bad = structuredClone(f.config);
      bad.contracts.bounty.address = "invalid";
      await page.route("**/forecast.config.json", (route) =>
        route.fulfill({ json: bad }),
      );
      await page.reload();
      await visible(page, "Configuration unavailable");
      assert.equal(await page.locator(".stat-value").count(), 0);
      bad.contracts.bounty.address = f.config.contracts.bounty.address;
      bad.contracts.token.address = "";
      await page.reload();
      await page
        .getByRole("heading", { name: "Forecast the number." })
        .waitFor();
      assert.equal(await page.locator(".stat-value").count(), 0);
      await visible(page, "The board is ready.");
      await context.close();
    },
  );
  await check(
    "Text enlargement, reduced motion and measured contrast",
    async () => {
      const { context, page } = await setup(chromiumBrowser);
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px"),
      );
      await overflow(page);
      await page.screenshot({
        path: `${out}/text-enlarged.png`,
        fullPage: true,
      });
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await page
          .locator(".create-button")
          .evaluate((el) => getComputedStyle(el).transitionDuration),
        "0s",
      );
      const pairs = await page.evaluate(() => {
        function color(s) {
          return s.match(/[\d.]+/g).map(Number);
        }
        function luminance(c) {
          const v = c.slice(0, 3).map((x) => {
            x /= 255;
            return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          });
          return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
        }
        return [
          ".intro h1",
          ".intro p",
          ".create-button",
          ".awaiting",
          ".stat-label",
          ".filter-button.selected",
        ].map((selector) => {
          const el = document.querySelector(selector);
          const foreground = getComputedStyle(el).color;
          let parent = el,
            background;
          while (parent) {
            background = getComputedStyle(parent).backgroundColor;
            if (color(background)[3] !== 0) break;
            parent = parent.parentElement;
          }
          const a = luminance(color(foreground)),
            b = luminance(color(background));
          return {
            selector,
            foreground,
            background,
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          };
        });
      });
      await writeFile(`${out}/contrast.json`, JSON.stringify(pairs, null, 2));
      assert.ok(pairs.every((p) => p.ratio >= 4.5));
      await page.keyboard.press("Tab");
      await page.screenshot({ path: `${out}/keyboard-focus.png` });
      await context.close();
    },
  );
  await check("Incomplete event history fails closed", async () => {
    const { context, page, f } = await setup(chromiumBrowser, {
      deployed: true,
    });
    await page.locator(".bounty-row").first().waitFor();
    const original = f.rpc;
    f.rpc = async (request) => {
      const response = await original(request);
      if (request.method === "eth_getLogs" && response.result.length)
        response.result = response.result.filter((_, i) => i !== 1);
      return response;
    };
    await page.getByRole("button", { name: "Refresh onchain data" }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.locator(".stat-value").count(), 0);
    assert.match(
      await page.getByRole("alert").innerText(),
      /Forecast count does not match/,
    );
    await context.close();
  });
  await check(
    "Wrong-chain action gate and rejected transaction recovery",
    async () => {
      const { context, page } = await setup(chromiumBrowser, {
        deployed: true,
        wallet: true,
        chain: "0x2",
      });
      await page.locator(".bounty-row").first().waitFor();
      await connect(page);
      await page.goto(`${url}#bounty/1`);
      await page
        .getByRole("button", { name: "Claim reward", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Claim reward", exact: true })
          .isDisabled(),
        true,
      );
      await page.getByRole("button", { name: "Switch to Ethereum" }).click();
      await page
        .getByRole("button", { name: "Claim reward", exact: true })
        .click();
      await page.evaluate(() => {
        window.__rejectTransaction = true;
      });
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await visible(
        page,
        "Request declined in your wallet. You can try again.",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Confirm in wallet" })
          .isDisabled(),
        false,
      );
      await page.evaluate(() => {
        window.__rejectTransaction = false;
      });
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await visible(page, "Transaction confirmed");
      await context.close();
    },
  );
  await check(
    "Mobile EIP-6963 discovery without a global provider",
    async () => {
      const { context, page } = await setup(chromiumBrowser, {
        wallet: true,
        mobile: true,
        eipOnly: true,
      });
      await connect(page);
      assert.equal(
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .count(),
        0,
      );
      assert.ok(
        !(await page.evaluate(() => window.__walletCalls)).some((c) =>
          /sign|sendTransaction/.test(c.method),
        ),
      );
      await context.close();
    },
  );
} finally {
  for (const b of browsers) await b.close();
  await new Promise((r) => server.close(r));
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
console.log(
  `${results.filter((r) => r.passed).length}/${results.filter((r) => !r.skipped).length} checks passed; ${results.filter((r) => r.skipped).length} skipped`,
);
if (results.some((r) => r.passed === false)) process.exitCode = 1;

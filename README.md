# Forecast Bounty

A static viewer and wallet client for numeric forecasting bounties. Creators fund a question; the closest forecast wins the reward; participants can withdraw their full bond after resolution.

The delivered site intentionally starts in **Awaiting deployment**. Every contract address in `public/forecast.config.json` is empty. It shows no invented bounties, totals, balances or sample forecasts. Wallet connection and the bounty draft form work before deployment; contract transactions remain unavailable.

## Install and run

Use Node.js 22 or later and npm.

```sh
npm ci
npm run dev
```

To rebuild and preview the production export:

```sh
npm run typecheck
npm run build
npm run preview
```

`dist/` is the complete production export, supplied alongside the source and `package-lock.json`. Serve its contents from any static HTTP host or IPFS gateway. Vite uses `base: './'`; navigation uses hash routes, and fonts, images and wallet marks are local assets. No backend, rewrite rules, environment file or private credentials are required. Open the site over HTTP(S), not `file://`.

Do not include `node_modules`, test output, browser downloads or package caches in a submission. No ignore file was introduced or changed. This delivery keeps temporary tooling entirely under `test/scratch/`, which is excluded from submission by the task.

## Runtime configuration

`public/forecast.config.json` is the only authored source of contract addresses, ABIs and network settings. Vite copies it unchanged to `dist/forecast.config.json`. The browser fetches that file at runtime, before constructing the wallet and read clients. For an already built export, configure the copy in `dist/`; for future builds, maintain the source in `public/` as well. These are source/export copies of the same file, not separate configuration systems.

This assignment did not supply contract source, verified deployed ABIs or deployed addresses. The included ABI describes the **expected integration interface**, not a verified deployment. A future deployment must implement this interface, or the adapter must be updated to match the verified contracts. See [the interface and event contract](docs/CONFIGURATION.md) before connecting a deployment. No address is requested or invented by this site.

The default network is Ethereum. Set the verified deployment block and a public HTTPS RPC with historical event access when configuring a deployment. No API secret belongs in a public static export. Missing addresses cause explicit deployment states. Invalid configuration, absent bytecode, failed reads and incomplete event histories show errors instead of numbers.

## What is implemented

- Bounty board with newest-first ordering, state filters, search, deadline and reward sorts.
- Event-derived totals with source-event links and a list of all contributing events.
- Bounty detail, resolution source and resolver, refundable bond, forecast count, and state from the contract.
- No individual forecast reads or table before resolution. Resolved values come from the contract; absolute errors use integer arithmetic.
- Create, submit, withdraw and claim flows with full transaction destination, account, arguments and calldata before signing. Token approval is exact, with a separate reset when required. Each transaction is simulated, signed in the wallet and checked for a successful receipt.
- Wallet positions and settlement controls gated by contract state, participant/winner identity and the selected network.
- EIP-6963 browser wallet discovery, mobile wallet-browser links, Coinbase Smart Wallet, disconnect and network switching. No WalletConnect relay/project ID.
- Full contract addresses, copy actions, Etherscan links, and an explanatory guide.

Viewing and connecting never request a signature. This client does not deploy contracts, mint assets or expose resolver/privileged functions. Forecasts are hidden **in this interface**, not cryptographically concealed from public blockchain transaction data. The contract remains responsible for settlement, deadlines, tie-breaking and refunds.

## Validation

Run the repeatable interaction checks after building:

```sh
npx playwright install chromium webkit
npm test
```

The test runner serves the actual export under `/preview/`, closes its server and browsers when finished, and writes results/screenshots only to `test/scratch/interaction/`. Onchain cases use explicitly synthetic RPC and wallet fixtures in `tests/`; no fixtures are bundled into the website. The runner reports an unavailable browser as skipped, not passed. Live wallets, funds and deployed contracts are not used by the tests.

Local results: the production build and separate typecheck passed; 14 Chromium interaction checks passed. WebKit was skipped because its runtime could not launch. The design probe passed 15/16 raw checks; its remaining flag is the navigation label, confirmed as a false positive in the screenshot. Live deployed-contract transactions and physical mobile-wallet handoffs remain unverified.

Actual production build, typecheck, browser checks, design review, fixes and remaining limitations are recorded in [artifacts/validation.md](artifacts/validation.md). The production build currently warns about one JavaScript chunk exceeding Vite's advisory size threshold; it builds successfully. Coinbase's SDK is a separate lazy-loaded chunk.

[DESIGN.md](DESIGN.md) records the final design tokens and components. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) records design and asset attribution. The share card can be regenerated with `node scripts/share-card.mjs` after installing Chromium; its finished PNG is already included.

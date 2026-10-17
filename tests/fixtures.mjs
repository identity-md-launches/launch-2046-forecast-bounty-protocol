// Synthetic RPC fixtures are confined to tests. They are never imported by the application.
import { readFile } from "node:fs/promises";
import {
  parseAbi,
  getAddress,
  keccak256,
  toBytes,
  encodeEventTopics,
  encodeAbiParameters,
  getAbiItem,
  decodeFunctionData,
  encodeFunctionResult,
  toHex,
} from "viem";
const address = (name) =>
  getAddress(`0x${keccak256(toBytes(`test-only:${name}`)).slice(-40)}`);
export const actors = {
  wallet: address("wallet"),
  other: address("other"),
  third: address("third"),
  resolver: address("resolver"),
};
export async function fixture() {
  const config = JSON.parse(
    await readFile(
      new URL("../public/forecast.config.json", import.meta.url),
      "utf8",
    ),
  );
  config.contracts.bounty.address = address("bounty");
  config.contracts.token.address = address("token");
  config.contracts.bounty.deploymentBlock = "100";
  config.logChunkSize = 2;
  const bountyAbi = parseAbi(config.contracts.bounty.abi),
    tokenAbi = parseAbi(config.contracts.token.abi);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const bounties = [
    [
      1n,
      "What will the final rainfall total be in millimetres?",
      125000000n,
      now - 9000n,
      "The published annual station report, in whole millimetres.",
      2,
      44n,
      43n,
      actors.wallet,
    ],
    [
      2n,
      "How many launches will complete this month?",
      40000000n,
      now - 6000n,
      "The public launch registry at the end of the month.",
      1,
      10n,
      10n,
      actors.other,
    ],
    [
      3n,
      "How many research papers will be published this year?",
      250000000n,
      now + 86400n,
      "The public annual index, using its final whole-number count.",
      0,
      0n,
      0n,
      actors.other,
    ],
  ];
  const forecastValues = [
    [actors.wallet, 43n],
    [actors.other, 49n],
  ];
  const logs = [];
  const event = (name, args) => {
    const def = getAbiItem({ abi: bountyAbi, name });
    const index = logs.length;
    logs.push({
      address: config.contracts.bounty.address,
      topics: encodeEventTopics({ abi: bountyAbi, eventName: name, args }),
      data: encodeAbiParameters(
        def.inputs.filter((i) => !i.indexed),
        def.inputs.filter((i) => !i.indexed).map((i) => args[i.name]),
      ),
      blockNumber: "0x64",
      blockHash: keccak256(toBytes("fixture-block")),
      transactionHash: keccak256(toBytes(`fixture-event-${index}`)),
      transactionIndex: toHex(index),
      logIndex: toHex(index),
      removed: false,
    });
  };
  for (const [
    id,
    question,
    reward,
    deadline,
    source,
    state,
    trueValue,
    winningForecast,
    winner,
  ] of bounties) {
    event("BountyCreated", {
      id,
      creator: actors.resolver,
      question,
      reward,
      deadline,
      source,
      resolver: actors.resolver,
      bond: 5000000n,
    });
    event("ForecastSubmitted", {
      id,
      forecaster: id === 3n ? actors.third : actors.wallet,
      bond: 5000000n,
    });
    event("ForecastSubmitted", {
      id,
      forecaster: actors.other,
      bond: 5000000n,
    });
    if (state !== 0)
      event("BountyResolved", { id, trueValue, winner, winningForecast });
  }
  event("RewardClaimed", { id: 2n, winner: actors.other, amount: 40000000n });
  event("BondWithdrawn", {
    id: 2n,
    participant: actors.other,
    amount: 5000000n,
  });
  const calls = [];
  let fail = false;
  const hash = keccak256(toBytes("fixture-submitted-transaction"));
  const block = {
    number: "0x66",
    hash: keccak256(toBytes("fixture-block")),
    parentHash: keccak256(toBytes("fixture-parent")),
    timestamp: toHex(now),
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    baseFeePerGas: "0x1",
    difficulty: "0x0",
    extraData: "0x",
    miner: actors.resolver,
    nonce: "0x0000000000000000",
    receiptsRoot: keccak256(toBytes("receipts")),
    sha3Uncles: keccak256(toBytes("uncles")),
    stateRoot: keccak256(toBytes("state")),
    transactionsRoot: keccak256(toBytes("transactions")),
    size: "0x100",
    totalDifficulty: "0x0",
    uncles: [],
    transactions: [],
    logsBloom: `0x${"00".repeat(256)}`,
  };
  async function rpc(request) {
    const { id, method, params = [] } = request;
    calls.push({ method, params });
    if (fail)
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: "Fixture RPC unavailable" },
      };
    let result;
    if (method === "eth_chainId") result = "0x1";
    else if (method === "eth_blockNumber") result = block.number;
    else if (
      method === "eth_getBlockByNumber" ||
      method === "eth_getBlockByHash"
    )
      result = block;
    else if (method === "eth_getCode") result = "0x60006000";
    else if (method === "eth_getLogs")
      result =
        BigInt(params[0].fromBlock) <= 100n && BigInt(params[0].toBlock) >= 100n
          ? logs
          : [];
    else if (method === "eth_call") {
      const abi =
        params[0].to.toLowerCase() ===
        config.contracts.token.address.toLowerCase()
          ? tokenAbi
          : bountyAbi;
      const { functionName: name, args = [] } = decodeFunctionData({
        abi,
        data: params[0].data,
      });
      calls.push({ functionName: name, args });
      if (name === "symbol")
        result = encodeFunctionResult({
          abi,
          functionName: name,
          result: "FORECAST",
        });
      else if (name === "decimals")
        result = encodeFunctionResult({ abi, functionName: name, result: 6 });
      else if (name === "allowance")
        result = encodeFunctionResult({ abi, functionName: name, result: 0n });
      else if (name === "getBounty") {
        const b = bounties.find((b) => b[0] === args[0]);
        result = encodeFunctionResult({
          abi,
          functionName: name,
          result: [
            b[1],
            b[2],
            b[3],
            b[4],
            actors.resolver,
            5000000n,
            2n,
            b[5],
            b[6],
            b[7],
            b[8],
          ],
        });
      } else if (name === "getPosition") {
        const submitted =
          args[0] !== 3n ||
          args[1].toLowerCase() === actors.other.toLowerCase();
        result = encodeFunctionResult({
          abi,
          functionName: name,
          result: [
            submitted,
            submitted ? 5000000n : 0n,
            submitted && args[0] !== 3n,
            args[0] === 1n &&
              args[1].toLowerCase() === actors.wallet.toLowerCase(),
          ],
        });
      } else if (name === "getForecasts") {
        if (args[0] === 3n)
          throw Error("Privacy regression: open forecasts requested");
        result = encodeFunctionResult({
          abi,
          functionName: name,
          result: (args[0] === 2n
            ? [
                [actors.wallet, 9n],
                [actors.other, 10n],
              ]
            : forecastValues
          ).map(([submitter, value]) => ({
            submitter,
            value,
          })),
        });
      } else if (name === "approve")
        result = encodeFunctionResult({
          abi,
          functionName: name,
          result: true,
        });
      else if (name === "createBounty")
        result = encodeFunctionResult({ abi, functionName: name, result: 4n });
      else result = "0x";
    } else if (method === "eth_getTransactionReceipt")
      result = {
        transactionHash: params[0],
        transactionIndex: "0x0",
        blockHash: block.hash,
        blockNumber: block.number,
        from: actors.wallet,
        to: config.contracts.bounty.address,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"00".repeat(256)}`,
        status: "0x1",
        effectiveGasPrice: "0x1",
        type: "0x2",
      };
    else if (method === "eth_getTransactionByHash")
      result = {
        hash: params[0],
        blockHash: block.hash,
        blockNumber: block.number,
        from: actors.wallet,
        to: config.contracts.bounty.address,
        value: "0x0",
        gas: "0x5208",
        gasPrice: "0x1",
        input: "0x",
        nonce: "0x0",
        transactionIndex: "0x0",
        type: "0x2",
      };
    else if (method === "eth_estimateGas") result = "0x5208";
    else if (method === "eth_gasPrice") result = "0x1";
    else if (method === "eth_maxPriorityFeePerGas") result = "0x1";
    else throw Error(`Unhandled fixture RPC: ${method}`);
    return { jsonrpc: "2.0", id, result };
  }
  return {
    config,
    bountyAbi,
    tokenAbi,
    actors,
    hash,
    calls,
    setFail: (v) => (fail = v),
    rpc,
  };
}
export async function injectWallet(
  page,
  {
    account = actors.wallet,
    chain = "0x1",
    reject = false,
    hash = keccak256(toBytes("fixture-submitted-transaction")),
  } = {},
) {
  await page.addInitScript(
    ({ account, chain, reject, hash }) => {
      const listeners = new Map();
      let connected = false;
      let network = chain;
      window.__walletCalls = [];
      window.__rejectWallet = reject;
      const provider = {
        on(name, fn) {
          if (!listeners.has(name)) listeners.set(name, new Set());
          listeners.get(name).add(fn);
        },
        removeListener(name, fn) {
          listeners.get(name)?.delete(fn);
        },
        async request({ method, params = [] }) {
          window.__walletCalls.push({ method, params });
          if (method === "eth_requestAccounts") {
            if (window.__rejectWallet)
              throw Object.assign(Error("User rejected the request"), {
                code: 4001,
              });
            connected = true;
            return [account];
          }
          if (method === "eth_accounts") return connected ? [account] : [];
          if (method === "eth_chainId") return network;
          if (method === "wallet_switchEthereumChain") {
            network = params[0].chainId;
            listeners.get("chainChanged")?.forEach((fn) => fn(network));
            return null;
          }
          if (method === "wallet_addEthereumChain") {
            network = params[0].chainId;
            return null;
          }
          if (method === "eth_sendTransaction") {
            if (window.__rejectTransaction)
              throw Object.assign(Error("User rejected the request"), {
                code: 4001,
              });
            return hash;
          }
          if (method === "wallet_getCapabilities") return {};
          if (method === "wallet_revokePermissions") {
            connected = false;
            return null;
          }
          if (method === "eth_estimateGas") return "0x5208";
          if (method === "eth_getTransactionCount") return "0x0";
          if (method === "eth_gasPrice") return "0x1";
          throw Error(`Unexpected wallet method: ${method}`);
        },
      };
      window.ethereum = provider;
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "9d168c20-2c8e-4c16-b9d1-623e04b924af",
                name: "Test browser wallet",
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="blue"/></svg>',
                rdns: "test.forecast.wallet",
              },
              provider,
            },
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { account, chain, reject, hash },
  );
}

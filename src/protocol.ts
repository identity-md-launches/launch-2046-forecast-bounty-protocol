import { decodeEventLog, formatUnits, type Address, type Hash } from "viem";
import type { Runtime } from "./config";

export type BountyState = "open" | "resolved" | "claimable";
export interface Evidence {
  hash: Hash;
  logIndex: number;
  name: string;
  block: bigint;
  args: Record<string, unknown>;
}
export interface Bounty {
  id: bigint;
  question: string;
  reward: bigint;
  deadline: bigint;
  source: string;
  resolver: Address;
  bond: bigint;
  forecastCount: bigint;
  state: BountyState;
  trueValue: bigint;
  winningForecast: bigint;
  winner: Address;
  created: Evidence;
  events: Evidence[];
  resolution?: Evidence;
  forecastEvent?: Evidence;
}
export interface Snapshot {
  bounties: Bounty[];
  events: Evidence[];
  symbol: string;
  decimals: number;
  block: bigint;
  timestamp: bigint;
}
export interface Position {
  submitted: boolean;
  bondLocked: bigint;
  canWithdraw: boolean;
  canClaim: boolean;
}
export interface Forecast {
  submitter: Address;
  value: bigint;
}
export const money = (n: bigint, decimals: number) => formatUnits(n, decimals);
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const absolute = (n: bigint) => (n < 0n ? -n : n);
export const eventUrl = (r: Runtime, e: Evidence) =>
  `${r.config.chain.explorerUrl}/tx/${e.hash}#eventlog#${e.logIndex}`;
export const addressUrl = (r: Runtime, a: string) =>
  `${r.config.chain.explorerUrl}/address/${a}`;
export function readableError(e: unknown) {
  const x = e as { shortMessage?: string; message?: string };
  if (/reject|denied|4001/i.test(x?.message || ""))
    return "Request declined in your wallet. You can try again.";
  return (
    x?.shortMessage || x?.message || "The request failed. Please try again."
  );
}
export async function readBounty(
  r: Runtime,
  id: bigint,
  created: Evidence,
  events: Evidence[],
  block: bigint,
): Promise<Bounty> {
  if (!r.bountyAddress) throw new Error("Awaiting deployment.");
  const v = (await r.client.readContract({
    address: r.bountyAddress,
    abi: r.bountyAbi,
    functionName: "getBounty",
    args: [id],
    blockNumber: block,
  })) as [
    string,
    bigint,
    bigint,
    string,
    Address,
    bigint,
    bigint,
    number,
    bigint,
    bigint,
    Address,
  ];
  const states: BountyState[] = ["open", "resolved", "claimable"];
  if (!states[Number(v[7])])
    throw new Error(
      "Unknown contract bounty state. Check the configured interface.",
    );
  if (
    created.args.question !== v[0] ||
    created.args.reward !== v[1] ||
    created.args.deadline !== v[2] ||
    created.args.source !== v[3] ||
    String(created.args.resolver).toLowerCase() !== v[4].toLowerCase() ||
    created.args.bond !== v[5]
  )
    throw new Error(
      "Bounty details do not match their source event. Check the contract interface.",
    );
  if (v[2] > 8640000000000n)
    throw new Error("The contract deadline cannot be represented as a date.");
  const related = events.filter((e) => e.args.id === id);
  const resolution = [...related]
    .reverse()
    .find((e) => e.name === "BountyResolved");
  const forecastEvent = [...related]
    .reverse()
    .find((e) => e.name === "ForecastSubmitted");
  if (Number(v[7]) !== 0 && !resolution)
    throw new Error(
      "Resolution evidence is missing. No partial data is displayed.",
    );
  if (
    resolution &&
    (resolution.args.trueValue !== v[8] ||
      resolution.args.winningForecast !== v[9] ||
      String(resolution.args.winner).toLowerCase() !== v[10].toLowerCase())
  )
    throw new Error(
      "The result does not match its resolution event. Try refreshing the data.",
    );
  if (
    v[6] !==
    BigInt(related.filter((e) => e.name === "ForecastSubmitted").length)
  )
    throw new Error(
      "Forecast count does not match event history. Check the deployment block.",
    );
  return {
    id,
    question: v[0],
    reward: v[1],
    deadline: v[2],
    source: v[3],
    resolver: v[4],
    bond: v[5],
    forecastCount: v[6],
    state: states[Number(v[7])],
    trueValue: v[8],
    winningForecast: v[9],
    winner: v[10],
    created,
    events: related,
    resolution,
    forecastEvent,
  };
}
export async function readSnapshot(
  r: Runtime,
  signal?: AbortSignal,
): Promise<Snapshot> {
  if (!r.bountyAddress || !r.tokenAddress)
    throw new Error("Awaiting deployment.");
  const block = await r.client.getBlock({ blockTag: "latest" });
  const start = BigInt(r.config.contracts.bounty.deploymentBlock);
  if (start > block.number)
    throw new Error("The deployment block is ahead of the network.");
  const [bountyCode, tokenCode, symbol, decimals] = await Promise.all([
    r.client.getCode({ address: r.bountyAddress, blockNumber: block.number }),
    r.client.getCode({ address: r.tokenAddress, blockNumber: block.number }),
    r.client.readContract({
      address: r.tokenAddress,
      abi: r.tokenAbi,
      functionName: "symbol",
      blockNumber: block.number,
    }),
    r.client.readContract({
      address: r.tokenAddress,
      abi: r.tokenAbi,
      functionName: "decimals",
      blockNumber: block.number,
    }),
  ]);
  if (!bountyCode || bountyCode === "0x" || !tokenCode || tokenCode === "0x")
    throw new Error("A configured address has no contract on this network.");
  if (
    typeof symbol !== "string" ||
    typeof decimals !== "number" ||
    decimals > 36
  )
    throw new Error("Unsupported token metadata.");
  const events: Evidence[] = [];
  const span = BigInt(r.config.logChunkSize);
  for (let from = start; from <= block.number; from += span) {
    signal?.throwIfAborted();
    const to =
      from + span - 1n > block.number ? block.number : from + span - 1n;
    const logs = await r.client.getLogs({
      address: r.bountyAddress,
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      if (
        log.removed ||
        log.blockNumber === null ||
        log.transactionHash === null ||
        log.logIndex === null
      )
        continue;
      try {
        const decoded = decodeEventLog({
          abi: r.bountyAbi,
          data: log.data,
          topics: log.topics,
          strict: true,
        });
        events.push({
          hash: log.transactionHash,
          block: log.blockNumber,
          logIndex: log.logIndex,
          name: decoded.eventName!,
          args: decoded.args as unknown as Record<string, unknown>,
        });
      } catch {
        /* Unrelated contract events do not contribute to this viewer. */
      }
    }
  }
  events.sort((a, b) =>
    a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1,
  );
  const created = events.filter((e) => e.name === "BountyCreated");
  const bounties: Bounty[] = [];
  for (let i = 0; i < created.length; i += 5) {
    signal?.throwIfAborted();
    bounties.push(
      ...(await Promise.all(
        created
          .slice(i, i + 5)
          .map((e) =>
            readBounty(r, e.args.id as bigint, e, events, block.number),
          ),
      )),
    );
  }
  return {
    bounties: bounties.reverse(),
    events,
    symbol,
    decimals,
    block: block.number,
    timestamp: block.timestamp,
  };
}
export async function readPosition(
  r: Runtime,
  id: bigint,
  account: Address,
  block: bigint,
): Promise<Position> {
  if (!r.bountyAddress) throw new Error("Awaiting deployment.");
  const v = (await r.client.readContract({
    address: r.bountyAddress,
    abi: r.bountyAbi,
    functionName: "getPosition",
    args: [id, account],
    blockNumber: block,
  })) as [boolean, bigint, boolean, boolean];
  return {
    submitted: v[0],
    bondLocked: v[1],
    canWithdraw: v[2],
    canClaim: v[3],
  };
}
export async function readForecasts(
  r: Runtime,
  bounty: Bounty,
  block: bigint,
): Promise<Forecast[]> {
  if (!r.bountyAddress || bounty.state === "open")
    throw new Error("Forecast values are hidden until resolution.");
  const rows = (await r.client.readContract({
    address: r.bountyAddress,
    abi: r.bountyAbi,
    functionName: "getForecasts",
    args: [bounty.id],
    blockNumber: block,
  })) as Forecast[];
  if (BigInt(rows.length) !== bounty.forecastCount)
    throw new Error(
      "The resolved forecast table is incomplete. Try refreshing the data.",
    );
  if (
    rows.some(
      (row) =>
        !bounty.events.some(
          (e) =>
            e.name === "ForecastSubmitted" &&
            String(e.args.forecaster).toLowerCase() ===
              row.submitter.toLowerCase(),
        ),
    )
  )
    throw new Error(
      "A forecast is missing its submission event. No partial table is displayed.",
    );
  return rows;
}
export function totals(s: Snapshot) {
  const forecasts = s.events.filter((e) => e.name === "ForecastSubmitted");
  const withdrawals = s.events.filter((e) => e.name === "BondWithdrawn");
  const payouts = s.events.filter((e) => e.name === "RewardClaimed");
  const sum = (es: Evidence[], key: string) =>
    es.reduce((a, e) => a + (e.args[key] as bigint), 0n);
  const locked = sum(forecasts, "bond") - sum(withdrawals, "amount");
  if (locked < 0n)
    throw new Error(
      "Incomplete bond event history. Check the deployment block.",
    );
  return [
    {
      label: "Bounties created",
      value: BigInt(s.bounties.length).toString(),
      events: s.events.filter((e) => e.name === "BountyCreated"),
      empty: "No bounties yet",
    },
    {
      label: "Rewards paid out",
      value: money(sum(payouts, "amount"), s.decimals),
      unit: s.symbol,
      events: payouts,
      empty: "No rewards paid yet",
    },
    {
      label: "Forecasts submitted",
      value: BigInt(forecasts.length).toString(),
      events: forecasts,
      empty: "No forecasts yet",
    },
    {
      label: "Bonds locked",
      value: money(locked, s.decimals),
      unit: s.symbol,
      events: s.events.filter(
        (e) => e.name === "ForecastSubmitted" || e.name === "BondWithdrawn",
      ),
      empty: "No bonds locked yet",
    },
  ];
}

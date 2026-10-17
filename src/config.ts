import { createConfig, http } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import { injected } from "wagmi/connectors/injected";
import {
  createPublicClient,
  defineChain,
  getAddress,
  isAddress,
  parseAbi,
  type Address,
} from "viem";

export interface RuntimeConfig {
  schemaVersion: number;
  chain: {
    id: number;
    name: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrl: string;
    explorerUrl: string;
  };
  contracts: {
    bounty: { address: string; deploymentBlock: string; abi: string[] };
    token: { address: string; abi: string[] };
  };
  logChunkSize: number;
}
function publicUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password)
    throw new Error("Network URLs must use HTTPS without credentials.");
  return value.replace(/\/$/, "");
}
export function validateConfig(input: unknown): RuntimeConfig {
  const c = input as RuntimeConfig;
  if (
    c?.schemaVersion !== 1 ||
    !Number.isSafeInteger(c.chain?.id) ||
    c.chain.id < 1 ||
    !c.chain.name ||
    !c.chain.nativeCurrency?.symbol ||
    !Number.isInteger(c.chain.nativeCurrency.decimals) ||
    c.chain.nativeCurrency.decimals < 0 ||
    c.chain.nativeCurrency.decimals > 36
  )
    throw new Error("Invalid network configuration.");
  c.chain.rpcUrl = publicUrl(c.chain.rpcUrl);
  c.chain.explorerUrl = publicUrl(c.chain.explorerUrl);
  for (const item of [c.contracts?.bounty, c.contracts?.token]) {
    if (!item || typeof item.address !== "string" || !Array.isArray(item.abi))
      throw new Error("Missing contract configuration.");
    if (
      item.address &&
      (!isAddress(item.address) || BigInt(item.address) === 0n)
    )
      throw new Error("Invalid contract address in configuration.");
    if (item.address) item.address = getAddress(item.address);
    parseAbi(item.abi);
  }
  if (
    c.contracts.bounty.address &&
    !/^\d+$/.test(c.contracts.bounty.deploymentBlock)
  )
    throw new Error("Set the verified bounty deployment block.");
  if (
    !Number.isInteger(c.logChunkSize) ||
    c.logChunkSize < 1 ||
    c.logChunkSize > 100000
  )
    throw new Error("Invalid event scan chunk size.");
  return c;
}
export async function loadConfig() {
  const response = await fetch(
    `${import.meta.env.BASE_URL}forecast.config.json`,
    { cache: "no-store" },
  );
  if (!response.ok)
    throw new Error("The deployment configuration could not be loaded.");
  return validateConfig(await response.json());
}
export function makeRuntime(config: RuntimeConfig) {
  const chain = defineChain({
    id: config.chain.id,
    name: config.chain.name,
    nativeCurrency: config.chain.nativeCurrency,
    rpcUrls: { default: { http: [config.chain.rpcUrl] } },
    blockExplorers: {
      default: { name: "Etherscan", url: config.chain.explorerUrl },
    },
  });
  const wallet = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      coinbaseWallet({
        appName: "Forecast Bounty",
        preference: { options: "all" },
      }),
    ],
    transports: { [chain.id]: http(config.chain.rpcUrl) },
  });
  return {
    config,
    chain,
    wallet,
    client: createPublicClient({
      chain,
      transport: http(config.chain.rpcUrl, { timeout: 20000, retryCount: 1 }),
    }),
    bountyAbi: parseAbi(config.contracts.bounty.abi),
    tokenAbi: parseAbi(config.contracts.token.abi),
    bountyAddress: config.contracts.bounty.address as Address | "",
    tokenAddress: config.contracts.token.address as Address | "",
    deployed: Boolean(
      config.contracts.bounty.address && config.contracts.token.address,
    ),
  };
}
export type Runtime = ReturnType<typeof makeRuntime>;

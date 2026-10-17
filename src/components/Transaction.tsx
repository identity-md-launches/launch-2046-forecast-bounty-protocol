import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { encodeFunctionData, type Abi, type Address, type Hash } from "viem";
import type { Runtime } from "../config";
import { addressUrl, readableError } from "../protocol";
import { ErrorNote, Icon } from "./ui";

export interface TransactionIntent {
  functionName:
    "createBounty" | "submitForecast" | "withdrawBond" | "claimReward";
  args: readonly unknown[];
  title: string;
  summary: string;
  spend?: bigint;
}
interface Step {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  data: `0x${string}`;
  label: string;
}
export function TransactionReview({
  runtime: r,
  intent,
  onDone,
  onBack,
  onBusy,
  onFinish,
}: {
  runtime: Runtime;
  intent: TransactionIntent;
  onDone: () => void;
  onBack: () => void;
  onBusy: (b: boolean) => void;
  onFinish?: () => void;
}) {
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const [steps, setSteps] = useState<Step[]>([]);
  const [preparedFor, setPreparedFor] = useState<Address>();
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hash>();
  const [complete, setComplete] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const prepare = async () => {
      setLoading(true);
      setError("");
      setSteps([]);
      setIndex(0);
      setHash(undefined);
      setComplete(false);
      if (
        !address ||
        !r.bountyAddress ||
        !r.tokenAddress ||
        chainId !== r.chain.id
      ) {
        setLoading(false);
        return;
      }
      try {
        const list: Step[] = [];
        const add = (
          contract: Address,
          abi: Abi,
          name: string,
          args: readonly unknown[],
          label: string,
        ) =>
          list.push({
            address: contract,
            abi,
            functionName: name,
            args,
            data: encodeFunctionData({ abi, functionName: name, args }),
            label,
          });
        if (intent.spend && intent.spend > 0n) {
          const allowance = (await r.client.readContract({
            address: r.tokenAddress,
            abi: r.tokenAbi,
            functionName: "allowance",
            args: [address, r.bountyAddress],
          })) as bigint;
          if (allowance < intent.spend) {
            if (allowance > 0n)
              add(
                r.tokenAddress,
                r.tokenAbi,
                "approve",
                [r.bountyAddress, 0n],
                "Reset token allowance",
              );
            add(
              r.tokenAddress,
              r.tokenAbi,
              "approve",
              [r.bountyAddress, intent.spend],
              "Approve exact token amount",
            );
          }
        }
        add(
          r.bountyAddress,
          r.bountyAbi,
          intent.functionName,
          intent.args,
          intent.title,
        );
        if (active) {
          setSteps(list);
          setPreparedFor(address);
        }
      } catch (e) {
        if (active) setError(readableError(e));
      } finally {
        if (active) setLoading(false);
      }
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [r, intent, address, chainId, attempt]);
  async function send() {
    if (
      !wallet ||
      !address ||
      address !== preparedFor ||
      chainId !== r.chain.id ||
      !steps[index]
    )
      return;
    const step = steps[index];
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      if (
        wallet.account.address.toLowerCase() !== preparedFor!.toLowerCase() ||
        (await wallet.getChainId()) !== r.chain.id
      )
        throw new Error("Your wallet changed. Review the transaction again.");
      let submitted = hash;
      if (!submitted) {
        const { request } = await r.client.simulateContract({
          address: step.address,
          abi: step.abi,
          functionName: step.functionName,
          args: step.args,
          account: address,
        });
        submitted = await wallet.writeContract(request);
        setHash(submitted);
      }
      const receipt = await r.client.waitForTransactionReceipt({
        hash: submitted,
        confirmations: 1,
        timeout: 120000,
      });
      if (receipt.status !== "success") {
        setHash(undefined);
        throw new Error(
          "The transaction reverted. No protocol action was completed. Review your wallet and try again.",
        );
      }
      if (index + 1 < steps.length) {
        setIndex(index + 1);
        setHash(undefined);
      } else {
        setComplete(true);
        onDone();
      }
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  if (complete)
    return (
      <div className="transaction-success">
        <Icon name="check" size={36} />
        <h3>Transaction confirmed</h3>
        <p>{intent.title} completed onchain.</p>
        {hash && (
          <a
            className="text-link"
            href={`${r.config.chain.explorerUrl}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction on Etherscan <Icon name="external" size={16} />
          </a>
        )}
        <button className="button secondary full" onClick={onFinish || onBack}>
          Done
        </button>
      </div>
    );
  const step = steps[index];
  return (
    <div className="transaction-review">
      <p>{intent.summary}</p>
      <p className="muted small">
        Each transaction is shown below before signing. Token approvals are
        limited to this action. Your wallet calculates the network fee.
      </p>
      {loading && <p role="status">Preparing transaction…</p>}
      {step && (
        <>
          <h3>{step.label}</h3>
          <dl className="transaction-fields">
            <dt>Network</dt>
            <dd>{r.chain.name}</dd>
            <dt>From</dt>
            <dd className="address">{preparedFor}</dd>
            <dt>Contract</dt>
            <dd>
              <a
                className="address text-link"
                href={addressUrl(r, step.address)}
                target="_blank"
                rel="noreferrer"
              >
                {step.address}
              </a>
            </dd>
            <dt>Function</dt>
            <dd>{step.functionName}</dd>
            <dt>Arguments (raw units)</dt>
            <dd className="raw-data">
              {JSON.stringify(
                step.args,
                (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
                2,
              )}
            </dd>
            <dt>Native transfer</dt>
            <dd>None; network fee only</dd>
          </dl>
          <details className="calldata">
            <summary>Exact transaction data</summary>
            <code>{step.data}</code>
          </details>
          {steps.length > index + 1 && (
            <p className="small muted">
              Next: {steps[index + 1].label}. You will review and sign it
              separately.
            </p>
          )}
        </>
      )}
      {(!address || chainId !== r.chain.id) && (
        <p className="notice">
          Connect your wallet on {r.chain.name} to continue.
        </p>
      )}
      {error && (
        <ErrorNote retry={!step ? () => setAttempt((x) => x + 1) : undefined}>
          {error}
        </ErrorNote>
      )}
      {hash && (
        <p role="status">
          <a
            className="text-link"
            href={`${r.config.chain.explorerUrl}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View submitted transaction <Icon name="external" size={16} />
          </a>
        </p>
      )}
      <div className="form-actions">
        <button className="button secondary" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button
          className="button primary"
          disabled={
            loading ||
            busy ||
            !wallet ||
            !step ||
            address !== preparedFor ||
            chainId !== r.chain.id
          }
          onClick={() => void send()}
        >
          {busy
            ? hash
              ? "Confirming…"
              : "Check your wallet…"
            : hash
              ? "Check confirmation"
              : "Confirm in wallet"}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}

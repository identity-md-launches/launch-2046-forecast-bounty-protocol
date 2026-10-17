import { useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import type { Runtime } from "../config";
import type { Snapshot } from "../protocol";
import { Awaiting, ErrorNote, Icon, Modal } from "./ui";
import { TransactionReview, type TransactionIntent } from "./Transaction";

export function Create({
  runtime: r,
  snapshot,
  onClose,
  connect,
  refresh,
}: {
  runtime: Runtime;
  snapshot?: Snapshot;
  onClose: () => void;
  connect: () => void;
  refresh: () => void;
}) {
  const { isConnected, chainId } = useAccount();
  const [question, setQuestion] = useState("");
  const [reward, setReward] = useState("");
  const [deadline, setDeadline] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");
  const [intent, setIntent] = useState<TransactionIntent>();
  const [busy, setBusy] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setErrorField("");
    if (!r.deployed || !snapshot || !isConnected || chainId !== r.chain.id)
      return;
    let field = "question";
    try {
      if (!question.trim()) throw new Error("Add a numeric question.");
      field = "source";
      if (!source.trim()) throw new Error("Add a public resolution source.");
      field = "reward";
      if (
        !/^\d+(\.\d+)?$/.test(reward) ||
        (reward.split(".")[1]?.length || 0) > snapshot.decimals
      )
        throw new Error("Enter a positive reward within the token precision.");
      const amount = parseUnits(reward, snapshot.decimals);
      const seconds = Math.floor(new Date(deadline).getTime() / 1000);
      if (amount <= 0n || amount >= 2n ** 256n)
        throw new Error("Enter a positive reward within the supported range.");
      field = "deadline";
      if (
        !Number.isSafeInteger(seconds) ||
        seconds <= Date.now() / 1000 ||
        BigInt(seconds) <= snapshot.timestamp
      )
        throw new Error("Choose a deadline in the future.");
      setIntent({
        functionName: "createBounty",
        args: [question.trim(), amount, BigInt(seconds), source.trim()],
        title: "Create bounty",
        spend: amount,
        summary: `Fund “${question.trim()}” with ${reward} ${snapshot.symbol}. The reward is held by the protocol until it can be claimed.`,
      });
    } catch (e) {
      setError((e as Error).message);
      setErrorField(field);
      document.getElementById(field)?.focus();
    }
  }
  return (
    <Modal
      title={intent ? "Review transaction" : "Create a bounty"}
      onClose={() => {
        if (!busy) onClose();
      }}
      busy={busy}
      wide
    >
      {intent ? (
        <TransactionReview
          runtime={r}
          intent={intent}
          onBusy={setBusy}
          onDone={refresh}
          onFinish={onClose}
          onBack={() => setIntent(undefined)}
        />
      ) : (
        <form onSubmit={submit}>
          <p className="muted">
            Ask a numeric question. Fund the closest forecast.
          </p>
          {!r.deployed && (
            <div className="notice">
              <Awaiting />
              <p>
                You can draft a bounty now. Publishing opens after deployment.
              </p>
            </div>
          )}
          <div className="form-field">
            <label htmlFor="question">Question</label>
            <textarea
              id="question"
              aria-invalid={errorField === "question"}
              aria-describedby={
                errorField === "question" ? "create-error" : undefined
              }
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What numeric outcome should people forecast?"
              required
              maxLength={500}
              rows={3}
            />
            <span className="hint">
              Include the unit and the date being measured.
            </span>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="reward">
                Reward{snapshot ? ` (${snapshot.symbol})` : ""}
              </label>
              <input
                id="reward"
                aria-invalid={errorField === "reward"}
                aria-describedby={
                  errorField === "reward" ? "create-error" : undefined
                }
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                inputMode="decimal"
                placeholder="Enter amount"
                required
                autoComplete="off"
              />
            </div>
            <div className="form-field">
              <label htmlFor="deadline">Forecast deadline</label>
              <input
                id="deadline"
                aria-invalid={errorField === "deadline"}
                aria-describedby={
                  errorField === "deadline" ? "create-error" : undefined
                }
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />
              <span className="hint">Your local time.</span>
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="source">Resolution source</label>
            <textarea
              id="source"
              aria-invalid={errorField === "source"}
              aria-describedby={
                errorField === "source" ? "create-error" : undefined
              }
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Name the source, metric and measurement time."
              required
              maxLength={1000}
              rows={3}
            />
            <span className="hint">Use a public source anyone can verify.</span>
          </div>
          {error && (
            <div id="create-error">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          {r.deployed && !snapshot && (
            <p className="notice">
              Waiting for verified contract data before preparing a transaction.
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Close draft
            </button>
            {r.deployed && !isConnected ? (
              <button
                type="button"
                className="button primary"
                onClick={connect}
              >
                Connect to continue
              </button>
            ) : (
              <button
                type="submit"
                className="button primary"
                disabled={!r.deployed || !snapshot || chainId !== r.chain.id}
              >
                Review transaction
                <Icon name="arrow" size={16} />
              </button>
            )}
          </div>
          {r.deployed && isConnected && chainId !== r.chain.id && (
            <p className="hint">
              Use the wallet control to switch to {r.chain.name}.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}

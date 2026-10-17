import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { Runtime } from "../config";
import {
  absolute,
  addressUrl,
  money,
  readForecasts,
  readPosition,
  readableError,
  type Bounty,
  type Snapshot,
} from "../protocol";
import { ErrorNote, EventValue, Icon, Modal, Status } from "./ui";
import { TransactionReview, type TransactionIntent } from "./Transaction";

export function BountyDetail({
  runtime: r,
  bounty: b,
  snapshot: s,
  refresh,
  connect,
}: {
  runtime: Runtime;
  bounty: Bounty;
  snapshot: Snapshot;
  refresh: () => void;
  connect: () => void;
}) {
  const { address, chainId } = useAccount();
  const [forecast, setForecast] = useState("");
  const [error, setError] = useState("");
  const [intent, setIntent] = useState<TransactionIntent>();
  const [busy, setBusy] = useState(false);
  const position = useQuery({
    queryKey: ["position", b.id.toString(), address, s.block.toString()],
    queryFn: () => readPosition(r, b.id, address!, s.block),
    enabled: Boolean(address),
  });
  const forecasts = useQuery({
    queryKey: ["forecasts", b.id.toString(), s.block.toString()],
    queryFn: () => readForecasts(r, b, s.block),
    enabled: b.state !== "open",
  });
  useEffect(() => {
    if (position.data?.submitted) setForecast("");
  }, [position.data?.submitted]);
  const canTransact = address && chainId === r.chain.id;
  const deadlinePassed = b.deadline <= s.timestamp;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (
      !canTransact ||
      !position.data ||
      position.data.submitted ||
      deadlinePassed ||
      b.state !== "open"
    )
      return;
    try {
      if (!/^-?\d+$/.test(forecast.trim()))
        throw new Error(
          "Enter a whole number, using the unit in the question.",
        );
      const value = BigInt(forecast.trim());
      if (value < -(2n ** 255n) || value >= 2n ** 255n)
        throw new Error(
          "This forecast is outside the contract’s supported range.",
        );
      setIntent({
        functionName: "submitForecast",
        args: [b.id, value],
        title: "Submit forecast",
        spend: b.bond,
        summary: `Submit ${value.toString()} with a fully refundable bond of ${money(b.bond, s.decimals)} ${s.symbol}. You can withdraw your full bond after resolution, whether you win or lose.`,
      });
    } catch (e) {
      setError((e as Error).message);
      document.getElementById("forecast")?.focus();
    }
  };
  return (
    <>
      <a href="#bounties" className="text-link back-link">
        ← All bounties
      </a>
      <div className="detail-title">
        <Status state={b.state} />
        <p className="muted">
          Bounty{" "}
          <EventValue runtime={r} event={b.created}>
            #{b.id.toString()}
          </EventValue>
        </p>
        <h1>{b.question}</h1>
      </div>
      <div className="detail-layout">
        <section className="detail-main" aria-label="Bounty details">
          <dl className="bounty-facts">
            <div>
              <dt>Reward</dt>
              <dd>
                <EventValue runtime={r} event={b.created}>
                  {money(b.reward, s.decimals)}{" "}
                  <span className="unit">{s.symbol}</span>
                </EventValue>
              </dd>
            </div>
            <div>
              <dt>Forecast deadline</dt>
              <dd>
                <EventValue runtime={r} event={b.created}>
                  {new Date(Number(b.deadline) * 1000).toLocaleString(
                    undefined,
                    { dateStyle: "medium", timeStyle: "short" },
                  )}
                </EventValue>
              </dd>
            </div>
            <div>
              <dt>Forecasts submitted</dt>
              <dd>
                <EventValue runtime={r} event={b.forecastEvent || b.created}>
                  {b.forecastCount.toString()}
                </EventValue>
              </dd>
            </div>
            <div>
              <dt>Refundable bond</dt>
              <dd>
                <EventValue runtime={r} event={b.created}>
                  {money(b.bond, s.decimals)} {s.symbol}
                </EventValue>
              </dd>
            </div>
          </dl>
          <div className="detail-text">
            <h2>Resolution source</h2>
            <p className="preserve-lines">{b.source}</p>
            <h3>Resolver</h3>
            <a
              className="address text-link"
              href={addressUrl(r, b.resolver)}
              target="_blank"
              rel="noreferrer"
            >
              {b.resolver}
              <Icon name="external" size={16} />
            </a>
          </div>
          {b.state === "open" ? (
            <div className="sealed-note">
              <Icon name="lock" />
              <div>
                <h3>Forecasts stay hidden here.</h3>
                <p>
                  Only the forecast count is shown until the creator resolves
                  the bounty.
                </p>
              </div>
            </div>
          ) : (
            b.resolution && (
              <section className="resolution">
                <h2>The result</h2>
                <dl className="bounty-facts">
                  <div>
                    <dt>True value</dt>
                    <dd>
                      <EventValue runtime={r} event={b.resolution}>
                        {b.trueValue.toString()}
                      </EventValue>
                    </dd>
                  </div>
                  <div>
                    <dt>Winning forecast</dt>
                    <dd>
                      <EventValue runtime={r} event={b.resolution}>
                        {b.winningForecast.toString()}
                      </EventValue>
                    </dd>
                  </div>
                </dl>
                <p className="muted">Winner</p>
                <a
                  className="text-link address"
                  href={addressUrl(r, b.winner)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {b.winner}
                </a>
                <h3 className="table-title">All forecasts</h3>
                {forecasts.isPending ? (
                  <p role="status">Reading resolved forecasts…</p>
                ) : forecasts.isError ? (
                  <ErrorNote retry={() => void forecasts.refetch()}>
                    {readableError(forecasts.error)}
                  </ErrorNote>
                ) : (
                  <div className="forecast-table-wrap">
                    <table className="forecast-table">
                      <thead>
                        <tr>
                          <th>Submitter</th>
                          <th>Forecast</th>
                          <th>Absolute error</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecasts.data.map((f, i) => (
                          <tr key={`${f.submitter}-${i}`}>
                            <td data-label="Submitter">
                              <a
                                className="address text-link"
                                href={addressUrl(r, f.submitter)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {f.submitter}
                              </a>
                            </td>
                            <td data-label="Forecast">
                              <EventValue
                                runtime={r}
                                event={b.events.find(
                                  (e) =>
                                    e.name === "ForecastSubmitted" &&
                                    String(e.args.forecaster).toLowerCase() ===
                                      f.submitter.toLowerCase(),
                                )!}
                              >
                                {f.value.toString()}
                              </EventValue>
                            </td>
                            <td data-label="Absolute error">
                              <EventValue runtime={r} event={b.resolution!}>
                                {absolute(f.value - b.trueValue).toString()}
                              </EventValue>
                            </td>
                            <td data-label="Result">
                              {f.submitter.toLowerCase() ===
                                b.winner.toLowerCase() &&
                              f.value === b.winningForecast ? (
                                <span className="winner-label">Winner</span>
                              ) : (
                                "Participant"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )
          )}
        </section>
        <aside className="action-panel">
          <h2>
            {b.state === "open" ? "Make your forecast" : "Your settlement"}
          </h2>
          {b.state === "open" ? (
            <form onSubmit={submit}>
              <div className="form-field">
                <label htmlFor="forecast">Your numeric forecast</label>
                <input
                  id="forecast"
                  inputMode="text"
                  value={forecast}
                  onChange={(e) => setForecast(e.target.value)}
                  placeholder="Enter a whole number"
                  required
                  disabled={deadlinePassed || position.data?.submitted}
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    error ? "forecast-help forecast-error" : "forecast-help"
                  }
                />
              </div>
              <p id="forecast-help" className="small muted">
                Use the unit specified in the question. Your bond is fully
                refundable.
              </p>
              {deadlinePassed ? (
                <p className="notice">
                  The deadline has passed. Awaiting the creator’s resolution.
                </p>
              ) : position.data?.submitted ? (
                <p className="notice">
                  Your forecast is submitted. Its value stays hidden here until
                  resolution.
                </p>
              ) : !address ? (
                <button
                  type="button"
                  className="button primary full"
                  onClick={connect}
                >
                  Connect to forecast
                </button>
              ) : (
                <button
                  className="button primary full"
                  type="submit"
                  disabled={!canTransact || !position.data}
                >
                  Review forecast
                  <Icon name="arrow" size={16} />
                </button>
              )}
            </form>
          ) : (
            <>
              <p className="muted">
                Every participant can withdraw their full bond. The winner can
                also claim the reward.
              </p>
              {!address ? (
                <button className="button primary full" onClick={connect}>
                  Connect to view settlement
                </button>
              ) : (
                <div className="settlement-actions">
                  <button
                    className="button primary full"
                    disabled={!canTransact || !position.data?.canWithdraw}
                    onClick={() =>
                      setIntent({
                        functionName: "withdrawBond",
                        args: [b.id],
                        title: "Withdraw bond",
                        summary:
                          "Withdraw your full refundable bond to your connected wallet.",
                      })
                    }
                  >
                    Withdraw bond
                    <Icon name="arrow" size={16} />
                  </button>
                  <button
                    className="button secondary full"
                    disabled={
                      !canTransact ||
                      !position.data?.canClaim ||
                      b.state !== "claimable" ||
                      address.toLowerCase() !== b.winner.toLowerCase()
                    }
                    onClick={() =>
                      setIntent({
                        functionName: "claimReward",
                        args: [b.id],
                        title: "Claim reward",
                        summary:
                          "Claim the winning reward to your connected wallet.",
                      })
                    }
                  >
                    Claim reward
                  </button>
                  {position.data && (
                    <p className="hint">
                      {!position.data.submitted
                        ? "This wallet did not submit a forecast."
                        : !position.data.canWithdraw && !position.data.canClaim
                          ? "No withdrawal or reward is currently available for this wallet."
                          : "Available actions are verified from contract state."}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {address && position.isPending && (
            <p role="status" className="hint">
              Checking your position…
            </p>
          )}
          {position.isError && (
            <ErrorNote retry={() => void position.refetch()}>
              {readableError(position.error)}
            </ErrorNote>
          )}
          {error && (
            <div id="forecast-error">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          {address && !canTransact && (
            <p className="notice">
              Switch to {r.chain.name} using the wallet control.
            </p>
          )}
          <a
            className="text-link panel-link"
            href={addressUrl(r, r.bountyAddress)}
            target="_blank"
            rel="noreferrer"
          >
            View contract on Etherscan
            <Icon name="external" size={16} />
          </a>
        </aside>
      </div>
      {intent && (
        <Modal
          title="Review transaction"
          wide
          busy={busy}
          onClose={() => {
            if (!busy) setIntent(undefined);
          }}
        >
          <TransactionReview
            runtime={r}
            intent={intent}
            onBusy={setBusy}
            onBack={() => setIntent(undefined)}
            onDone={() => {
              setForecast("");
              refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}

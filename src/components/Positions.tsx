import { useState } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { Runtime } from "../config";
import { money, readPosition, readableError, type Snapshot } from "../protocol";
import {
  EmptyDeployment,
  ErrorNote,
  EventValue,
  Icon,
  Modal,
  Status,
} from "./ui";
import { TransactionReview, type TransactionIntent } from "./Transaction";

export function Positions({
  runtime: r,
  snapshot: s,
  connect,
  refresh,
}: {
  runtime: Runtime;
  snapshot?: Snapshot;
  connect: () => void;
  refresh: () => void;
}) {
  const { address, chainId } = useAccount();
  const [intent, setIntent] = useState<TransactionIntent>();
  const [busy, setBusy] = useState(false);
  const positions = useQuery({
    queryKey: ["positions", address, s?.block.toString()],
    enabled: Boolean(address && s && r.deployed),
    queryFn: async () => {
      const all = [];
      for (let i = 0; i < s!.bounties.length; i += 5)
        all.push(
          ...(await Promise.all(
            s!.bounties.slice(i, i + 5).map(async (bounty) => ({
              bounty,
              position: await readPosition(r, bounty.id, address!, s!.block),
            })),
          )),
        );
      return all.filter(
        (p) =>
          p.position.submitted || p.position.canClaim || p.position.canWithdraw,
      );
    },
  });
  return (
    <section className="positions">
      <div className="section-heading">
        <h1>My positions</h1>
        <p className="muted">Your forecasts, refundable bonds and rewards.</p>
      </div>
      {address && chainId !== r.chain.id && (
        <p className="notice">
          Switch to {r.chain.name} using the wallet control to withdraw or
          claim.
        </p>
      )}
      {!r.deployed ? (
        <EmptyDeployment level={2} title="Your forecasts belong here." />
      ) : !address ? (
        <div className="empty-deployment">
          <Icon name="wallet" size={36} />
          <h2>See your positions.</h2>
          <p>Connect a wallet to read its onchain activity.</p>
          <button className="button primary" onClick={connect}>
            Connect to view positions
            <Icon name="arrow" size={16} />
          </button>
        </div>
      ) : !s || positions.isPending ? (
        <p className="loading" role="status">
          Reading your positions…
        </p>
      ) : positions.isError ? (
        <ErrorNote retry={() => void positions.refetch()}>
          {readableError(positions.error)}
        </ErrorNote>
      ) : positions.data.length === 0 ? (
        <div className="empty-deployment">
          <h2>No forecasts yet.</h2>
          <p>Your positions appear after you submit a forecast.</p>
          <a className="button secondary" href="#bounties">
            Explore bounties
            <Icon name="arrow" size={16} />
          </a>
        </div>
      ) : (
        <div className="position-list">
          {positions.data.map(({ bounty: b, position: p }) => {
            const event =
              [...b.events]
                .reverse()
                .find(
                  (e) =>
                    String(
                      e.args.participant || e.args.forecaster || "",
                    ).toLowerCase() === address?.toLowerCase(),
                ) ||
              b.forecastEvent ||
              b.created;
            const canWithdraw = p.canWithdraw && b.state !== "open";
            const canClaim =
              p.canClaim &&
              b.state === "claimable" &&
              b.winner.toLowerCase() === address?.toLowerCase();
            return (
              <article className="position-row" key={b.id.toString()}>
                <div>
                  <Status state={b.state} />
                  <h2>
                    <a href={`#bounty/${b.id}`}>{b.question}</a>
                  </h2>
                  <p className="small muted">
                    Bond locked:{" "}
                    <EventValue runtime={r} event={event}>
                      {money(p.bondLocked, s.decimals)} {s.symbol}
                    </EventValue>
                  </p>
                  <p className="small">
                    {canWithdraw
                      ? "Your full bond is withdrawable."
                      : b.state === "open"
                        ? "Bond refundable after resolution."
                        : "No bond withdrawal available."}
                  </p>
                </div>
                <div className="position-links">
                  <button
                    className="button secondary"
                    disabled={!canWithdraw || chainId !== r.chain.id}
                    onClick={() =>
                      setIntent({
                        functionName: "withdrawBond",
                        args: [b.id],
                        title: "Withdraw bond",
                        summary: `Withdraw your full refundable bond for “${b.question}” to your connected wallet.`,
                      })
                    }
                  >
                    Withdraw bond
                    <Icon name="arrow" size={16} />
                  </button>
                  <button
                    className="button secondary"
                    disabled={!canClaim || chainId !== r.chain.id}
                    onClick={() =>
                      setIntent({
                        functionName: "claimReward",
                        args: [b.id],
                        title: "Claim reward",
                        summary: `Claim the winning reward for “${b.question}” to your connected wallet.`,
                      })
                    }
                  >
                    Claim reward
                    <Icon name="arrow" size={16} />
                  </button>
                  <a className="text-link small" href={`#bounty/${b.id}`}>
                    View position
                    <Icon name="arrow" size={16} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
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
            onDone={refresh}
            onBack={() => setIntent(undefined)}
          />
        </Modal>
      )}
    </section>
  );
}

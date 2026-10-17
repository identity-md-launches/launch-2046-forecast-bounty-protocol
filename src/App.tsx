import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Runtime } from "./config";
import {
  addressUrl,
  eventUrl,
  money,
  readSnapshot,
  readableError,
  totals,
  type Evidence,
  type Snapshot,
} from "./protocol";
import {
  Awaiting,
  Brand,
  EmptyDeployment,
  ErrorNote,
  EventValue,
  Icon,
  Modal,
  Status,
} from "./components/ui";
import { Wallet } from "./components/Wallet";
import { Create } from "./components/Create";
import { BountyDetail } from "./components/BountyDetail";
import { Positions } from "./components/Positions";

function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "bounties");
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "bounties");
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  return route;
}
function Stats({
  runtime: r,
  snapshot,
  loading,
}: {
  runtime: Runtime;
  snapshot?: Snapshot;
  loading: boolean;
}) {
  const [evidence, setEvidence] = useState<{
    label: string;
    events: Evidence[];
  }>();
  const data = snapshot
    ? totals(snapshot)
    : [
        "Bounties created",
        "Rewards paid out",
        "Forecasts submitted",
        "Bonds locked",
      ].map((label) => ({
        label,
        value: "",
        unit: undefined,
        events: [] as Evidence[],
        empty: "",
      }));
  return (
    <>
      <section className="stats-strip" aria-label="Protocol activity">
        {data.map((item) => (
          <div className="stat" key={item.label}>
            <p className="stat-label">{item.label}</p>
            {!r.deployed ? (
              <Awaiting compact />
            ) : !snapshot ? (
              <span className="muted small">
                {loading ? "Reading events…" : "Data unavailable"}
              </span>
            ) : item.events.length ? (
              <>
                <div className="stat-value">
                  <EventValue
                    runtime={r}
                    event={item.events[item.events.length - 1]}
                    label={`${item.label}: ${item.value} ${item.unit || ""}`}
                  >
                    {item.value}
                  </EventValue>
                  {item.unit && <span className="unit">{item.unit}</span>}
                </div>
                <button
                  className="source-button"
                  onClick={() => setEvidence(item)}
                >
                  View source events
                  <Icon name="external" size={12} />
                </button>
              </>
            ) : (
              <span className="muted small">{item.empty}</span>
            )}
          </div>
        ))}
      </section>
      {evidence && (
        <Modal title={evidence.label} onClose={() => setEvidence(undefined)}>
          <p className="muted">
            This total is calculated from the complete event history. Each
            contribution links to its transaction.
          </p>
          <ul className="evidence-list">
            {evidence.events.map((e) => (
              <li key={`${e.hash}-${e.logIndex}`}>
                <a
                  className="text-link"
                  href={eventUrl(r, e)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.name} · bounty {String(e.args.id)}
                  <Icon name="external" size={16} />
                </a>
                {e.args.amount !== undefined && snapshot && (
                  <p>
                    <EventValue runtime={r} event={e}>
                      {money(e.args.amount as bigint, snapshot.decimals)}{" "}
                      {snapshot.symbol}
                    </EventValue>
                  </p>
                )}
                {e.args.bond !== undefined && snapshot && (
                  <p>
                    <EventValue runtime={r} event={e}>
                      {money(e.args.bond as bigint, snapshot.decimals)}{" "}
                      {snapshot.symbol}
                    </EventValue>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
function BountyBoard({
  runtime: r,
  snapshot: s,
  loading,
  create,
}: {
  runtime: Runtime;
  snapshot?: Snapshot;
  loading: boolean;
  create: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const items =
    s?.bounties
      .filter(
        (b) =>
          (filter === "all" || filter === b.state) &&
          `${b.question} ${b.id}`.toLowerCase().includes(search.toLowerCase()),
      )
      .slice()
      .sort((a, b) => {
        const x =
          sort === "deadline"
            ? a.deadline - b.deadline
            : sort === "reward"
              ? b.reward - a.reward
              : b.id - a.id;
        return x < 0n ? -1 : x > 0n ? 1 : 0;
      }) || [];
  return (
    <section className="board" aria-labelledby="board-title">
      <div className="board-heading">
        <h2 id="board-title">Bounty board</h2>
        <span className="small muted board-caption">
          A question. A number. A reward.
        </span>
      </div>
      <div className="board-controls">
        <div className="filter-group" aria-label="Filter by bounty state">
          {["all", "open", "resolved", "claimable"].map((f) => (
            <button
              key={f}
              className={`filter-button ${filter === f ? "selected" : ""}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All bounties" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="sort-control">
          <label htmlFor="sort">Sort</label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="deadline">Deadline soonest</option>
            <option value="reward">Largest reward</option>
          </select>
        </div>
      </div>
      {r.deployed && (
        <div className="search-field">
          <label htmlFor="search" className="sr-only">
            Search bounty questions or IDs
          </label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions or bounty IDs"
          />
        </div>
      )}
      {!r.deployed ? (
        <EmptyDeployment
          action={
            <a className="text-link" href="#how-it-works">
              How bounties work
              <Icon name="arrow" size={16} />
            </a>
          }
        />
      ) : !s ? (
        <div className="empty-deployment" role="status">
          <Icon name="refresh" size={32} />
          <h3>{loading ? "Reading the chain." : "Data unavailable."}</h3>
          <p>
            {loading
              ? "Checking bounty state and its source events."
              : "Use the retry control to reconnect to the network."}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-deployment">
          <Icon name="target" size={32} />
          <h3>
            {s.bounties.length
              ? "No matching bounties."
              : "An open question starts here."}
          </h3>
          <p>
            {s.bounties.length
              ? "Try another state or clear your search."
              : "Create a bounty and invite people to forecast."}
          </p>
          {s.bounties.length ? (
            <button
              className="button secondary"
              onClick={() => {
                setFilter("all");
                setSearch("");
              }}
            >
              Clear filters
            </button>
          ) : (
            <button className="button secondary" onClick={create}>
              Create a bounty
              <Icon name="plus" size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="bounty-list">
          <div className="list-labels" aria-hidden="true">
            <span>Question</span>
            <span>Reward</span>
            <span>Deadline</span>
            <span>Forecasts</span>
            <span>State</span>
          </div>
          {items.map((b) => (
            <article className="bounty-row" key={b.id.toString()}>
              <div className="bounty-question">
                <EventValue runtime={r} event={b.created}>
                  #{b.id.toString()}
                </EventValue>
                <h3>
                  <a href={`#bounty/${b.id}`}>
                    {b.question}
                    <Icon name="arrow" size={16} />
                  </a>
                </h3>
              </div>
              <div className="row-value">
                <span className="mobile-label">Reward</span>
                <EventValue runtime={r} event={b.created}>
                  {money(b.reward, s.decimals)}
                </EventValue>
                <span className="unit">{s.symbol}</span>
              </div>
              <div className="row-value">
                <span className="mobile-label">Deadline</span>
                <EventValue runtime={r} event={b.created}>
                  {new Date(Number(b.deadline) * 1000).toLocaleString(
                    undefined,
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </EventValue>
              </div>
              <div className="row-value">
                <span className="mobile-label">Forecasts</span>
                <EventValue runtime={r} event={b.forecastEvent || b.created}>
                  {b.forecastCount.toString()}
                </EventValue>
              </div>
              <div className="row-state">
                <Status state={b.state} />
                <a
                  className="text-link small"
                  href={eventUrl(r, b.created)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Etherscan
                  <Icon name="external" size={12} />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="board-foot">
        <Icon name="lock" size={16} />
        <p>Forecast values stay hidden here until resolution.</p>
      </div>
    </section>
  );
}
function HowItWorks() {
  return (
    <section className="how-page">
      <div className="section-heading">
        <h1>Let the closest number win.</h1>
        <p className="muted">A public bounty for a numeric question.</p>
      </div>
      <div className="how-grid">
        <article>
          <Icon name="plus" size={28} />
          <h2>Post a question</h2>
          <p>
            A creator sets the question, funds the reward and chooses a forecast
            deadline. The resolution source makes the result verifiable.
          </p>
        </article>
        <article>
          <Icon name="target" size={28} />
          <h2>Make a forecast</h2>
          <p>
            Submit a number with the required bond. This site shows only the
            forecast count until the creator resolves.
          </p>
        </article>
        <article>
          <Icon name="check" size={28} />
          <h2>Settle on the truth</h2>
          <p>
            The creator resolves with the true value. The closest forecast wins
            the reward. Every participant can withdraw their bond in full.
          </p>
        </article>
      </div>
      <div className="help-notes">
        <h2>Your bond comes back.</h2>
        <p>
          Winning or losing does not change your bond refund. Network fees still
          apply. Bonds become withdrawable after resolution; the contract
          determines when rewards are claimable.
        </p>
        <h2>What “hidden” means</h2>
        <p>
          This viewer does not fetch or display individual forecasts before
          resolution. Public blockchain transactions may still reveal submitted
          values. This interface does not provide cryptographic secrecy.
        </p>
        <h2>Follow the source</h2>
        <p>
          Bounty figures link to their source events on Etherscan. Protocol
          totals are calculated from event history, with the contributing events
          available beside each total.
        </p>
        <h2>Who resolves?</h2>
        <p>
          The creator resolves through the protocol. This public client offers
          no resolution, deployment or privileged controls. Read each bounty’s
          source and resolver before submitting.
        </p>
      </div>
      <a className="button primary" href="#bounties">
        Explore bounties
        <Icon name="arrow" size={16} />
      </a>
    </section>
  );
}
function Contracts({ runtime: r }: { runtime: Runtime }) {
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  return (
    <section className="contracts" aria-labelledby="contracts-title">
      <h2 id="contracts-title">Verify the contracts.</h2>
      <p className="muted">Public addresses. Verifiable activity.</p>
      <div className="contract-grid">
        {Object.entries(r.config.contracts).map(([key, item]) => (
          <div className="contract-row" key={key}>
            <div>
              <h3>
                {key === "bounty" ? "Bounty protocol" : "Reward & bond token"}
              </h3>
              {item.address ? (
                <a
                  className="address text-link"
                  href={addressUrl(r, item.address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.address}
                  <Icon name="external" size={16} />
                </a>
              ) : (
                <Awaiting compact />
              )}
            </div>
            {item.address && (
              <button
                className="icon-button"
                aria-label={`Copy ${key} contract address`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(item.address);
                    setCopied(key);
                    setCopyError("");
                  } catch {
                    setCopyError(
                      "Copy unavailable. Select and copy the full address shown.",
                    );
                  }
                }}
              >
                <Icon name={copied === key ? "check" : "copy"} />
              </button>
            )}
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        {copied ? `${copied} contract address copied` : ""}
      </span>
      {copyError && <ErrorNote>{copyError}</ErrorNote>}
    </section>
  );
}
export default function App({ runtime: r }: { runtime: Runtime }) {
  const route = useRoute();
  const [walletOpen, setWalletOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const previousRoute = useRef(route);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["protocol"],
    queryFn: async ({ signal }) => {
      const s = await readSnapshot(r, signal);
      totals(s);
      return s;
    },
    enabled: r.deployed,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  // A failed refresh hides the last snapshot: stale figures never look current.
  const snapshot = query.isError ? undefined : query.data;
  const refresh = () => {
    void queryClient.invalidateQueries();
  };
  useEffect(() => {
    if (route !== previousRoute.current) {
      mainRef.current?.focus();
      window.scrollTo(0, 0);
      previousRoute.current = route;
    }
  }, [route]);
  const detailId = route.match(/^bounty\/(\d+)$/)?.[1];
  const bounty =
    detailId && snapshot?.bounties.find((b) => b.id.toString() === detailId);
  const activeNav = detailId ? "bounties" : route;
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
          mainRef.current?.scrollIntoView({ block: "start" });
        }}
      >
        Skip to content
      </a>
      <header className="header shell">
        <Brand />
        <div className="header-tools">
          <span className="network">
            <span className="status-dot" />
            {r.chain.name}
          </span>
          <Wallet runtime={r} open={walletOpen} setOpen={setWalletOpen} />
        </div>
      </header>
      <div className="nav-wrap">
        <nav className="nav shell" aria-label="Main navigation">
          <a
            href="#bounties"
            aria-current={activeNav === "bounties" ? "page" : undefined}
          >
            Bounties
          </a>
          <a
            href="#positions"
            aria-current={activeNav === "positions" ? "page" : undefined}
          >
            My positions
          </a>
          <a
            href="#how-it-works"
            aria-current={activeNav === "how-it-works" ? "page" : undefined}
          >
            How it works
            <Icon name="arrow" size={14} />
          </a>
        </nav>
      </div>
      <main className="shell main" id="main" ref={mainRef} tabIndex={-1}>
        {query.isError && (
          <ErrorNote retry={() => void query.refetch()}>
            Could not verify the onchain data. {readableError(query.error)}
          </ErrorNote>
        )}
        {route === "bounties" || route === "main" ? (
          <>
            <section className="intro">
              <div>
                <h1>Forecast the number.</h1>
                <p>Closest guess takes the bounty.</p>
              </div>
              <button
                className="button primary create-button"
                onClick={() => setCreating(true)}
              >
                <Icon name="plus" size={18} />
                Create a bounty
              </button>
            </section>
            <div className="dashboard">
              <Stats
                runtime={r}
                snapshot={snapshot}
                loading={query.isFetching}
              />
              <BountyBoard
                runtime={r}
                snapshot={snapshot}
                loading={query.isFetching}
                create={() => setCreating(true)}
              />
            </div>
            <section className="principles" aria-label="Bounty principles">
              <div>
                <Icon name="target" />
                <h3>Closest forecast wins</h3>
                <p>Accuracy takes the reward.</p>
              </div>
              <div>
                <Icon name="lock" />
                <h3>Fully refundable bonds</h3>
                <p>Win or lose, your bond comes back.</p>
              </div>
              <div>
                <Icon name="external" />
                <h3>Onchain from the start</h3>
                <p>Every outcome leaves a record.</p>
              </div>
            </section>
          </>
        ) : route === "positions" ? (
          <Positions
            runtime={r}
            snapshot={snapshot}
            refresh={refresh}
            connect={() => setWalletOpen(true)}
          />
        ) : route === "how-it-works" ? (
          <HowItWorks />
        ) : detailId ? (
          !r.deployed ? (
            <>
              <a className="text-link" href="#bounties">
                ← All bounties
              </a>
              <EmptyDeployment level={1} title="Awaiting the first bounty." />
            </>
          ) : bounty && snapshot ? (
            <BountyDetail
              key={detailId}
              runtime={r}
              bounty={bounty}
              snapshot={snapshot}
              refresh={refresh}
              connect={() => setWalletOpen(true)}
            />
          ) : query.isFetching ? (
            <p className="loading" role="status">
              Reading this bounty…
            </p>
          ) : (
            <div className="empty-deployment">
              <h1>
                {query.isError ? "Bounty data unavailable" : "Bounty not found"}
              </h1>
              <p>
                {query.isError
                  ? "Retry the network read above to verify this bounty."
                  : "This bounty is not in the configured contract’s event history."}
              </p>
              <a href="#bounties" className="button secondary">
                Return to bounties
              </a>
            </div>
          )
        ) : (
          <div className="empty-deployment">
            <h1>Page not found</h1>
            <a href="#bounties" className="button primary">
              Explore bounties
            </a>
          </div>
        )}
        <Contracts runtime={r} />
      </main>
      <footer className="footer shell">
        <span>Forecast Bounty</span>
        <div>
          {r.deployed ? (
            <button
              className="text-link"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <Icon name="refresh" size={14} />
              {query.isFetching ? "Refreshing events…" : "Refresh onchain data"}
            </button>
          ) : (
            <span className="small muted">Awaiting deployment</span>
          )}
          <a
            href="https://github.com/identity-md-launches/launch-2046-forecast-bounty-protocol"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
            <Icon name="external" size={14} />
          </a>
        </div>
      </footer>
      {creating && (
        <Create
          runtime={r}
          snapshot={snapshot}
          onClose={() => setCreating(false)}
          connect={() => setWalletOpen(true)}
          refresh={refresh}
        />
      )}
    </>
  );
}

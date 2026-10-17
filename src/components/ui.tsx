import { useEffect, useId, useRef, type ReactNode } from "react";
import type { Runtime } from "../config";
import { eventUrl, type BountyState, type Evidence } from "../protocol";

export function Icon({
  name,
  size = 20,
}: {
  name:
    | "arrow"
    | "plus"
    | "wallet"
    | "target"
    | "lock"
    | "clock"
    | "copy"
    | "check"
    | "external"
    | "close"
    | "refresh";
  size?: number;
}) {
  const paths = {
    arrow: "M5 12h14m-6-6 6 6-6 6",
    plus: "M12 5v14M5 12h14",
    wallet: "M19 7H5V4h13v3M5 7a2 2 0 0 0-2 2v10h18V7H5m16 5h-6v4h6",
    target:
      "M12 2v4m0 12v4M2 12h4m12 0h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14",
    lock: "M6 10h12v10H6V10m3 0V7a3 3 0 0 1 6 0v3m-3 4v3",
    clock: "M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
    copy: "M9 9h11v11H9V9M5 15H3V3h12v2",
    check: "m5 12 4 4L19 6",
    external: "M14 3h7v7m0-7L10 14m0-10H3v17h17v-7",
    close: "m6 6 12 12M6 18 18 6",
    refresh: "M20 8a8 8 0 1 0 0 8m0-14v6h-6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand() {
  return (
    <a className="brand" href="#bounties" aria-label="Forecast Bounty home">
      <img
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        width="36"
        height="36"
        alt=""
      />
      <span>
        Forecast <span className="brand-secondary">Bounty</span>
      </span>
    </a>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current!;
    const active = document.activeElement as HTMLElement | null;
    d.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = before;
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target !== ref.current) return;
        const r = ref.current.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Awaiting({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`awaiting ${compact ? "compact" : ""}`}>
      <span className="status-dot" />
      Awaiting deployment
    </span>
  );
}
export function Status({ state }: { state: BountyState }) {
  return (
    <span className={`status status-${state}`}>
      <span className="status-dot" />
      {state}
    </span>
  );
}
export function EventValue({
  runtime,
  event,
  children,
  label,
}: {
  runtime: Runtime;
  event: Evidence;
  children: ReactNode;
  label?: string;
}) {
  return (
    <a
      className="event-value"
      href={eventUrl(runtime, event)}
      target="_blank"
      rel="noreferrer"
      aria-label={
        label ? `${label}. View source event on Etherscan` : undefined
      }
    >
      {children}
      <Icon name="external" size={12} />
    </a>
  );
}
export function ErrorNote({
  children,
  retry,
}: {
  children: ReactNode;
  retry?: () => void;
}) {
  return (
    <div className="error-note" role="alert">
      <p>{children}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <Icon name="refresh" size={16} />
          Try again
        </button>
      )}
    </div>
  );
}
export function EmptyDeployment({
  title = "The board is ready.",
  action,
  level = 3,
}: {
  title?: string;
  action?: ReactNode;
  level?: 1 | 2 | 3;
}) {
  const Heading = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  return (
    <div className="empty-deployment">
      <div className="empty-symbol">
        <Icon name="target" size={36} />
      </div>
      <Heading>{title}</Heading>
      <Awaiting />
      <p>Bounties will appear here when the protocol is deployed.</p>
      {action}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { getAddress } from "viem";
import type { Runtime } from "../config";
import { readableError, short } from "../protocol";
import { isMobileBrowser, OPEN_IN } from "../open-in";
import { ErrorNote, Icon, Modal } from "./ui";

export function Wallet({
  runtime,
  open,
  setOpen,
}: {
  runtime: Runtime;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [error, setError] = useState("");
  useEffect(() => {
    if (isConnected) {
      setOpen(false);
      setError("");
    }
  }, [isConnected, setOpen]);
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const mobile = isMobileBrowser() && !named;
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && !(mobile && c.type === "injected"),
  );
  const wrongChain = isConnected && chainId !== runtime.chain.id;
  const switchNetwork = async () => {
    setError("");
    try {
      await switchChainAsync({ chainId: runtime.chain.id });
    } catch (e) {
      setError(readableError(e));
      setOpen(true);
    }
  };
  return (
    <>
      <button
        className="button wallet-control"
        onClick={() => {
          if (wrongChain) void switchNetwork();
          else {
            setError("");
            setOpen(true);
          }
        }}
        disabled={switching}
      >
        <Icon name="wallet" size={18} />
        <span>
          {switching
            ? "Switching…"
            : wrongChain
              ? `Switch to ${runtime.chain.name}`
              : address
                ? short(getAddress(address))
                : "Connect wallet"}
        </span>
      </button>
      {open && (
        <Modal
          title={isConnected ? "Your wallet" : "Connect a wallet"}
          onClose={() => setOpen(false)}
        >
          <p className="muted wallet-intro">
            Connecting is read-only. Viewing never asks for a signature.
          </p>
          {error && <ErrorNote>{error}</ErrorNote>}
          {isConnected && address ? (
            <>
              <p className="address full-address">{getAddress(address)}</p>
              <p className="muted">
                {wrongChain
                  ? "Switch networks to make a transaction."
                  : `Connected to ${runtime.chain.name}.`}
              </p>
              {wrongChain && (
                <button
                  className="button primary full"
                  onClick={() => void switchNetwork()}
                  disabled={switching}
                >
                  Switch to {runtime.chain.name}
                </button>
              )}
              <button
                className="wallet-row"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect wallet
                <Icon name="arrow" />
              </button>
            </>
          ) : (
            <div className="wallet-list">
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    className="wallet-row"
                    key={w.id}
                    href={w.href(location.href)}
                  >
                    <img
                      src={`${import.meta.env.BASE_URL}wallets/${w.id}.svg`}
                      width="28"
                      height="28"
                      alt=""
                    />
                    <span>Open in {w.name}</span>
                    <Icon name="external" size={16} />
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  key={c.uid}
                  className="wallet-row"
                  disabled={isPending}
                  onClick={async () => {
                    setError("");
                    try {
                      await connectAsync({ connector: c });
                    } catch (e) {
                      setError(readableError(e));
                    }
                  }}
                >
                  {c.icon ? (
                    <img src={c.icon} width="28" height="28" alt="" />
                  ) : c.id === "coinbaseWalletSDK" ? (
                    <img
                      src={`${import.meta.env.BASE_URL}wallets/coinbase.svg`}
                      width="28"
                      height="28"
                      alt=""
                    />
                  ) : (
                    <Icon name="wallet" size={28} />
                  )}
                  <span>
                    {c.id === "injected"
                      ? "Browser wallet"
                      : c.id === "coinbaseWalletSDK"
                        ? mobile
                          ? "Coinbase Smart Wallet"
                          : "Coinbase Wallet"
                        : c.name}
                    {isPending && variables?.connector === c
                      ? " · Opening…"
                      : ""}
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              ))}
            </div>
          )}
          <p className="small muted wallet-foot">
            Your wallet stays in your control. Never share a private key or seed
            phrase.
          </p>
        </Modal>
      )}
    </>
  );
}

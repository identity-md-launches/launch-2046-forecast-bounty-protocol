import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles.css";
import { loadConfig, makeRuntime } from "./config";
import App from "./App";
import { Brand } from "./components/ui";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <div className="boot">
    <Brand />
    <p role="status">Loading deployment configuration…</p>
  </div>,
);
loadConfig()
  .then((config) => {
    const runtime = makeRuntime(config);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
    });
    root.render(
      <React.StrictMode>
        <WagmiProvider config={runtime.wallet}>
          <QueryClientProvider client={queryClient}>
            <App runtime={runtime} />
          </QueryClientProvider>
        </WagmiProvider>
      </React.StrictMode>,
    );
  })
  .catch(() => {
    root.render(
      <main className="boot">
        <Brand />
        <h1>Configuration unavailable</h1>
        <p role="alert">
          The site could not load a valid deployment configuration. No contract
          data or transactions are available.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Try again
        </button>
      </main>,
    );
  });

# Runtime contract interface

The authored configuration is `public/forecast.config.json`; its production copy is `dist/forecast.config.json`. Every address is intentionally empty. Changing addresses requires no frontend recompilation when editing the production copy. An IPFS deployment must be repinned after any file change because content addresses are immutable.

No deployed contracts or verified ABIs were supplied. This document specifies the adapter implemented by this client. It is an integration requirement, not a claim about a live contract. Never populate it with test addresses or a contract whose interface and economics have not been verified.

## Configuration fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Configuration schema, currently `1`. |
| `chain` | Chain ID, display name, native currency, public HTTPS RPC, HTTPS explorer base URL. All wallet switches use this same chain definition. |
| `contracts.bounty.address` | Verified protocol address; shipped empty. |
| `contracts.bounty.deploymentBlock` | Exact first deployment block as a decimal string; shipped empty. Required when the protocol address is set. |
| `contracts.bounty.abi` | Human-readable ABI for all protocol reads, writes and decoded events. |
| `contracts.token.address` | Verified reward/bond ERC-20 address; shipped empty. |
| `contracts.token.abi` | Symbol, decimals, allowance and exact approval methods. |
| `logChunkSize` | Maximum block range per event request. Lower this for restrictive RPCs. |

Both addresses must be present before any bounty or position figures are read. Each contract entry independently displays its deployment state. Malformed/non-HTTPS network URLs, invalid or zero addresses and malformed ABI entries fail closed. The client checks contract bytecode and reads token decimals/symbol rather than assuming token amounts.

The explorer must implement Etherscan-compatible `/address/`, `/tx/` and transaction event-log anchors. Network/native-currency metadata is configuration, not a live statistic. The default Ethereum selection follows the prior project's stated network.

## Read interface

The canonical signatures and their output order live in the config; the following table explains their meaning.

| Method | Required meaning |
| --- | --- |
| `getBounty(id)` | Question, reward in raw token units, deadline in Unix seconds, source note, resolver, bond in raw token units, forecast count, state, true value, winning forecast, winner. |
| `getPosition(id, participant)` | Whether the wallet submitted, its currently locked bond, whether it can withdraw, whether it can claim the reward. Flags must reflect the contract's actual eligibility checks. |
| `getForecasts(id)` | Complete list of `{submitter, value}` entries after resolution. Never called by this UI while the bounty is open. |
| `symbol()` / `decimals()` | Token metadata read from the configured token contract. |
| `allowance(owner, spender)` | Current allowance for the configured protocol. |

State encoding is `0 = open`, `1 = resolved`, `2 = claimable`. Unknown states are errors. An elapsed deadline does not fabricate a new state: the UI reports that submissions have ended and waits for the creator's resolution. `claimable` is a protocol state; the claim button additionally requires `canClaim` and a connected address matching the winner. Withdrawals require `canWithdraw` and a resolved/claimable bounty, regardless of who won.

The adapter assumes one forecast per wallet per bounty, signed integer forecasts, immutable creation fields, and ERC-20 rewards/bonds in the same configured asset. Questions must specify units and any scale; fractional numeric inputs are rejected rather than silently rounded. Deadline timestamps must fit the browser's date range. No token transfers are inferred from exchange rates or fiat estimates.

## Public write interface

| Method | Client behavior |
| --- | --- |
| `createBounty(question, reward, deadline, source)` | Validate text, a positive token amount at exact token precision and a future deadline. Obtain an exact reward allowance, then submit. The protocol determines the creator/resolver and required bond. |
| `submitForecast(id, value)` | Verify the open state, deadline and absence of an existing position. Obtain an exact bond allowance, then submit the signed integer. |
| `withdrawBond(id)` | Enabled for any eligible participant after resolution. |
| `claimReward(id)` | Enabled only for the eligible winner in claimable state. |
| `approve(spender, amount)` | Token approval only. Insufficient nonzero allowances are reset before setting the exact required amount; every step has its own preview/signature. |

Every step shows the chain, full account, full destination, method, raw arguments and encoded transaction data before the wallet opens. Protocol actions transfer no native currency; the wallet calculates gas fees. A simulation runs immediately before each signature. Failed/rejected requests show recoverable errors. A timed-out receipt check retains the transaction hash and checks the same transaction on retry. A reverted receipt is never reported as success. Transaction replacement/cancellation monitoring is delegated to the wallet; this client checks the submitted hash and links it on Etherscan.

No deployment, mint, resolve, pause, ownership or administrative method is provided. This viewer must not be treated as the resolver's own operating interface.

## Event provenance

All event definitions, including indexed fields, are in the same configuration file.

| Event | Produces |
| --- | --- |
| `BountyCreated` | ID, question, reward, deadline, source, resolver, bond; one contribution to the bounty total. |
| `ForecastSubmitted` | ID, forecaster and locked bond; one contribution to forecast count. It deliberately contains no forecast value in this adapter. |
| `BountyResolved` | True value, winning forecast and winner; enables the resolved table. |
| `BondWithdrawn` | Amount returned to a participant; subtracts from locked bonds. |
| `RewardClaimed` | Amount actually paid to the winner; adds to rewards paid out. |

Each refresh chooses one latest block. Historical logs are fetched in bounded ranges from the configured deployment block through that snapshot, then bounty reads use that same block. No partially scanned totals appear. The browser reads at most five bounty/position records concurrently. Creation fields, resolution fields and forecast counts must agree with their events. A resolved forecast table must match the count and have submission evidence for every row.

Total bonds locked = sum of submission bonds minus sum of bond withdrawals. Rewards paid = sum of reward claims. Aggregates link to their latest contributing event, with a separate source-event list exposing all contributions. A metric with no source events displays a descriptive empty state rather than a fabricated numeric zero. A numeric zero resulting from actual events, such as all bonds having been withdrawn, links to those events.

Bounty values and deadlines link to creation events. Forecast counts link to the latest submission (or creation for an empty bounty). Resolved individual forecast values link to that participant's submission event; error calculations and the true/winning result link to resolution. Addresses link to their explorer address page. Draft form amounts and raw transaction arguments are user input/proposed calldata, not asserted chain data.

The complete history is fetched again on refresh; there is no third-party indexer or persisted event database. Visible pages refresh periodically and after successful transactions. A failed refresh hides the previous figures. This favors correctness and a simple static client over efficient browsing of very large histories. An RPC must retain the required historical logs, support range scans and historical calls, and allow browser requests. Heavy usage may require a suitable public RPC or a future verified indexing design.

## Integration checklist

Verify the actual deployed source, ABI, event semantics, state encoding, token precision, bond/refund mechanics, winner tie handling and claim eligibility. If method names, parameter order or semantics differ, update `src/protocol.ts` and transaction builders along with the config ABI; merely editing a signature cannot adapt different contract behavior. Test against a fork or suitable test deployment before offering transactions to the public.

The synthetic fixtures validate frontend behavior against this documented interface. They do not prove contract correctness, economic guarantees, real-wallet interoperability or the availability of a future deployment.

Implementation references: [wagmi configuration](https://wagmi.sh/react/api/createConfig), [viem readContract](https://viem.sh/docs/contract/readContract), [viem simulateContract](https://viem.sh/docs/contract/simulateContract). Rabby's mobile link follows its [universal-link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts), using `_cmd=open-dapp` and `dapp`.

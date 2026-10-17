# Forecast Bounty design system

## Overview

Forecast Bounty is a public tool for people browsing and participating in numeric forecasting bounties. Its visual idea is a quiet forecasting terminal: dark green charcoal, warm pale text, a monospace typeface and one lime action. The layout favors questions and their actions over marketing content.

`src/styles.css` defines the system. `src/components/ui.tsx` provides shared primitives; `src/App.tsx` composes the board, totals, guide and contract directory. The deployment state is a complete product state, with descriptive text instead of placeholder statistics. It shares the same dimensions and controls as the live board.

## Colors

Primitive values are mapped to semantic roles in `src/styles.css:1`.

| Semantic token | Primitive / exact value | Use |
| --- | --- | --- |
| `--bg` | `--neutral-950`, `#101411` | Page and form inputs |
| `--surface` | `--neutral-900`, `#171d18` | Empty board, dialogs, settlement panel |
| `--hover` | `--neutral-850`, `#202821` | Selected filters, hover and notices |
| `--border` | `--neutral-700`, `#4e5c50` | Dividers, input boundaries, secondary buttons |
| `--muted` | `--neutral-500`, `#a8b3a7` | Supporting text and metadata |
| `--text` | `--neutral-100`, `#f0f3e9` | Main text |
| `--accent` | `--lime-400`, `#c4f56f` | Primary action background |
| `--accent-hover` | `--lime-300`, `#d5ff94` | Primary hover |
| `--on-accent` | `--neutral-950`, `#101411` | Primary button text |
| `--focus` | `--neutral-100`, `#f0f3e9` | Keyboard outline |
| `--pending` | `--amber-300`, `#f0ca7c` | Awaiting deployment and claimable labels |
| `--danger` | `--red-300`, `#ffb0a5` | Error text and error edge |

Statuses always include text. An outlined dot reinforces status but is not its sole carrier. Only the main action uses a lime fill; wallet controls and secondary actions remain neutral. Wallet brand marks keep their vendor colors. Dark is the sole theme; no unused light palette is defined.

Rendered contrast checks and their coverage are recorded in `artifacts/validation.md`. Those measurements apply to the tested solid-background states, not every future integration.

## Typography

The local typeface is **IBM Plex Mono**, with `ui-monospace`, `SFMono-Regular`, `Consolas`, `monospace` fallbacks. Fontsource supplies the local WOFF2/WOFF assets; no font request leaves the static origin. The application uses weights 400 and 500. Monospace throughout is an explicit assignment requirement.

| Token | Default size | Role |
| --- | --- | --- |
| `--text-xs` | 12px / .75rem | Metadata, source links, mobile navigation, statuses |
| `--text-sm` | 14px / .875rem | Body explanations, buttons, form labels |
| `--text-md` | 16px / 1rem | Inputs, compact headings |
| `--text-lg` | 20px / 1.25rem | Section headings and fact values |
| `--text-xl` | 28px / 1.75rem | Mobile/page titles and aggregate values |
| `--text-display` | 48px / 3rem | Desktop home title |

The default line height is 1.6; controls and compact headings use 1.5; section/detail headings use 1.4; the short home headline uses 1.16. Display tracking is −.055em, compact display tracking −.035em and section tracking −.025em. Body text is untracked. Headings balance, prose wraps naturally, numeric links use tabular figures. Inputs and mobile selects remain 16px to avoid input zoom.

Full addresses, amounts, source notes and questions wrap instead of being truncated. There is no ellipsis on critical data. Only the header's wallet identifier is abbreviated; opening it reveals the full address. Long guide paragraphs are capped at 76ch. Text is selectable, with lime selection and dark foreground.

## Layout

The `.shell` is at most 1280px wide, centered, with 48px inline padding. Most spacing uses multiples of 4px: 8/12px within controls, 16/20/24px within sections, and 28/32/40/48px between groups. The board, metrics, principles and contracts align to the same shell edges.

- Above 1023px: four metric columns, five bounty columns, three principle columns, and two contract columns. The create action sits beside the title. Detail pages use a two-to-one content/action split.
- At 1023px and below: 32px page padding, smaller title, bounty rows become wrapping groups with explicit field labels. The detail split tightens.
- At 639px and below: 20px page padding, a full-width create action, the board before metrics, two metric columns, and single-column principles/contracts/detail. Detail actions appear before facts so the primary interaction is reachable. Dialogs become bottom sheets with safe-area padding. Resolved table rows place the full submitter address above forecast, absolute error and result.
- At 359px and below: 16px page padding, compact header spacing and no redundant wallet icon. Header and navigation can wrap when text is enlarged.

The DOM keeps sections in a consistent reading order; only the mobile dashboard/detail visual emphasis changes through flex/grid ordering. There is no fixed header or floating footer to cover content. Filters precede the list they affect. Hash navigation resets scroll and moves focus to the main landmark.

Rendered widths checked: 320, 390, 768 and 1440px. The first 390px screen includes the product title, connect control, create action, state filters and deployment board. Text enlargement is tested separately from browser-native zoom; see validation for the result and limits.

## Elevation & depth

This is a flat system: section separators communicate structure, and tonal backgrounds group empty/action states. No box shadows, glow, gradients or nested card decoration are used. Dialogs use the native top layer with a translucent `#060906c9` backdrop. Their content remains solid `--surface`.

## Shapes

Buttons and form controls use a 5px radius; the detail action panel uses 8px; desktop dialogs use 12px; mobile dialog top corners use 16px. Status labels use 4px and outlined dots are circular. The brand mark is an original SVG; ordinary interface icons are a single `currentColor` outline set with 1.5px strokes.

## Components

| Component / pattern | Source | States and reuse |
| --- | --- | --- |
| `Brand`, `Icon` | `src/components/ui.tsx` | Home link, local brand SVG and consistent decorative icons. |
| `Modal` | `src/components/ui.tsx` | Native modal semantics and inert background, focus capture/return, Escape/backdrop/close control; dismissal disabled while a transaction request is pending. |
| `.button` | `src/styles.css` | Neutral default, `.primary`, `.secondary`, `.full`; explicit hover, active, keyboard focus and disabled states. |
| `Awaiting`, `EmptyDeployment` | `src/components/ui.tsx` | Empty addresses never become zero-valued metrics. The heading level is selected for the surrounding hierarchy. |
| `Status` | `src/components/ui.tsx` | Open/resolved/claimable labels from read contract state. |
| `EventValue` | `src/components/ui.tsx` | Inline numeric link to the specific transaction event, with an external-link indicator. |
| `ErrorNote` | `src/components/ui.tsx` | Announced error text, optional retry. No fabricated fallback data. |
| `Wallet` | `src/components/Wallet.tsx` | Wallet selection, opening, rejection, connected, disconnect and wrong-chain switching. Mobile app links use local vendor marks. |
| `Create` | `src/components/Create.tsx` | Draft, field validation, awaiting deployment, network gating and transaction review. Errors identify/focus the invalid field. |
| `TransactionReview` | `src/components/Transaction.tsx` | Preparing, exact preview, approval steps, wallet request, receipt waiting, recoverable failure and confirmed success. |
| `BountyDetail` | `src/components/BountyDetail.tsx` | Open count-only state, resolved table, own-position loading and settlement eligibility. No pre-resolution individual forecast request. |
| `Positions` | `src/components/Positions.tsx` | Deployment, disconnected, loading, error, no positions and verified position rows. |

Keyboard focus is a 2px foreground outline offset by 4px; forced-colors mode uses the system Highlight color. Native inputs/selects/buttons carry keyboard behavior. Form labels remain visible, and the skip link is the first focusable control.

Hover styles are restricted to hover-capable devices. Under normal motion preferences, controls transition only background, border and transform for 120ms, with a `.96` press scale. Reduced-motion mode omits those transitions. There is no entry animation, continuous motion or automatic carousel.

## Do's and don'ts

- Start a new route inside `.shell`; use the existing heading scale, buttons, event links and empty/error patterns.
- Give one primary action the lime fill. Keep comparable secondary controls neutral.
- Derive every chain figure from a verified snapshot and supply its source event. Keep unavailable figures textual.
- Keep full addresses and amounts readable. Use the stacked mobile table pattern for dense resolved records.
- Preserve the explicit monospace/dark direction, local assets and hash navigation.
- Do not add fake statistics, seeded bounties, chart decoration that implies real data, or privileged protocol controls.

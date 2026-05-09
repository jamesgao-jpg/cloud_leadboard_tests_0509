# Project Guide for Claude

This repo holds benchmark notes, reproducibility details, and interim
artifacts for cloud leaderboard work prepared around 2026-05-09.

## Scope

- Use one folder per focused test line.
- Keep raw, preliminary, and final numbers together inside that test folder
  unless a later artifact requires a separate public deliverable.
- Prefer one clear markdown report per test folder while the test line is
  still evolving.

## Current Layout

| Folder | Purpose |
|---|---|
| `turbopuffer_pinned_test/` | Turbopuffer namespace pinning behavior, cost model, and LAION 100M search results. |

## Report Rules

- Put the main report at `<test_folder>/<test_folder>.md`.
- Include the exact framework branch and commit used for each run.
- Include exact reproduction commands with credentials templated as
  `<api-key>`, `<token>`, `<password>`, or `<uri>`.
- Keep preliminary claims labeled as preliminary until the run is complete
  and verified.
- Side-by-side tables are preferred when comparing systems or modes.
- Do not scatter one test line across multiple folders unless the scope grows
  enough to justify splitting.
- Do not commit API keys, tokens, or private service URLs.

## Turbopuffer Safety

- `laion100m_bulk` is an active Turbopuffer namespace used for LAION 100M.
- Pinning can incur ongoing charges. Before starting or stopping pinning,
  follow the user's latest explicit instruction.
- When a test requires cleanup, verify cleanup with a metadata GET and record
  the observed `pinning` state in the report.
- If the user explicitly says to keep a namespace pinned, do not unpin it
  without a later explicit instruction.

## Writing Style

- Be concise and factual.
- Separate measured facts from interpretation.
- Prefer dates in UTC for benchmark events.
- If a cost number is inferred from a calculator rather than an explicit rate
  card, label it as inferred and include the calculation.

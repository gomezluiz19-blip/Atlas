# Connecting a brokerage to My portfolio

**What works now (no account, nothing leaves the device).** Every big US broker exports positions as CSV:
Fidelity (Positions › Download), Schwab (Positions › Export), Vanguard (Holdings › Download), E*TRADE (Portfolios ›
Download), Robinhood (Account › Statements, or a CSV from a third-party export), Interactive Brokers (Portfolio ›
Export). In My portfolio › *Import from your broker*, choose the file or paste it. `src/econ/brokerImport.ts` finds
the symbol column and either the market value or quantity × price, cleans "$1,234.56" style numbers, sums the same
symbol across accounts, matches symbols to the companies Atlas maps and lists the rest as "not mapped yet". Lines
like `AAPL 5000` work too.

**Direct connection (needs the back end).** A read-only link to the user's accounts goes through an aggregator, never
through Atlas holding broker passwords:

| Aggregator | Covers | Model | Notes |
|---|---|---|---|
| SnapTrade | Most US and Canadian retail brokers, read-only holdings | Per connected user, per month | Built for this; OAuth-style connection portal. |
| Plaid Investments | Holdings and transactions at most US brokers | Per connected account | Same Link flow many people already know from banking apps. |
| Yodlee / MX | Holdings, broadly | Enterprise contracts | For larger rollouts. |

The flow: the browser opens the aggregator's connection portal with a short-lived token minted by Atlas's back end
(`docs/backend.md`); the aggregator returns a user id; the back end fetches holdings server-side, keeps only symbol and
value, and hands them to the page in the same shape the CSV import produces (`{ id, value }[]`), so nothing else
changes. Client secrets stay on the server; holdings sync daily. Until that's wired, the CSV path is the honest
option and is clearly labelled as such in the app.

**Coverage.** Atlas maps about 30 big companies with their revenue by country, raw materials, sites and partners
(`src/econ/companies.ts`). Unmapped symbols still count towards the total value but don't appear on the globe; a
licensed fundamentals feed (revenue by segment and geography for every listed company) is what would close that gap.

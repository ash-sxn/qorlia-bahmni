# Contributing to Qorlia

Qorlia's new hospital UI, built on the open-source Bahmni Apps Frontend. Keep
the upstream licence and attribution intact (see [README](README.md)).

## Where code goes

- **`main` is the Qorlia product branch.** Branch from `main` and open every pull
  request against `main`.
- Name branches `<your-name>/<short-topic>`, for example `aniket/hospital-overview`.
- Merged code is not live anywhere until it is deployed. Hospitals currently run
  the stock Bahmni UI; new screens move over one module at a time.

## Before you open a pull request

1. Link the GitHub issue and follow its agreed scope.
2. Run the checks for what you changed:
   ```bash
   yarn install
   npx nx affected -t lint typecheck test --base=origin/main
   ```
3. Check the screen in a browser against a local or test backend: keyboard use,
   a narrow window (390 px), and the loading, empty and error states.
4. Use synthetic data only. Never put real patient details, passwords, hosts or
   access links in code, screenshots, issues or pull requests.

## What happens on GitHub

- **Qorlia CI** runs lint, type checks, unit tests and the build on every pull
  request. A pull request merges only when it is green and reviewed.
- Keep pull requests small: one task, ideally under about 600 changed lines.
  Split bigger work into slices that each work on their own.
- Ashutosh reviews and merges. Reply to review comments in the pull request.

## Useful docs

- [Project structure](docs/project-structure.md) and [architecture](docs/architecture.md)
- [Qorlia design system](docs/QORLIA_DESIGN_SYSTEM.md)
- [i18n guide](docs/i18n-guide.md)
- [Setup guide](docs/setup-guide.md)

## Implementation rules

- Reuse the existing house components, design tokens, services and dependencies.
- Preserve native workflows, configuration, identifiers, units, permissions and financial/clinical semantics.
- Search callers before changing shared types/helpers. Coordinate shared files and API contracts.
- Add a failing regression for a reproduced bug, then make it pass without weakening the assertion.
- Handle loading, empty, rejected, unknown and expired states. Do not automatically retry uncertain writes.
- Preserve keyboard access, focus, readable narrow layouts and translations where the feature supports them.
- Do not introduce a general framework, dependency upgrade or module rewrite without a demonstrated task need.
- Keep public copy free of em dashes. Use sentences, commas, colons or parentheses.

## Licensing and private information

Retain [LICENSE](LICENSE), [NOTICE](NOTICE), upstream history and source-file copyright/licence headers. Covered frontend modifications follow its existing MPL terms. Runtime components have their own licences, including the [Billing addon](runtime/billing/LICENSE) and [Reports adapter](runtime/reports/LICENSE). Do not relabel all code under one new licence. Open-sourcing code does not permit removing attribution or using upstream trademarks without permission.

Never commit passwords, `.env` secrets, cookies, tokens, keys, database dumps, real patient/customer records or screenshots containing private data. Check your staged diff before pushing. Hospital branding assets require permission; do not assume a downloaded image is licensed.

If a secret is exposed, notify the owner immediately so it can be revoked/rotated. Deleting the current file does not erase Git history. Do not hide an exposure or rewrite shared history on your own.

Public developer documentation explains architecture and safe contribution. Private server runbooks, credentials, customer operations and deployment packs remain private.

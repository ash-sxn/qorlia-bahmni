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

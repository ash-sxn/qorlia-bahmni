# Contributing to Qorlia

[README](README.md) · [API integration](docs/api-integration-guide.md) · [Testing guide](docs/testing-guide.md) · [Team workflow](docs/team-workflow.md)

## Before starting

Use your own GitHub account. Confirm the issue, owner, approved base branch, scope, synthetic environment and acceptance conditions. The public product repo is separate from the private website. Do not count an invitation or a local install as a completed feature.

Read [beginner orientation](docs/developer-start-here.md), [architecture](docs/architecture.md), [repository map](docs/project-structure.md) and the relevant [module guide](docs/module-guide.md). For a new feature, first write the user problem and compare native behaviour.

## Branch and commit workflow

From a fresh clone, replace the task name and use the issue's approved base:

```bash
git fetch origin
git switch --create codex/your-task origin/codex/qorlia-fork-foundation
git status --short --branch
```

Make a small change for one workflow. Add/update tests, then inspect the diff:

```bash
git diff
git diff --check
git add path/to/your-changed-file
git diff --cached
git commit -m "Fix the specific workflow problem"
git push -u origin codex/your-task
```

The paths are placeholders. Stage only your intended files, not another person's changes or a whole dirty folder. Configure Git with your own identity. Do not reset, delete or overwrite someone else's uncommitted work. Do not force-push a shared branch without agreement.

Open a draft PR for unfinished work. Request review when evidence is ready. Do not push directly to `main`, merge your own clinical/financial change, deploy, change access policy or buy services as a contribution step. These are owner/operator decisions.

## Implementation rules

- Reuse the existing house components, design tokens, services and dependencies.
- Preserve native workflows, configuration, identifiers, units, permissions and financial/clinical semantics.
- Search callers before changing shared types/helpers. Coordinate shared files and API contracts.
- Add a failing regression for a reproduced bug, then make it pass without weakening the assertion.
- Handle loading, empty, rejected, unknown and expired states. Do not automatically retry uncertain writes.
- Preserve keyboard access, focus, readable narrow layouts and translations where the feature supports them.
- Do not introduce a general framework, dependency upgrade or module rewrite without a demonstrated task need.
- Keep public copy free of em dashes. Use sentences, commas, colons or parentheses.

## What a PR must explain

Link the issue and starting SHA. State the user problem, native behaviour, API mapping, files changed and reason. Include actual commands/results, sanitized screenshots and approved synthetic save/read-back evidence. Distinguish mocked tests, native tests, private API checks and browser acceptance. Record limits and rollback.

Use [the PR template](.github/pull_request_template.md). Existing upstream JIRA fields are not a requirement to invent a JIRA ticket for this fork. The GitHub issue is the Qorlia task reference. A green build is not clinical/accounting sign-off or proof that a feature is released.

## Review and completion

A maintainer reviews the change. The designated tester independently replays the workflow. Clinical/accounting behaviour requires the appropriate domain review. Update the [parity ledger](docs/FEATURE_PARITY.md) and [readiness notes](docs/BACKEND_READINESS.md) with scoped evidence, not a guessed completion percentage.

PR-only collaboration is an expected working rule. Do not assume GitHub branch protection or CI enforces it unless the current repository settings/checks confirm that. Report missing enforcement to the owner; do not configure it independently.

## Licensing and private information

Retain [LICENSE](LICENSE), [NOTICE](NOTICE), upstream history and source-file copyright/licence headers. Covered frontend modifications follow its existing MPL terms. Runtime components have their own licences, including the [Billing addon](runtime/billing/LICENSE) and [Reports adapter](runtime/reports/LICENSE). Do not relabel all code under one new licence. Open-sourcing code does not permit removing attribution or using upstream trademarks without permission.

Never commit passwords, `.env` secrets, cookies, tokens, keys, database dumps, real patient/customer records or screenshots containing private data. Check your staged diff before pushing. Hospital branding assets require permission; do not assume a downloaded image is licensed.

If a secret is exposed, notify the owner immediately so it can be revoked/rotated. Deleting the current file does not erase Git history. Do not hide an exposure or rewrite shared history on your own.

Public developer documentation explains architecture and safe contribution. Private server runbooks, credentials, customer operations and deployment packs remain private.

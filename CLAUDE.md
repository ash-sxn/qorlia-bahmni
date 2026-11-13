# Working in qorlia-bahmni

Qorlia's React hospital workspace on top of Bahmni/OpenMRS and Odoo native APIs.
Start with [README.md](README.md), [docs/team-handover.md](docs/team-handover.md)
and [docs/FEATURE_PARITY.md](docs/FEATURE_PARITY.md). Billing contracts live in
[runtime/billing/README.md](runtime/billing/README.md).

## Standing rules

- **No em dashes** in prose, docs, commit messages, PR text or UI copy. Use ordinary
  punctuation. `node scripts/check-contributor-docs.mjs` enforces this for docs.
- **Never stage the whole tree.** No `git add -A`, `git add .`, `git commit -a`,
  reset, stash, clean or history rewrite without an explicit request. The working
  tree often holds unrelated uncommitted work (for example clinical changes next to
  Billing). Stage explicit paths and check `git diff --cached --name-only` before
  committing.
- **Billing review gate is closed.** Do not install a new adapter on any server,
  re-open the protected browser review, the public HTTP gateway or tester tunnels,
  or change the shared demo. Allowed: local work, local tests, and the
  owner-approved private no-HTTP, rollback-only synthetic Odoo staging run. Ask
  before any SSH, even read-only, and use a new log directory for each run.
- **Environments are separate.** Public source, local review, protected tester
  hosting and production are different things. A passing unit test is not browser
  acceptance, a source change is not a deployed change, and a tile or brand
  treatment is not an integrated workflow. Record source-only checkpoints as
  source-only.
- **Preserve native behavior.** Keep native authorization, company scope, server
  validation, accounting semantics, audit and recovery. Do not weaken signatures or
  rewrite native values to make a client test pass.
- **Licensing.** Frontend is MPL 2.0, the Billing adapter is LGPL-3.0-or-later and
  the Reports adapter has its own AGPL terms. Keep upstream LICENSE/NOTICE files and
  Bahmni/Odoo attribution.
- **No secrets in Git.** No hosts, keys, passwords, tester URLs or patient data in
  this repo, including docs and PR text.
- **No merge or deploy** without a separate explicit decision. PRs open as drafts.

## Local setup and tests

Node 22, Yarn Classic 1.22, frozen lockfile ([docs/setup-guide.md](docs/setup-guide.md)).
If `yarn` is not on PATH, shim it with corepack into a temporary directory:

```bash
corepack enable --install-directory "$TMPDIR/yarn-bin" yarn && export PATH="$TMPDIR/yarn-bin:$PATH"
```

Run Jest through Nx. Plain `npx jest -c apps/home/jest.config.ts` fails to parse
the TypeScript config. Nx needs `--excludeTaskDependencies` because the build graph
has a cycle (command-palette, widgets, clinical), and a `--testPathPattern` with
brackets or `|` needs inner quotes:

```bash
NX_DAEMON=false npx nx test @bahmni/home-app --skipSync --excludeTaskDependencies --testPathPattern="'Billing/__tests__/(inventoryEditingService|InventoryDraftEditor)'"
```

Full Home suite: drop `--testPathPattern`. Other projects follow the same pattern
(for example `@bahmni/clinical-app`).

- Docs check: `node scripts/check-contributor-docs.mjs`
- Whole-project `tsc -p apps/home/tsconfig.spec.json` fails with `TS6305` on stale
  project references. That is not a source regression; use scoped checks.
- The Odoo adapter tests under `runtime/billing/qorlia_billing_ui/tests/` need a
  real Odoo and cannot run on a laptop. Locally, only syntax-check them, and delete
  any `__pycache__` this creates so it is not staged.
- Dev server: `NX_DAEMON=false yarn nx serve @bahmni/distro --skipSync`, then
  `/bahmni-v2/login`. Sign in only with approved synthetic accounts.

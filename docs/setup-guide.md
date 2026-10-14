# Local development setup

[README](../README.md) · [Previous: orientation](developer-start-here.md) · [Next: architecture](architecture.md)

This guide is for contributing to the existing application. It does not authorize deploying a hospital, changing production or buying infrastructure. Begin with the frontend and approved synthetic backend. Local backend installation is a separate operator task.

## 1. Tools and your own account

Install Git, Node.js 22, Yarn Classic 1.22, a code editor and a browser with developer tools. Test/build libraries are declared project dependencies, not separate paid products. Docker, Python and Java are needed only for assigned backend work.

Use your own GitHub account with two-factor authentication. Accept the repository invitation before pushing. Public HTTPS cloning needs no private-repository token. Never use someone else's login, Codex session, cookies or SSH key. Request only the necessary scoped access if a package genuinely needs authentication.

```bash
git --version
node --version
yarn --version
```

Do not install Yarn 2/3/4 or replace the lockfile as an onboarding workaround. Download tools from their official publishers. Ask the maintainer for help when a command or permission is unclear.

## 2. Clone the correct baseline

```bash
git clone https://github.com/ash-sxn/qorlia-bahmni.git
cd qorlia-bahmni
git fetch origin
git switch --create codex/your-task origin/codex/qorlia-fork-foundation
git rev-parse HEAD
yarn install --frozen-lockfile
```

Replace `your-task` with an agreed name. The base above is the current starter-task base, not a permanent convention. Confirm it in your issue. Use a fresh clone, not another developer's working folder. Record the starting SHA (commit identifier), tool versions and installation result.

`yarn install` downloads project dependencies. `--frozen-lockfile` prevents an accidental dependency-version rewrite. Installation may set up Git hooks. If it fails, record the package/error. Do not delete the lockfile or upgrade everything.

## 3. Request the environment pack privately

Ask for the approved synthetic clinical backend origin, matching installed modules, compatible configuration, account/roles, login location, permission to create synthetic records, and access expiry. If needed, request a reviewed 40-character Standard configuration commit.

Billing additionally needs a compatible Odoo backend, adapter version and separate ERP account. Do not request it for an unrelated frontend task.

The source code is not the database. A page can compile without a backend, but its workflow cannot be accepted that way. A public demo is not blanket permission to create records. Never publish the environment pack or copy private Compose files into GitHub.

## 4. Configure and run

The proxy is in [webpack.config.js](../distro/webpack.config.js). Its default clinical target is `https://localhost/`, which requires an actual compatible backend there.

On macOS/Linux, after receiving approved values:

```bash
export BAHMNI_API_ORIGIN='https://your-approved-synthetic-backend.example'
# Only if the environment needs a pinned Standard V2 configuration:
# export BAHMNI_STANDARD_CONFIG_REF='the-reviewed-40-character-commit-sha'
# Only for an assigned Billing task:
# export BAHMNI_BILLING_ORIGIN='https://your-approved-billing-backend.example'
NX_DAEMON=false yarn nx serve @bahmni/distro --skipSync
```

These example values are placeholders, not test servers. A moving branch name is not a pinned configuration reference.

Windows PowerShell uses:

```powershell
$env:BAHMNI_API_ORIGIN = 'https://your-approved-synthetic-backend.example'
$env:NX_DAEMON = 'false'
yarn nx serve @bahmni/distro --skipSync
```

Set optional variables with the same `$env:NAME = 'value'` syntax. POSIX-style environment prefixes in other guides require Git Bash/WSL or equivalent PowerShell assignments. Every Windows/native dependency combination is not accepted yet; report exact failures.

The server normally listens on loopback port 3000. Keep it loopback-only. Do not add a tunnel or bind `0.0.0.0` without operator approval and the appropriate access gate.

## 5. Sign in on the exact local host

Open `http://127.0.0.1:3000/bahmni-v2/login`. Sign in with the approved synthetic account and correct location. Open `/bahmni-v2/home/`, then your module.

`localhost`, `127.0.0.1` and a public demo are different browser hosts for cookies. Stay on one host. Do not manually copy a `JSESSIONID` from another environment. React login creates the local session through the configured proxy.

Billing is inside the signed-in workspace at `/bahmni-v2/home/billing`. ERP and clinical sessions are separate. The proxy intentionally does not forward clinical credentials to Odoo. A browser-owned Basic authentication popup is not the normal Qorlia login. Report its URL/status rather than guessing a password.

The development-only design preview contains sample data. It is not proof that saving or deployment works.

## 6. Verify before changing code

Record your issue, base SHA, tool versions, successful route and approved environment. Inspect one permitted read request in the browser Network panel. Record the endpoint/method and expected result, without cookies or patient details.

Run the module checks in [Testing guide](testing-guide.md). Compare the assigned workflow with native Bahmni/Odoo before inventing behaviour.

## Troubleshooting

| Symptom               | Check first                                                      | Do not                                           |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| Old UI opens          | `/bahmni-v2/`, branch, host and running process                  | Treat legacy `/bahmni/home` as the redesigned UI |
| Sign-in unavailable   | Clinical session endpoint, backend reachability and proxy origin | Disable authentication                           |
| Missing menu/config   | Modules, privileges and compatible V2 config                     | Hardcode a menu or use a random moving branch    |
| Billing access denied | Both sessions, gateway, adapter version and role                 | Forward clinical cookies or add `sudo`           |
| Port occupied         | Identify the process and owner first                             | Kill all Node processes                          |
| Nx circular graph     | Direct focused Jest checks; inspect the graph                    | Rewrite unrelated dependencies                   |
| Webpack “data” error  | Supply Nx build-target context using the testing guide           | Change application code for a command error      |
| Expired tester access | Request gate renewal                                             | Treat expiry as a patient/accounting defect      |

## Backend and build boundaries

Distribution output is `distro/dist`. Use the [build check](testing-guide.md#build-check). A development bundle is not a production release.

Do not blindly start latest upstream images. Native adapters require matching versions, schema, configuration, licences and pinned dependencies. Backend work requires separate synthetic databases, backups and native tests. See [Billing](../runtime/billing/README.md), [Reports](../runtime/reports/README.md) and [Backend readiness](BACKEND_READINESS.md). Private deployment procedures come from the operator.

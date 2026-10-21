# Repository map

[README](../README.md) · [Previous: architecture](architecture.md) · [Next: modules](module-guide.md)

This is a monorepo: application modules and shared libraries kept in one Git repository. Several app folders do not imply independently deployed microfrontends.

```text
qorlia-bahmni/
  distro/                       shell, login, branding, routing and proxy
    src/main.tsx                startup
    src/app/                    root app and login
    src/assets/                 branding.json and assets
    src/preview/                development-only visual sample
    dist/                       generated output, not hand-edited source
  apps/
    home/                       home and signed-in Billing
    clinical/                   consultation, programmes, beds, inpatient,
                                theatre and orders
    registration/               patient search/register/edit
    appointments/               list, calendar, booking and service settings
    patient-documents/          patient document workflows
    admin/                      CSV, audit and order sets
    reports/                    report jobs and downloads
    command-palette/            cross-application command UI
    sample-app-module/          upstream example
  packages/
    bahmni-design-system/       shared controls, tokens and branding
    bahmni-widgets/             domain widgets and configuration/context
    bahmni-services/            clinical APIs, types and helpers
  runtime/
    billing/qorlia_billing_ui/  native Odoo addon and tests
    reports/                   native report adapter
    patient-documents/         selected document runtime source
  scripts/review-host/         protected tester gateway and tests
  docs/                        guides and dated acceptance evidence
  .github/                     templates and existing workflows
  package.json, yarn.lock     tools and dependency versions
  nx.json                     task inference/dependencies
  tsconfig.base.json          strict shared TypeScript settings
  LICENSE, NOTICE             retained licences/credits
```

## Where to begin a change

| Task                  | Source entry                                                                                                 | Coordinate with                |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Login/navigation      | [root app](../distro/src/app/app.tsx), [login](../distro/src/app/LoginPage.tsx)                              | auth/shared routing owner      |
| Home menu             | [HomePage](../apps/home/src/components/HomePage/)                                                            | config/privilege mapping owner |
| Billing               | [Billing components](../apps/home/src/components/Billing/)                                                   | Billing/native owner           |
| Appointment list/edit | [pages](../apps/appointments/src/pages/), [routes](../apps/appointments/src/routes/index.tsx)                | shared-service owner           |
| Patient registration  | [pages](../apps/registration/src/pages/)                                                                     | patient identity/visit owner   |
| Clinical              | [pages](../apps/clinical/src/pages/), [hooks](../apps/clinical/src/hooks/)                                   | encounter/save owner           |
| API function          | existing module service or [shared services](../packages/bahmni-services/src/)                               | schema/consumer owner          |
| Colours/controls      | [design system](../packages/bahmni-design-system/src/)                                                       | shared UI owner                |
| API proxy             | [webpack](../distro/webpack.config.js), [gateway](../scripts/review-host/server.cjs)                         | security/operator              |
| Odoo action           | [models](../runtime/billing/qorlia_billing_ui/models/), [tests](../runtime/billing/qorlia_billing_ui/tests/) | native/accounting owner        |

## Typical module layout

`routes/` maps URLs to screens. `pages/` or `components/` renders a feature. `hooks/` shares React behaviour. `services/` or a shared package performs API requests. `models/` and `constants/` describe data/contracts. `stores/` holds draft state where needed. `public/locales/` supplies translations. `__tests__/` is normally beside the code under test.

Not every module has all these folders. Follow existing code; do not add empty layers to match a diagram.

## Source versus generated output

Edit reviewed source, not `dist`, `node_modules`, bundles, source maps or only a deployed container. Generated edits vanish during the next build and cannot be reviewed properly.

Many projects use inferred Nx configuration and do not have `project.json`. Inspect `package.json` and `nx.json`; do not create configuration merely because an older guide mentioned it.

Search callers, exports and tests before modifying a helper:

```bash
rg 'getAllowedTransitions' apps packages
rg --files apps/appointments/src
```

Use editor search if `rg` is unavailable. Environment secrets, cookies, dumps, customer data and private deployment packs stay outside this repo. Do not copy another developer's whole local working folder.

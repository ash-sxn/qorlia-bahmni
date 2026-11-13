# Turn a feature request into a development task

[README](../README.md) · [Team workflow](team-workflow.md) · [API integration](api-integration-guide.md) · [Contribution workflow](../CONTRIBUTING.md)

Copy the following into a GitHub issue or the agreed project board. Keep one workflow per implementation task. Do not fill unknowns with guesses; record the decision needed and its owner. This document creates no assignment or deadline by itself.

## Copyable brief

```text
Project: Qorlia hospital product, not the marketing website or Legal Assistant
Phase: audit / implementation / acceptance / release
Workflow and user role:
User problem, with an example:
Current native behaviour:
Expected Qorlia behaviour:
In scope:
Explicitly out of scope:

Accountable developer:
Reviewer:
Independent tester:
Clinical/accounting reviewer, if relevant:
Approved base branch and starting SHA:
Source pages/services/native models:
Dependencies and shared-file owner:
Approved synthetic environment and access owner:
Backend/modules/adapter/configuration versions:

API method and endpoint:
Request identities, fields, units and dates:
Response validation and reload:
Required native permissions/company scope:
Accepted / rejected / unknown-save handling:
Design components/tokens/translations:

Acceptance steps and expected native outcomes:
Focused test to add or update:
Adjacent tests, types, lint and build:
Browser/API/native read-back evidence required:
Denied/expiry/stale/double-click/recovery cases:
Accessibility and narrow-layout checks:
Rollback and protected records:

Target checkpoint, conditional on prerequisites:
Estimate range and assumptions:
Unanswered decisions, named decision owner:
Issue / PR / evidence links:
Current status, next step and blocker:
```

Never put credentials or private records in a public issue. Internal environment/evidence links should point to an approved access-controlled location, not expose the underlying data.

## Example of a bounded first task

“Audit the selected-day appointment list against the synthetic native installation. Document endpoint/date/filter/permission behaviour and one reproduced discrepancy. Submit an audit or one tested correction.”

This is smaller and more reviewable than “finish Appointments”. See [issue 3](https://github.com/ash-sxn/qorlia-bahmni/issues/3) for the existing proposed starter checkpoint. Do not promise an entire module's timeline before its audit and access prerequisites are understood.

## Ready to begin

The owner has agreed scope and base; a developer and reviewer are named; synthetic access is ready; native behaviour and acceptance are understood; shared files have an owner. Missing domain decisions are not implementation details for a beginner to decide independently.

For a proposed new AI or national digital-health feature, first specify the actual task, data involved, external dependency, permissions, evaluation and human/domain review required. A mock screen is not production capability or compliance. Avoid placing broad roadmap items into a small bug-fix PR.

## Ready for review versus accepted

Ready for review means the bounded change and its evidence are available in a PR. Accepted means the designated reviewer/tester has verified its stated criteria. Released means that accepted version is in the approved target environment. Keep these statuses separate in daily updates.

When a test fails or a save is uncertain, keep the evidence and identify the next check. Do not call it complete, rerun a fresh write blindly, or assign a guessed completion percentage. Keep documentation and task links current with the changed source.

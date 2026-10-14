# Qorlia design system

Status: working direction, updated 24 September 2026. This is based on the selected calm clinical concept and approved Qori mascot. It guides Qorlia's website and Bahmni-based products, but does not claim that every screen has been migrated.

[View the selected visual concept](assets/qorlia-calm-clinical-concept.png). It uses fictional data and is a design target, not a screenshot of implemented functionality.

## The idea

Qorlia should feel calm under pressure. A receptionist should find the next patient quickly. A clinician should know whose chart is open, where they are working, what is saved, and what still needs attention. The interface should be warm enough to welcome staff and disciplined enough to support clinical work.

Four principles govern every screen:

1. **Work first.** Put the current task and next safe action before marketing, decoration or system internals.
2. **Quiet confidence.** Use a restrained palette, clear type and plain language. Never make an unfinished state look complete.
3. **One connected journey.** Registration, consultation, lab, pharmacy and billing should feel like parts of one patient visit, while preserving role boundaries.
4. **Honest technology.** Say what is live, what is optional and what still needs human review. Do not imply software alone guarantees compliance or a clinical outcome.

## Brand structure

- The pentagon is the Qorlia mark. Pair it with the wordmark in primary navigation. Never show the mark alone as the only identity on a large blank screen.
- Where a Qorlia product is built on Bahmni, retain a readable **Built on Bahmni** credit and upstream copyright/license notices. Qorlia is the service and product experience; it does not claim to have created Bahmni.
- **Qori** is the approved pentagon mascot. Qori can welcome visitors, listen during an enquiry, and celebrate a completed non-clinical task. The name is short in English and Hindi and comes from Qorlia.
- The mark and Qori share one pentagon silhouette. The logo starts as a white pentagon in a green tile. In a friendly context, crossfade and scale to the green mascot. Reverse the same motion to return to the official mark. Keep the header mark static.
- Qori has three approved faces: [welcome](assets/qori-welcome.png) (open smile), [listening](assets/qori-listening.png) (small smile and listening lines), and [celebrate](assets/qori-celebrate.png) (closed eyes and a larger smile). New expressions need a named use case and review.
- Use Qori on marketing, onboarding, training and friendly empty states. Do not use Qori as a clinical alert, consent indicator, patient status, success signal for a saved clinical record, or a replacement for the official logo or text. Keep upstream Bahmni and Odoo attribution visible where required.
- Motion is quiet: a 280 ms logo/face transition, a 2.8 s gentle idle breath, one 650 ms celebration, and a subtle listening pulse. Never autoplay a mascot sequence over a clinical form. Honor `prefers-reduced-motion` and provide a static state. The interactive logo toggle has a text accessible name; decorative Qori art is hidden from assistive technology.

## Tokens

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Brand | `--qorlia-green` | `#1F5238` | Header, primary action, focused brand moments |
| Brand hover | `--qorlia-green-strong` | `#173E2B` | Primary action hover |
| Brand tint | `--qorlia-sage` | `#EDF3EE` | Selected navigation, calm callouts |
| Page | `--qorlia-canvas` | `#F5F7F5` | App canvas, never text surfaces |
| Surface | `--qorlia-surface` | `#FFFFFF` | Cards and forms |
| Border | `--qorlia-border` | `#DCE3DE` | Dividers and field outlines |
| Ink | `--qorlia-ink` | `#202321` | Primary text |
| Muted ink | `--qorlia-muted` | `#58615B` | Secondary text |
| Attention | `--qorlia-warning` | `#8A5B16` | Warning text with a label/icon |
| Critical | `--qorlia-critical` | `#B3261E` | Error text with a label/icon |

The website already uses most of this palette. The Bahmni React fork uses the same brand green through its existing Carbon theme hook. The upstream Carbon component system remains the functional base; Qorlia tokens should map into it instead of replacing every control.

The React fork uses a Qorlia wordmark and pentagon in its shared header, with the brand link returning to its home route. Shared Carbon controls, navigation and module tiles now follow the approved palette. This does not change the deployed legacy Bahmni, OpenELIS or Odoo interfaces. See [backend readiness](BACKEND_READINESS.md) and the [workflow parity ledger](FEATURE_PARITY.md) before treating the new UI as a working demo.

The [hospital branding format](HOSPITAL_BRANDING.md) is the first modular interface for deployment-specific names, logos and palette tokens. It intentionally does not accept arbitrary CSS or change clinical terminology. Those need separate workflow and safety review.

## Typography

- **Space Grotesk** for large Qorlia headings and wordmark.
- **Inter** for product body text, navigation, labels and controls. Keep clinical data readable at normal desktop sizes.
- **IBM Plex Mono** only for identifiers, codes and timestamps that benefit from fixed-width alignment.
- **Noto Sans Devanagari** as the Hindi fallback. Review translated copy with native speakers and test at narrow widths. A Hindi toggle should appear only where actual translations exist.

Avoid all-caps paragraphs, condensed small text and decorative type in clinical work. Keep body text at least 14 px and use 16 px for primary forms where feasible. Use no more than three visible type sizes inside a compact card.

## Layout and components

- Use an 8 px spacing rhythm with 4 px adjustments. Common gaps: 8, 16, 24 and 32 px.
- Use 8 px radius for inputs and buttons, 12 px for cards. Avoid heavy shadows; borders and spacing should carry structure.
- Keep primary actions in a consistent position. Make click targets at least 44 by 44 px where space permits.
- Tables need clear column labels, row focus, keyboard access, meaningful empty/loading/error states and no horizontal clipping of actions.
- Status must have text as well as color. Reserve red for real errors or clinically reviewed urgency, not ordinary incomplete work.
- Put role, location and the active patient context in view when staff act on patient data.
- Use plain labels: “Start consultation,” “Save draft,” “Lab result pending.” Avoid “workspace,” “provisioning,” or internal infrastructure terms in staff-facing flows.

## Accessibility and safety gate

Check WCAG AA contrast, keyboard navigation, visible focus, screen-reader labels, zoom at 200%, mobile/narrow layouts and Hindi text expansion. Any patient-facing or clinical workflow change requires representative staff review before release. Do not put unvalidated safety reminders or AI output into a production encounter screen merely because a mockup shows them.

## Voice and copy

Use short, direct sentences. Be specific about what Qorlia does: configuration, training, hosting where agreed, maintenance and support. Do not promise savings without a customer's baseline. Do not use em dashes in public-facing Qorlia copy.

## Rollout

1. Apply Qorlia brand tokens and wordmark in the React frontend fork while preserving upstream components and attribution.
2. Build and test the selected calm clinical queue as a non-production prototype using fictional data.
3. Validate that prototype with reception, nursing, clinical and administrative staff before mapping it to real Bahmni APIs.
4. Migrate one workflow at a time, measuring task completion, errors and training time. Keep the existing demo until the replacement is proven.

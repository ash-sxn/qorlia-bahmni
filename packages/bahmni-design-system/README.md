# @bahmni/design-system

## Description

[Project README](../../README.md) · [Qorlia design rules](../../docs/QORLIA_DESIGN_SYSTEM.md) · [Branding contract](../../docs/HOSPITAL_BRANDING.md)

A reusable React component library built on [Carbon Design System](https://carbondesignsystem.com/), designed for building modern healthcare and enterprise web applications.

This library was generated with [Nx](https://nx.dev).

## Responsibility and change boundary

Shared controls, layouts, typography, theme tokens and validated hospital branding. Read [exports](src/index.ts), [controls](src/atoms/), [composed controls](src/molecules/), [larger UI](src/organisms/) and [branding utilities](src/utils/branding.ts). The folder names describe composition, not separate applications.

An application should reuse these controls instead of adding another UI kit. Search consumers before changing props or interaction. Do not place patient fetching, invoice logic or feature-specific pages here. Branding is a constrained presentation format, not arbitrary scripts/CSS or a change to clinical semantics.

Use [design QA](../../docs/design-qa.md) for keyboard, focus, contrast, narrow layout and reduced-motion review. A shared change needs affected consumer tests as well as component tests. See [setup/build boundaries](../../docs/setup-guide.md#backend-and-build-boundaries); do not hand-edit generated library styles or bundles.

## Running unit tests

The current tests use Jest. From the repository root:

```bash
TS_NODE_SKIP_PROJECT=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' yarn jest --config packages/bahmni-design-system/jest.config.ts --runInBand
```

See [the testing guide](../../docs/testing-guide.md) for the current Nx graph limitation and [setup](../../docs/setup-guide.md) for Windows command syntax.

## Shared modal semantics

Use the existing Modal, heading and labelled controls. Its open portal wrapper is a named region containing Carbon's focus sentinels; the native dialog retains its own accessible name and close behavior. Closed wrappers add no empty landmark. Do not infer that closed dialog DOM is unmounted: native Carbon CSS/transitions manage its visibility. Check real keyboard focus and closed/narrow layouts in the browser as well as the [automated modal tests](src/atoms/modal/__tests__/index.test.tsx).

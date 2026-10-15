# @bahmni/design-system

## Description

A reusable React component library built on [Carbon Design System](https://carbondesignsystem.com/), designed for building modern healthcare and enterprise web applications.

This library was generated with [Nx](https://nx.dev).

## Running unit tests

The current tests use Jest. From the repository root:

```bash
TS_NODE_SKIP_PROJECT=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' yarn jest --config packages/bahmni-design-system/jest.config.ts --runInBand
```

See [the testing guide](../../docs/testing-guide.md) for the current Nx graph limitation and [setup](../../docs/setup-guide.md) for Windows command syntax.

## Shared modal semantics

Use the existing Modal, heading and labelled controls. Its open portal wrapper is a named region containing Carbon's focus sentinels; the native dialog retains its own accessible name and close behavior. Closed wrappers add no empty landmark. Do not infer that closed dialog DOM is unmounted: native Carbon CSS/transitions manage its visibility. Check real keyboard focus and closed/narrow layouts in the browser as well as the [automated modal tests](src/atoms/modal/__tests__/index.test.tsx).

# @bahmni/command-palette

[Project README](../../README.md) · [Command palette guide](../../docs/command-palette-guide.md) · [Design system](../../docs/QORLIA_DESIGN_SYSTEM.md)

## Responsibility and entry points

The command palette is shared navigation/search UI, not a new hospital backend or an independent clinical record. Read [src](src/), the [usage guide](../../docs/command-palette-guide.md) and [shared search registry](../../packages/bahmni-widgets/src/search/registry/). Available commands depend on configuration and access.

## Change and verify

Use [setup](../../docs/setup-guide.md) and [testing](../../docs/testing-guide.md) with `apps/command-palette/jest.config.ts` and `apps/command-palette/tsconfig.lib.json`, from repository root. Preserve keyboard navigation, focus return, accessible labels and permission-aware destinations. A hidden command is not server authorization. Test configured/empty/denied results and correct new-UI navigation, not just whether the palette opens.

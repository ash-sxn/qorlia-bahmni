# Hospital branding format

The public Qorlia frontend reads `assets/branding.json` before rendering. A hospital deployment can replace that file without editing application code. This is a small design-token format, not a general CSS or JavaScript upload.

```json
{
  "name": "City Hospital",
  "logoPath": "/bahmni-v2/assets/city-hospital.png",
  "primary": "#204B3A",
  "primaryHover": "#163B2C",
  "canvas": "#F7F8F6"
}
```

- `name` is the visible hospital or product name, with a 60-character limit.
- `logoPath` is an optional same-site PNG, WebP or SVG path. Uploaded SVG files must be sanitized before publication. Do not link to an external image host.
- `primary` and `primaryHover` must be six-digit hex colors with at least 4.5:1 contrast against white text.
- `canvas` is the pale application background. Keep dark text readable against it.
- Invalid or unavailable configuration falls back to the Qorlia defaults. The frontend never accepts arbitrary CSS selectors, scripts or per-screen clinical copy from this file.

Qorlia can offer a private branding editor, asset approval and deployment workflow, but this public renderer and any modifications to covered upstream files remain under this repository's license. The per-hospital values and uploaded brand assets do not need to be committed to this public fork. Review the license of each separate Bahmni, lab and billing component before applying the same approach there. Keep required upstream copyright and license notices, and show a clear “Built on Bahmni” credit.

For local visual review, run `corepack yarn dev` from the repository root and open `/bahmni-v2/design-preview`. That route exists only in development builds. It uses sample data and does not connect to a hospital database.

---
name: airdokan-webflow-app-builder
description: Use this skill when building, reviewing, bundling, or submitting AirDokan-branded Webflow apps or Designer Extensions, especially apps intended for Webflow Marketplace review.
---

# AirDokan Webflow App Builder

Use this skill for future AirDokan Webflow apps, Designer Extensions, marketplace submissions, and review fixes.

## Brand Rules

- Brand owner: AirDokan.
- Brand URL: `https://airdokan.com/`.
- Product footer/link: include `Made by AirDokan` and link it to `https://airdokan.com/`.
- Primary blue: `#075df6`.
- Hover/darker blue: `#074bd5`.
- Text dark: `#070b18`.
- Muted text: `#5d6886`.
- UI style: clean, modern, practical, Webflow-like, and focused on the actual app workflow.
- Prefer AirDokan PNG assets from `public/assets`:
  - `airdokan-mark.png`
  - `airdokan-wordmark.png`
  - `assetpaste-icon.png`
- Avoid shipping unused SVG assets in the production bundle unless they are essential and reviewed for safety.

## UX Defaults

- The first screen should be the usable app, not a landing page.
- Use compact, clear controls and predictable layout.
- Use toast notifications for success/error/info states.
- Toasts should auto-dismiss and fade out subtly.
- Error messages must clear once the user fixes the issue or starts a new action.
- Icon-only buttons must have accessible labels and tooltips, except dismiss/close toast buttons can keep `aria-label` without a hover tooltip.
- Let users type natural filenames with spaces.
- Convert upload filenames to web-safe slugs only at preview/upload time.
- Generate readable alt text from filenames while alt text is still automatic.
- Once the user manually edits alt text, do not overwrite it.

## Webflow Runtime Rules

- Only call `window.webflow.createAsset(...)` when the Webflow Designer API exists.
- If the API is missing, show an error. Never show fake upload success.
- Local preview can test UI behavior, paste handling, filename handling, and validation, but real asset upload must happen inside Webflow Designer.
- After successful upload, reset the app so it is ready for the next asset.

## Image And SVG Safety

- Never upload raw SVG markup to Webflow Assets.
- If supporting SVG input, rasterize SVG to PNG or WebP before calling `window.webflow.createAsset(...)`.
- Detect SVG by content, not only MIME type or filename. Sniff the file bytes before upload so a fake PNG containing SVG markup is still rasterized.
- Treat XML-looking image payloads, such as content beginning with `<?xml`, as SVG candidates and fail safely if they do not parse as valid SVG.
- Cap pasted text/HTML before SVG extraction to avoid freezing on very large crafted input.
- Before rasterizing SVG, sanitize with a strict safety pass:
  - Remove `DOCTYPE` and `ENTITY` declarations.
  - Remove `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, and `<meta>`.
  - Remove all `on*` event handler attributes.
  - Remove external `href`, `xlink:href`, and `src` values.
  - Remove external `url(...)` references in `style`, `filter`, `clip-path`, and `mask`.
- For pasted URLs, apply the same validation to every paste path:
  - Plain-text URL paste.
  - HTML paste via extracted `<img src>`.
  - Drag/drop or clipboard-derived URL paths.
- Only fetch URLs that clearly resolve to supported image sources, such as `data:image/...` or HTTP(S) URLs ending in known image extensions.
- Respect Webflow's image upload limit. For images over 4 MB, optimize or show a clear error.

## Bundle Requirements

- Build with Vite/React/Tailwind when appropriate.
- Use relative Vite asset paths for Webflow iframe compatibility:
  - `base: "./"` in `vite.config.js`.
- Include source maps for Webflow review:
  - `build.sourcemap: true`
  - Verify `.js.map` is included in `bundle.zip`.
  - Verify the map has `sourcesContent`.
- Do not include `.DS_Store` files in the bundle.
- Do not include Webflow CLI telemetry blocks in `webflow.json`.
- Keep `webflow.json` minimal, for example:

```json
{
  "name": "AssetPaste",
  "apiVersion": "2",
  "size": "large",
  "publicDir": "dist"
}
```

- If the Webflow CLI rewrites `webflow.json` with telemetry, avoid using the CLI bundler for submission. Create the zip from a clean staging folder containing:
  - `webflow.json`
  - `index.html`
  - `assets/...`

## Pre-Submission Audit

Before uploading a marketplace bundle, verify:

- `npm run build` passes.
- `npm run bundle` creates the final `bundle.zip`.
- `bundle.zip` contains `webflow.json` at the root.
- `bundle.zip` contains `index.html` at the root.
- `bundle.zip` contains built assets under `assets/`.
- `bundle.zip` contains a `.js.map` file.
- Source map includes `sourcesContent`.
- No `.DS_Store` exists in the zip.
- No telemetry text exists in `webflow.json`, `dist`, or the zip.
- No raw SVG upload path reaches `window.webflow.createAsset(...)`.
- If SVG files are accepted, they are rasterized before upload.
- Missing Webflow API produces an error, not fake success.
- HTML and plain-text paste paths use the same URL validation.

Useful checks:

```bash
npm run build
npm run bundle
unzip -l bundle.zip
unzip -p bundle.zip webflow.json
find . -name .DS_Store -print
rg -n "telemetry|allowTelemetry" webflow.json dist bundle.zip
```

## Submission Notes Template

Use this structure in Webflow's "Submission version notes" field:

```markdown
# New Features
- Added or updated the main user-facing workflows in this version.

# Changes/Fixes
- Fixed Webflow review items and any user-facing bugs.
- Explain exactly which upload, paste, security, or bundle issues changed.

# Improvements
- Improved UX, accessibility, performance, validation, and error handling.

# Resolution notes
- Addressed prior review feedback:
- SVG input is not uploaded as raw SVG; it is sanitized and rasterized before upload.
- Missing Webflow Designer API now shows an error instead of fake success.
- HTML and plain-text image paste paths use the same URL validation.
- Bundle excludes `.DS_Store` and telemetry.
- Source maps with `sourcesContent` are included.
```

## Marketplace Review Mindset

- Treat Webflow Marketplace requirements as production security requirements, not optional polish.
- When in doubt, verify the latest official Webflow docs before submission.
- Prefer boring, explicit safety checks over clever shortcuts.
- Keep review notes detailed enough that Webflow can evaluate changes quickly.

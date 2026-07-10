# AssetPaste

AssetPaste is a Webflow Designer Extension for copying images from Figma, screenshots, or your filesystem, reviewing them in an app panel, renaming them, and uploading them directly into Webflow Assets.

## App description

AssetPaste helps you add images to Webflow faster. Copy one or more images from Figma or another app, paste them into AssetPaste, rename files, add alt text, and upload them to your Webflow Assets panel. It can also shrink large images so they fit Webflow's upload limit.

Made by [AirDokan](https://airdokan.com/).

## What the app does

- Accepts one or multiple pasted image files from Figma and other apps.
- Accepts drag-and-drop and multi-file picker uploads.
- Lets you rename the filename before upload.
- Resets after a successful upload so the next pasted asset can be handled immediately.
- Replaces old status messages so fixed errors and clear states do not linger.
- Automatically optimizes PNG, JPG, WebP, and AVIF files over Webflow's 4 MB image limit into high-quality WebP before upload.
- Preserves image quality by wrapping the original `Blob/File` bytes in a renamed `File` instead of drawing through canvas.
- Includes rounded in-app and non-rounded submission icon source assets in `brand-assets`.
- Uses a modern React and Tailwind frontend built with Vite.
- Calls `webflow.createAsset(file)` when running inside Webflow Designer.
- Simulates upload locally so the UI can be tested without Webflow.

## Run locally

This is a static app. You can serve it with any static server:

```bash
npm run preview
```

Then open:

```text
http://localhost:5173
```

Clipboard button support depends on browser permissions and secure-context rules. Normal Cmd+V/Ctrl+V paste handling works through the paste event.

## License

AssetPaste is open source under the [MIT License](./LICENSE).

## Webflow app integration

This project is configured as a Webflow Designer Extension with `webflow.json`.
Inside Designer, the app expects the Designer API global:

```js
window.webflow.createAsset(file)
```

The upload path lives in `src/main.jsx` inside `handleUpload()`.

### Install as a development app

1. Install dependencies:

```bash
npm install
```

2. Start the local development server:

```bash
npm run dev
```

3. In Webflow, create or open a registered App with the Designer Extension capability.
4. Go to Workspace Settings > Apps & Integrations > Develop.
5. Find the app, open the three-dot menu, and choose Install.
6. Pick the test site/workspace and authorize the app.
7. Open the site in Designer, press `E` to open the Apps panel, and launch the development app.

### Publish and install a bundled version

1. Bundle the extension:

```bash
npm run bundle
```

2. The build output is generated in `dist`, and Webflow bundles that folder because `webflow.json` uses `publicDir: "dist"`.
3. Upload the generated `bundle.zip` in Workspace Settings > Apps & Integrations > Develop > Publish extension version.
4. Install it from the same Develop section for your own workspace, or submit it to the Webflow Marketplace before external users can install it publicly.

### Remove the app

From Designer:

1. Open the Apps panel.
2. Select AssetPaste.
3. Click Remove app.
4. Follow the redirect to Site or Workspace settings and confirm removal.

From Site settings:

1. Go to Site settings > Apps & Integrations.
2. Find AssetPaste under authorized apps.
3. Click Revoke.

From Workspace settings:

1. Go to Workspace Settings > Apps & Integrations.
2. Find AssetPaste.
3. Click Uninstall app and confirm.

If the app was authorized at workspace level, removing it from one site requires revoking it from the workspace.

## Quality notes

The app does not resize, compress, or re-encode images when they are under Webflow's image upload limit. Rename is done with:

```js
new File([originalFile], renamedFilename, {
  type: originalFile.type,
  lastModified: originalFile.lastModified || Date.now(),
})
```

That keeps the original bytes intact. If Figma puts a PNG on the clipboard, that PNG is uploaded as-is. If a source only gives the clipboard a lower-resolution raster image, the app cannot recover extra detail from the original design file.

For images over 4 MB, the app uses an in-browser canvas conversion to WebP so Webflow will accept the upload. This is the only path that changes the image bytes, and it happens because Webflow's Assets panel rejects images over 4 MB.

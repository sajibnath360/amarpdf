# AmarPDF Developer Guide

This project intentionally has **no build step and no framework**. Open `index.html` directly or host the folder on GitHub Pages.

## File map

- `index.html` — page shell and external library `<script>` tags.
- `style.css` — all visual styles. The final responsive section is at the bottom.
- `app.js` — application logic and PDF tools.
- `README.md` — project overview.

## Edit PDF: where to change the buttons

Search `app.js` for:

```text
EDITOR_APPLY_BUTTON_ID
EDITOR_DOWNLOAD_BUTTON_ID
```

The actual Edit PDF footer is inside:

```text
function toolMarkup(id)
```

under:

```text
if (id === "edit")
```

The buttons are:

- `Apply Edit` — runs `runTool("edit")`, which calls `editPdf()`.
- `Download latest PDF` — a real `<a download>` element. It is enabled only after `editPdf()` successfully creates a valid PDF.

## Edit PDF export flow

```text
Apply Edit
   ↓
runTool("edit")
   ↓
editPdf()
   ↓
pdf-lib PDFDocument.save()
   ↓
validate %PDF-
   ↓
create Blob + blob URL
   ↓
set #editorDirectDownload.href
   ↓
Download latest PDF
```

Every successful Apply Edit replaces the previous download URL with the newest PDF.

## Responsive design

The responsive CSS is intentionally grouped at the **bottom of `style.css`** under:

```text
NEXAPDF RESPONSIVE SYSTEM
```

Breakpoints:

- `900px` — tablet layout
- `680px` — phone layout
- `400px` — very small phones

The editor keeps the document area scrollable while the toolbars and footer remain usable.

## Browser compatibility

The app uses standard browser APIs, `@media` queries, Blob URLs, and the HTML `download` attribute. PDF.js workers are enabled on normal HTTP/HTTPS hosting and disabled when opening `index.html` directly with `file://` for local-file compatibility.

## Important rule when editing the code

Do not create a second editor download card, result modal, or replacement download button. The editor intentionally has **one Apply button and one persistent Download button**.

## Image Resize tool

The image resize tool is defined in `app.js` under the `IMAGE RESIZE TOOL` section.

- Tool registration: `TOOLS` array, id `imageResize`
- UI: `toolMarkup("imageResize")`
- Event binding: `bindImageResizeTool()`
- Processing: `resizeImages()`
- High-quality renderer: `imageToCanvas()`
- DPI metadata: `makeJpegDpi()` and `makePngDpi()`
- Styling: search `AmarPDF Image Resize tool` in `style.css`

The tool supports multiple images, custom pixel dimensions, aspect-ratio locking, percentage/long-edge presets, print dimensions with DPI, custom DPI, JPG/PNG/WebP output, high-quality interpolation, and ZIP output for multiple files.


## Image Resize UI (simple)
The Image Resize tool is intentionally kept simple: target file size slider (KB/MB), custom width/height, and a Keep aspect ratio checkbox. Advanced format/DPI/quality settings are under **More options**.

### Main code locations
- `toolMarkup("imageResize")` — user interface
- `bindImageResizeTool()` — slider, unit toggle, width/height linking
- `resizeImages()` — processing and target-size optimization
- `imageToCanvas()` — high-quality canvas rendering
- `imageOutputFormat()` / `imageOutputName()` — output handling
- `.image-size-card`, `.image-dimension-card`, `.image-advanced-row` in `style.css` — visual design

The target-size optimizer uses iterative quality adjustment and, when necessary, progressive dimension reduction for JPEG/WebP. PNG remains lossless and therefore cannot always hit an arbitrary byte target.

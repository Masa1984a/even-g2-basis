# Bug report: `updateImageRawData` always fails in the simulator with `sendFailed`

**TL;DR:** The simulator tries to decode `imageData` as an *encoded image file* (PNG/JPEG/…),
but the SDK contract and the real hardware accept a *raw greyscale byte array*
(1 byte per pixel). Every `updateImageRawData` call therefore fails in the simulator,
while the exact same code renders correctly on a real G2.

---

## Environment

| | |
|---|---|
| `@evenrealities/evenhub-simulator` | **0.8.0** (also reproduced on **0.7.3**) |
| `@evenrealities/even_hub_sdk` | 0.0.13 |
| OS | Windows 11 (10.0.22631) |
| App | Vite + TypeScript, served from `http://localhost:5173` |

## What happens

Every call to `updateImageRawData` resolves with `sendFailed`. The image container
stays blank; text containers on the same page render correctly.

The simulator's own stdout shows the underlying reason:

```
[2026-08-05T03:52:33Z ERROR evenhub_simulator_lib::vm] update_image_raw_data: failed to decode image: The image format could not be determined
[2026-08-05T03:52:35Z ERROR evenhub_simulator_lib::vm] update_image_raw_data: failed to decode image: The image format could not be determined
```

`The image format could not be determined` is the classic error from the Rust `image`
crate's format guesser, which means the simulator is running the payload through
`image::load_from_memory` (or equivalent) and expecting a container format with a
magic-number header — PNG, JPEG, BMP, etc.

## What I expected

Per the SDK docs, `imageData` is raw pixel data, not an encoded file:

- `Display & UI System` → *Image containers*: "Render greyscale images. Up to 288 x 144 px
  per container. **4-bit greyscale.** Accepts `number[]`, `Uint8Array`, `ArrayBuffer`, or base64."
- The SDK's `ImageRawDataUpdate.imageData` is typed `number[] | string | Uint8Array | ArrayBuffer`,
  and `bytesToJson` normalises `number[]` to values clamped to 0–255 — i.e. a plain byte buffer,
  with no mention of any file container.
- The error enum itself (`imageToGray4Failed`) implies the host converts raw samples to gray4,
  which only makes sense for unencoded pixel data.

A raw 288×144 greyscale buffer has no magic number, so a format-sniffing decoder will
always reject it. That is exactly what we see.

## Reproduction

Minimal repro — create a page with one image container, then push a flat grey buffer:

```ts
import {
  waitForEvenAppBridge, CreateStartUpPageContainer, TextContainerProperty,
  ImageContainerProperty, ImageRawDataUpdate,
} from '@evenrealities/even_hub_sdk'

const bridge = await waitForEvenAppBridge()

await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
  containerTotalNum: 2,
  textObject: [new TextContainerProperty({
    containerID: 1, containerName: 'catcher',
    xPosition: 0, yPosition: 0, width: 576, height: 288,
    content: ' ', isEventCapture: 1,
  })],
  imageObject: [new ImageContainerProperty({
    containerID: 2, containerName: 'chart',
    xPosition: 144, yPosition: 72, width: 288, height: 144,
  })],
}))

// 288 * 144 raw greyscale bytes (1 byte per pixel), mid-grey
const imageData = new Array(288 * 144).fill(128)

const result = await bridge.updateImageRawData(new ImageRawDataUpdate({
  containerID: 2, containerName: 'chart', imageData,
}))

console.log(result) // simulator: "sendFailed"   real G2: "success"
```

Steps:

1. `npm run dev` (Vite on :5173)
2. `evenhub-simulator "http://localhost:5173/" --automation-port 9898`
3. `curl http://127.0.0.1:9898/api/console` → `updateImageRawData` returned `sendFailed`
4. Check the simulator's stdout → `failed to decode image: The image format could not be determined`

Actual output from the snippet above:

```
[repro] createStartUpPageContainer = 0
[repro] updateImageRawData = sendFailed len = 41472
```

with, on stdout:

```
[ERROR evenhub_simulator_lib::vm] update_image_raw_data: failed to decode image: The image format could not be determined
```

Note this is a flat, uniform buffer (`.fill(128)`), so nothing about the *content* is
unusual — the payload simply isn't an encoded image file.

The same build sideloaded onto a real G2 (via Beta Testing) renders the image correctly,
so this is simulator-only.

## Suggested fix

Treat `imageData` as raw pixel data rather than an encoded file. Since the container
dimensions are already known from `createStartUpPageContainer` / `rebuildPageContainer`,
the buffer length is enough to interpret it:

- `len == width * height` → 8-bit greyscale, one byte per pixel (quantise to gray4)
- `len == width * height / 2` → already-packed 4-bit greyscale, two pixels per byte
- `len == width * height * 4` → RGBA (convert to luminance, then gray4)

Falling back to the current format-sniffing decode when the length matches none of the
above would keep any existing encoded-image behaviour working.

## Impact

This is the one thing that can't be validated in the simulator today. Everything else
matched the hardware nicely in my testing — text containers, layout, event routing,
the automation HTTP API. Being able to preview image containers would close the last gap,
and it matters for the store submission flow too, since the guidelines ask for screenshots
captured via the simulator, and image-based apps currently can't produce one.

## Note on the docs

`App Submission & QA Guidelines` links to the reviewer rubric at
`/docs/reference/app-submission`, but that path 404s — the page actually lives at
`/docs/ship/app-submission`.

**Simulator: `updateImageRawData` always fails with `sendFailed`**

Simulator 0.8.0 (also 0.7.3), SDK 0.0.13, Win11. Text containers render fine; image containers stay blank. Simulator stdout:

```
update_image_raw_data: failed to decode image:
The image format could not be determined
```

That's the Rust `image` crate's format sniffer — the simulator treats `imageData` as an **encoded file** (PNG/JPEG/…). But the docs and SDK types say raw pixels ("4-bit greyscale. Accepts `number[]`, `Uint8Array`, `ArrayBuffer`, or base64"), and a raw buffer has no magic number, so sniffing always fails.

Repro — 288×144 image container, then:

```ts
const imageData = new Array(288 * 144).fill(128) // flat grey
await bridge.updateImageRawData(new ImageRawDataUpdate({
  containerID: 2, containerName: 'chart', imageData,
}))
// simulator: "sendFailed"   real G2: "success"
```

Uniform buffer, so it's the format, not the content. Same build on a real G2 renders fine — simulator-only.

**Fix idea:** dimensions are known, so buffer length disambiguates: `w*h` → 8-bit grey, `w*h/2` → packed gray4, `w*h*4` → RGBA; fall back to the current decode otherwise.

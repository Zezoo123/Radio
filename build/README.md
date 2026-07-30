# Build resources

electron-builder reads packaging resources from this directory
(`buildResources: build` in `electron-builder.yml`).

## App icon

**`icon.ico`** is the Windows app/installer icon; electron-builder picks it
up automatically for the NSIS installer, the portable exe, and the app
window. It must be a multi-image ICO containing at least the **256×256**
image (electron-builder rejects ICOs without it); this one carries
16/24/32/48/64/128/256 px renditions as PNG-compressed 32-bit RGBA entries.

The current icon is a house-made mark in the app's Modernist theme (signal
red `#ec3013`, Archivo "R", broadcast arcs). To replace it, convert any
square ≥512 px logo to a multi-size ICO (keep the 256 entry) and overwrite
`icon.ico`. (If a `.icns`/512×512 `icon.png` is ever added alongside it,
macOS and Linux builds get icons the same way.)

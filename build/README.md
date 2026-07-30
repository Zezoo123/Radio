# Build resources

electron-builder reads packaging resources from this directory
(`buildResources: build` in `electron-builder.yml`).

## App icon — what to supply

Drop the artwork in as:

- **`icon.ico`** — the Windows app/installer icon. A multi-image ICO
  containing at least the **256×256** image (electron-builder rejects ICOs
  without it), plus 16, 24, 32, 48, 64 and 128 px renditions so the taskbar,
  Explorer and Alt-Tab all stay sharp. 32-bit RGBA (alpha included);
  PNG-compressed entries are fine.

With `icon.ico` present, electron-builder picks it up automatically for the
NSIS installer, the portable exe, and the app window — no config changes
needed. (If a `.icns`/512×512 `icon.png` is ever added alongside it, macOS
and Linux builds get icons the same way.)

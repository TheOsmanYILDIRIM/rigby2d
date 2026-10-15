# Rigby2D brand assets

The Rigby2D name, logo, lockups and icons in this folder are proprietary trademarks of Hoverlabs.
They are **not** covered by the MIT or Apache 2.0 licenses that apply to the source code. See
[TRADEMARKS.md](../TRADEMARKS.md) for what is allowed.

| File | Use |
| --- | --- |
| `rigby2d-lockup-dark.svg` | Product signature on a charcoal background (documentation, README) |
| `rigby2d-lockup-transparent.svg` | Product signature for dark surfaces |
| `rigby2d-mark.svg` | The R mark alone |
| `rigby2d-icon-dark.svg` | App icon and favicon source |
| `rigby2d-icon-256.png` | Rendered app icon |
| `rigbytron/rigbytron.rigby` | Rigbytron, the mascot: rig and animations (`hold`, `release`), a Rigby2D work file. The editor opens it as the demo project |
| `rigbytron/export/` | Rigbytron exported for the runtime (`.skel`, `.json`, `.atlas`, `.png`), played by the splash screen |

Use the lockups on charcoal or near-black backgrounds, keep clear space of at least a quarter of
the icon height around them, and do not recolor, stretch or rearrange their parts.

## Rigbytron

The splash screen (`splash.html`, `src/splash/splash.js`) plays `rigbytron/export/rigbytron.skel`
once: `hold`, then `release`, whose `slash` event reveals the lockup; when it finishes the editor
opens. To change the animation, open `rigbytron/rigbytron.rigby` in Rigby2D,
edit it and export the `.skel + atlas (4.3)` into `rigbytron/export/` with the same file names.
The editor bundles `rigbytron/rigbytron.rigby` as its demo project (File ▸ Open demo), so the
same save updates the demo.

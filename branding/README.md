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
| `mascot/rigby2d-mascot.rigby` | The mascot rig and its animations (`hold`, `release`), a Rigby2D work file |
| `mascot/export/` | The mascot exported for the runtime (`.skel`, `.json`, `.atlas`, `.png`), played by the splash screen |

Use the lockups on charcoal or near-black backgrounds, keep clear space of at least a quarter of
the icon height around them, and do not recolor, stretch or rearrange their parts.

## Mascot

The splash screen (`splash.html`, `src/splash/splash.js`) plays `export/rigby2d-mascot.skel`: the
`hold` loop runs while the editor loads, then `release` slashes the hand outward and its `slash`
event reveals the lockup. To change the animation, open `mascot/rigby2d-mascot.rigby` in Rigby2D,
edit it and export the `.skel + atlas (4.3)` into `mascot/export/` with the same file names.

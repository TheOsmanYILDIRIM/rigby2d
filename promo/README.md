# Promo video studio

Motion-graphics promo for YouTube, drawn with Rigby2D's own renderer and the real Rigbytron rig.

```bash
npm run dev
```

Open http://localhost:1420/promo/index.html, pick a cut, optionally choose a music file, and press
**Render MP4**. Files are saved to `promo/out/` (git-ignored).

| Cut        | Size              | Length | Use                  |
| ---------- | ----------------- | ------ | -------------------- |
| `overview` | 1920×1080, 60 fps | 75 s   | Main YouTube video   |
| `teaser`   | 1920×1080, 60 fps | 30 s   | Social posts, README |
| `short`    | 1080×1920, 60 fps | 30 s   | YouTube Shorts       |

**Save thumbnail** writes the 1280×720 YouTube thumbnail. Cuts land on a 120 BPM grid (a beat every
0.5 s), so a 120 BPM track lines up with the scene changes; the music is trimmed to the cut and faded
out over the last two seconds.

Files: `engine.js` (palette, easing, type and card helpers), `cast.js` (characters), `scenes.js`
(scenes and cuts), `encode.js` (H.264 + AAC to MP4), `studio.js` (this page).

## YouTube copy

**Title:** Rigby2D: free, open-source 2D skeletal animation (AutoRig, film, games, AI)

**Description:**

> Rigby2D is a free, open-source 2D skeletal animation editor for games and film.
>
> • AutoRig: layered art in, bones, meshes and IK out
> • Animate with keys, curves and IK, then retarget onto other characters
> • Film: camera moves, lip-sync, MP4/WebM/PNG renders with sound
> • Games: JSON / .skel export and a fast Rust runtime for Godot 4
> • AI: built-in MCP server so Claude can edit your projects, plus Python scripting
>
> Download (Windows): https://github.com/jaisurya-dev-art/rigby2d/releases/latest
> Source: https://github.com/jaisurya-dev-art/rigby2d
> Code: MIT or Apache-2.0. Made with Rigby2D.
>
> 0:00 Rigby2D
> 0:06 AutoRig
> 0:18 Animate and retarget
> 0:30 Film
> 0:42 Games
> 0:52 AI and Python
> 1:04 Get Rigby2D

**Tags:** 2d animation, skeletal animation, open source, rigging, autorig, game dev, godot, animation software, free animation software

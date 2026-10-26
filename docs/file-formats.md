# File formats

| File | What it is | Made by |
| --- | --- | --- |
| `.rigby` | The work file: a ZIP with `project.json` (the whole document) and `images/*.png`, plus `audio/*` for audio tracks. | *File ▸ Save* |
| `.json` | Skeleton JSON, format 3.8, 4.2 or 4.3. | *Export JSON + atlas* |
| `.skel` | Binary skeleton, format 4.3. | *Export .skel + atlas* |
| `.atlas` + `.png` | Texture atlas: the packed images and where each one sits. | Both exports |

## The `.rigby` work file

One self-contained file, like a `.blend`: bones, slots, skins, constraints, events, animations,
images, and the editor-only data (workspace, film output settings, poses, face controls, audio
tracks). Open it with *File ▸ Open*. Keep it in version control or back it up; exports can always be
made again from it.

## Skeleton JSON and `.skel`

The interchange formats runtimes load. Bones are listed so parents come first, slots are in draw
order, attachments live in skins, and animations hold timelines with keys relative to the setup
pose. Images come from the `.atlas` or from loose files in the skeleton's `images` folder.

Rigby2D reads and writes these formats losslessly, for interoperability with your own exported files.
Support was implemented clean-room from public documentation and observation of exported data.

## Coordinates and units

- Units are pixels of the artwork at scale 1.
- Y points **up** (runtimes for Y-down engines, such as Godot, convert).
- Angles are in degrees, counterclockwise.
- Times are in seconds.

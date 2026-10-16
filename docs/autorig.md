# Rigby AutoRig and animation retargeting

## Rigby AutoRig

AutoRig turns layered artwork into an editable rig in one step. It works from a PSD with one
layer per body part.

1. *File ▸ AutoRig artwork…*, then **Import PSD…**. Layers are imported in place, one image per
   layer.
2. Check the table. Each layer has a **part** and a **side**, found from its name or, when the
   name says nothing, from where it sits. Change any that are wrong, or choose *leave unrigged*.
3. **Generate rig**. It is one undo step.

### What it builds

- **Spine**: `hip` low in the body and `chest` up to the shoulders. The body layer becomes a mesh
  that bends with both.
- **Neck and head**: the head turns at its base.
- **Arms and legs**: `upperarm`, `forearm`, `hand`, `thigh`, `shin` and `foot` bones, with joints
  placed where the layers meet.
  - A single layer for a whole arm or leg is split into two bones and turned into a weighted mesh,
    so it bends at the elbow or knee.
  - IK targets (`ik_hand_l`, `ik_foot_r`, …) are added for two-bone limbs. A limb drawn bent keeps
    its bend direction; a straight one bends its middle joint away from the body. Flip
    *Bend positive* in the IK settings to reverse it.
- **Face**: small bones for eyes, pupils (following their eye), brows, nose, mouth and jaw, under
  the head.
- **Extras**: hair and ears hang from the head, wings from the chest, and tails from the hip as a
  three-bone chain with a mesh.
- **Anything else** rides on the nearest bone, and the log lists it.

Every layer stays exactly where it was drawn, and everything AutoRig makes is ordinary rig data
that you can edit.

### Naming layers

Names are read loosely: case, separators and word order do not matter. For example,
`L_UpperArm`, `upper arm left`, `arm.l` and `LeftArm2` are all understood.

| Part | Names that work |
| --- | --- |
| Torso | `torso`, `body`, `chest`, `trunk`, `belly`, `shirt`, `jacket`, `dress` |
| Pelvis | `pelvis`, `hip(s)`, `waist`, `pants`, `shorts`, `skirt`, `belt` |
| Head and neck | `head`, `face`, `skull`; `neck` |
| Arms | `upperarm` / `upper arm` / `shoulder` / `sleeve`; `forearm` / `lower arm` / `elbow`; `hand`, `fist`, `glove`, `fingers`, `claw`; or `arm` for a whole arm |
| Legs | `thigh` / `upper leg`; `shin` / `calf` / `lower leg` / `knee`; `foot`, `shoe`, `boot`, `paw`; or `leg` for a whole leg |
| Face | `eye`, `pupil` / `iris`, `brow` / `eyebrow`, `mouth` / `lips` / `teeth`, `nose`, `jaw` / `chin`, `ear` |
| Extras | `hair`, `bangs`, `ponytail`, `hat`, `helmet`, `horns`; `tail`; `wing` |

**Sides**: `l`, `left`, `r` or `right`, anywhere in the name. Sides are the **character's**. When
a layer has no side, AutoRig assumes the character faces you, so its left is on the image's
right.

**Alternate images** of a part, such as `hand_open` and `hand_fist`, share the part's bone.

## Animation retargeting

Make an animation once and reuse it on other characters.

1. Open the character that should receive the animations.
2. Choose *File ▸ Retarget animations from another character…* and pick the project that has the
   animations.
3. Tick the animations you want, then check the bone matches.
4. **Retarget**. It is one undo step.

### How bones are matched

Bones are matched in this order:

1. Your choice in the table.
2. The same name.
3. A similar name: `arm.L` and `Arm_Left` match.
4. The same body part and side: `L_UpperArm` and `upperarm_l` match.

Control bones such as `ik_hand_l` only match other control bones. Keys of bones that have no match
are left out.

### Proportions and poses

- **Movement scale**: translations are scaled by the ratio of the two characters' heights. You
  can type your own value.
- **Bone frames**: translations are turned from each source bone's parent frame into the target
  bone's, so they move the same way in the world even when the rigs are built differently.
- **Mirrored bones**: when a bone is mirrored in one rig but not the other, its rotations are
  reversed.

**Rotations** have two modes:

- **Relative** (default): rotations are added to the target's own rest pose. Use it when the
  characters are rigged alike.
- **Match world directions**: bones point the way the source's bones point. It makes up for
  different rest poses, such as arms down in one rig and arms out in the other.

### What is carried over

| Carried over | Left out |
| --- | --- |
| Bone keys and their curves | Mesh deformation keys (meshes differ between characters) |
| Slot keys, by slot name; image swaps only for images the target has | Draw order keys |
| Events (missing event definitions are added) | |
| IK mix keys, by constraint name | |

The log lists anything left out.

## Through MCP

| Tool | What it does |
| --- | --- |
| `detect_parts` | Previews AutoRig on a PSD or an unrigged `.rigby` file. |
| `autorig` | Rigs a PSD into a new `.rigby` file, or rigs an unrigged one. |
| `map_bones` | Previews the bone matching between two characters. |
| `retarget_animation` | Copies one or more animations to another character. |

See the [MCP guide](mcp.md).

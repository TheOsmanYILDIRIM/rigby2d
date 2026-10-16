# Rigby2D MCP server

Rigby2D includes a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server, so AI
assistants such as Claude can inspect, validate, sample, edit and convert Rigby2D projects:
`.rigby` work files and skeleton `.json` / `.skel` exports.

It uses the same runtime as the editor and games (`src/core`), runs on Node.js 20 or newer, and
has no dependencies: a clone of the repository is enough, `npm install` is not needed.

## Setup

The server speaks MCP over stdio. Point your client at `src/mcp/server.js` and give it the folders
it may access with `--root` (repeatable; default: the folder the client starts it in).

**Claude Code**

```bash
claude mcp add rigby2d -- node /path/to/rigby2d/src/mcp/server.js --root /path/to/your/projects
```

**Claude Desktop and other clients** that use an `mcpServers` configuration file:

```json
{
  "mcpServers": {
    "rigby2d": {
      "command": "node",
      "args": ["/path/to/rigby2d/src/mcp/server.js", "--root", "/path/to/your/projects"]
    }
  }
}
```

On Windows, use full paths such as `C:\\Users\\you\\rigby2d\\src\\mcp\\server.js` (backslashes
doubled in JSON).

Run `node src/mcp/server.js --help` to check the installation. Start the server with `node`, not
through `npm run`: npm prints to standard output, which the protocol uses.

## Tools

### Reading and conversion

| Tool | What it does | Changes files |
| --- | --- | --- |
| `inspect_project` | Format and version, counts of bones, slots, skins, constraints, events and images, the animations with durations, read warnings. | No |
| `describe_rig` | Bone hierarchy with setup-pose transforms, slots in draw order with their attachments, extra skins. | No |
| `describe_animation` | Key times of every bone, slot, deform, IK and draw-order timeline of one animation, its events, attachment swaps. | No |
| `sample_pose` | Evaluates the setup pose or an animation at a time with the runtime: world transforms of every bone, visible attachments, draw order, events so far, bounds. | No |
| `validate_project` | Structure, images missing from the work file, atlas or images folder, animations without keys, whether skeleton JSON 4.3 round-trips the data, whether binary `.skel` export is possible. | No |
| `convert_project` | Writes skeleton JSON (3.8, 4.2 or 4.3) or binary `.skel` (4.3) from a `.rigby`, `.json` or `.skel` file. | Yes |

### Editing

| Tool | What it does |
| --- | --- |
| `add_bone` | Adds a bone under an existing bone, with its setup pose relative to the parent. |
| `set_bone_setup` | Changes a bone's setup pose (x, y, rotation, scale, shear, length); only the given fields. |
| `add_animation` | Adds an empty animation. |
| `set_bone_key` | Sets a rotate, translate, scale or shear key at a time, with a curve to the next key (`linear`, `stepped`, `easeIn`, `easeOut`, `easeInOut`). Replaces a key at the same time. |
| `delete_bone_key` | Deletes a bone key at a time. |
| `set_attachment_key` | Shows an attachment of a slot from a time on (image swap), or hides it. |
| `set_event_key` | Fires an event at a time, creating the event definition if needed. Replaces the same event at the same time. |

Key values are relative to the setup pose, as in the editor and the file formats: rotate,
translate and shear values are added to it, scale values multiply it. An animation's duration
grows to include new keys.

Each editing call loads the file, applies one change, checks the result and saves it in the same
format: a `.rigby` work file keeps its images byte for byte, skeleton JSON keeps its format version
(3.8, 4.2 or 4.3) and `.skel` stays binary 4.3. Saving is atomic (a temporary file is renamed over
the target). Pass `output` to save a copy instead of changing the input; an existing `output` is
only replaced with `overwrite: true`. To undo, keep a copy or use `output`: the tools do not keep
history. After editing, `sample_pose` and `validate_project` check the result; the Rigby2D editor
opens the edited `.rigby` file as usual.

### Conventions

Coordinates are in skeleton units with Y up; angles are in degrees. Results are returned both as
structured content and as JSON text.

### Notes

- **Images:** for a skeleton export, `validate_project` checks the images against `<name>.atlas`
  next to it, or else against the `.atlas` file in that folder that holds the most of the
  skeleton's images, or else against its images folder. For a `.rigby` file it checks the images
  stored inside it.
- **Round trip:** the check allows the rounding skeleton files use (5 decimals), compares bezier
  curves by kind (files store rounded absolute control points) and ignores format bookkeeping that
  is not rig data.
- **Conversion** writes skeleton data only. The texture atlas is not repacked: keep using the
  existing `.atlas` and page images, or export from the Rigby2D editor. `.rigby` work files are
  written by the editor, which holds the images. An existing output file is only replaced with
  `overwrite: true`.

## Security

- Every path is resolved inside the `--root` folders. Symbolic links are followed before the
  check, so links cannot lead outside them. Relative paths resolve against the first root.
- Only `convert_project` and the editing tools write: the project file they are given, or the
  `output` file. The tools never delete files and make no network requests.
- Tool annotations tell clients which tools are read-only (`readOnlyHint`) and which change files
  (`destructiveHint`), so clients can ask for confirmation before edits.

## Protocol

- Transport: stdio, one JSON-RPC 2.0 message per line. Logs go to standard error.
- Protocol revisions: `2025-06-18`, `2025-03-26` and `2024-11-05` (the client's choice when
  supported, otherwise the newest).
- Capabilities: `tools`. Requests: `initialize`, `ping`, `tools/list`, `tools/call`.
- Invalid tool arguments and tool failures come back as tool results with `isError: true` and a
  message the model can act on; unknown tools and methods are JSON-RPC errors.

The implementation is in `src/mcp/` (`protocol.js`: protocol handling and transport; `tools.js`:
reading, validation and conversion; `edits.js`: editing; `server.js`: command line) and is covered
by `test/mcp.test.js`.

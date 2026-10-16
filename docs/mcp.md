# Rigby2D MCP server

Rigby2D includes a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server, so AI
assistants such as Claude can inspect, validate, sample and convert Rigby2D projects: `.rigby`
work files and skeleton `.json` / `.skel` exports.

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

| Tool | What it does | Changes files |
| --- | --- | --- |
| `inspect_project` | Format and version, counts of bones, slots, skins, constraints, events and images, the animations with durations, read warnings. | No |
| `describe_rig` | Bone hierarchy with setup-pose transforms, slots in draw order with their attachments, extra skins. | No |
| `describe_animation` | Key times of every bone, slot, deform, IK and draw-order timeline of one animation, its events, attachment swaps. | No |
| `sample_pose` | Evaluates the setup pose or an animation at a time with the runtime: world transforms of every bone, visible attachments, draw order, events so far, bounds. | No |
| `validate_project` | Structure, images missing from the work file, atlas or images folder, animations without keys, whether skeleton JSON 4.3 round-trips the data, whether binary `.skel` export is possible. | No |
| `convert_project` | Writes skeleton JSON (3.8, 4.2 or 4.3) or binary `.skel` (4.3) from a `.rigby`, `.json` or `.skel` file. | Yes |

Coordinates are in skeleton units with Y up; angles are in degrees. Results are returned both as
structured content and as JSON text.

### Notes

- **Images:** for a skeleton export, `validate_project` checks the images against `<name>.atlas`
  next to it, or else against the `.atlas` file in that folder that holds the most of the
  skeleton's images, or else against its images folder. For a `.rigby` file it checks the images
  stored inside it.
- **Round trip:** the check allows the rounding skeleton files use (5 decimals) and ignores format
  bookkeeping that is not rig data.
- **Conversion** writes skeleton data only. The texture atlas is not repacked: keep using the
  existing `.atlas` and page images, or export from the Rigby2D editor. `.rigby` work files are
  written by the editor, which holds the images. An existing output file is only replaced with
  `overwrite: true`.

## Security

- Every path is resolved inside the `--root` folders. Symbolic links are followed before the
  check, so links cannot lead outside them. Relative paths resolve against the first root.
- Only `convert_project` writes, and only the output file it is given. The tools never delete
  files and make no network requests.
- Tool annotations tell clients which tools are read-only (`readOnlyHint`) and that conversion can
  replace a file when asked to (`destructiveHint`), so clients can ask for confirmation.

## Protocol

- Transport: stdio, one JSON-RPC 2.0 message per line. Logs go to standard error.
- Protocol revisions: `2025-06-18`, `2025-03-26` and `2024-11-05` (the client's choice when
  supported, otherwise the newest).
- Capabilities: `tools`. Requests: `initialize`, `ping`, `tools/list`, `tools/call`.
- Invalid tool arguments and tool failures come back as tool results with `isError: true` and a
  message the model can act on; unknown tools and methods are JSON-RPC errors.

The implementation is in `src/mcp/` (`protocol.js`: protocol handling and transport; `tools.js`:
the tools; `server.js`: command line) and is covered by `test/mcp.test.js`.

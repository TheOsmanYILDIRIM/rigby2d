# Contributing to Rigby2D

Thanks for your interest in improving Rigby2D! Bug reports, feature ideas, documentation fixes and
code are all welcome.

## Ways to contribute

- **Report a bug**: open an [issue](https://github.com/jaisurya-dev-art/rigby2d/issues) with steps
  to reproduce, what you expected, what happened, and your OS / Rigby2D version. Attach a small
  skeleton `.json` (with its images or atlas) if it helps.
- **Suggest a feature**: open an issue describing the problem you want solved before starting
  on a large change, so we can agree on the approach.
- **Send a pull request**: fixes, features, tests and docs.

## Development setup

1. Install [Node.js](https://nodejs.org) 20+ and the
   [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.
2. Fork and clone the repository, then:

   ```bash
   npm install
   npm run dev      # desktop window with hot reload
   npm test         # unit tests
   ```

`npm run web:dev` serves the UI in a plain browser at <http://localhost:1420>, which is handy for
quick UI work. File dialogs and disk access only work in the desktop app (`npm run dev`).

## Project layout

| Path | Notes |
| --- | --- |
| `src/core/` | Runtime used by games. **No dependencies and no DOM access**: it must run in any JS engine. |
| `src/editor/` | Editor UI. Plain JavaScript modules, DOM, a WebGL viewport with a Canvas 2D fallback; no UI framework. |
| `src/webgl/` | Reference WebGL renderer for the runtime, also used by the editor viewport. |
| `src/splash/` | Splash screen window. |
| `src/mcp/` | Model Context Protocol server ([docs/mcp.md](docs/mcp.md)). Node only, no dependencies; built on `src/core`. |
| `branding/` | Proprietary brand assets and the Rigbytron demo project; see [TRADEMARKS.md](TRADEMARKS.md). |
| `src-tauri/` | Native shell only. Keep app logic out of Rust; add permissions in `capabilities/` (`default.json` for the editor, `splash.json` for the splash) only when needed. |
| `test/` | `node:test` suites (`*.test.js`). |

## Coding guidelines

- Match the surrounding style: ES modules, 2-space indentation, single quotes, semicolons.
- Every source file starts with `// SPDX-License-Identifier: MIT OR Apache-2.0`.
- Keep skeleton JSON import/export lossless: anything read must be written back. If the format
  handling must change, discuss it in an issue first.
- Add or update tests in `test/` for changes to `src/core` or the pure editor helpers
  (`pack.js`, `sample.js`). Run `npm test` before pushing.
- For UI changes, include a screenshot or short clip in the pull request.

## Pull request process

1. Create a branch from `main` (`fix/…`, `feat/…`, `docs/…`).
2. Keep each PR focused on one change; write a clear description of what and why.
3. Make sure `npm test` passes and `npm run web:build` succeeds.
4. Link the related issue (e.g. `Closes #12`).
5. A maintainer will review; please respond to feedback with follow-up commits.

### Commit messages

Use short, imperative subjects (`Fix key drag snapping`, `Add color keys to dopesheet`), with a body
explaining the reasoning when it isn't obvious.

## License

By contributing, you agree that your contributions are licensed under both the [MIT License](LICENSE-MIT)
and the [Apache License 2.0](LICENSE-APACHE), so users can choose either. The Rigby2D, Hoverlabs and
Rigbytron names, logos and artwork are not part of that grant; see [TRADEMARKS.md](TRADEMARKS.md).

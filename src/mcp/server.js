#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// Rigby2D MCP server: lets AI assistants inspect, validate, sample and convert Rigby2D projects
// over the Model Context Protocol (stdio transport). Usage:
//   node src/mcp/server.js [--root <dir>]...
// Each --root is a folder the tools may read and write (default: the current folder).

import fs from 'node:fs';

import { createServer, serveStdio } from './protocol.js';
import { Workspace, createTools } from './tools.js';

const { version } = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const log = (text) => process.stderr.write(`rigby2d-mcp: ${text}\n`);

const HELP = `Rigby2D MCP server ${version}

Usage: rigby2d-mcp [--root <dir>]...

Serves the Model Context Protocol over stdin/stdout for AI assistants.
  --root <dir>   Folder the tools may access (repeatable; default: current folder).
  --help         Show this help.
  --version      Show the version.

Tools: inspect_project, describe_rig, describe_animation, sample_pose,
validate_project, convert_project.`;

function parseArgs(argv) {
  const roots = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--version' || arg === '-v') return { version: true };
    if (arg === '--root') {
      if (!argv[i + 1]) throw new Error('--root needs a folder');
      roots.push(argv[++i]);
    } else if (arg.startsWith('--root=')) roots.push(arg.slice('--root='.length));
    else throw new Error(`unknown argument '${arg}' (see --help)`);
  }
  return { roots };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    log(e.message);
    process.exit(2);
  }
  if (args.help) return void process.stdout.write(`${HELP}\n`);
  if (args.version) return void process.stdout.write(`${version}\n`);

  let workspace;
  try {
    workspace = await Workspace.open(args.roots);
  } catch (e) {
    log(e.message);
    process.exit(2);
  }
  const server = createServer({
    name: 'rigby2d',
    title: 'Rigby2D',
    version,
    instructions:
      'Tools for Rigby2D 2D skeletal animation projects: .rigby work files and skeleton .json / .skel exports. ' +
      'Start with inspect_project, use describe_rig and describe_animation for structure, sample_pose to evaluate poses with the runtime ' +
      '(world coordinates, Y up, degrees), validate_project to find problems and convert_project to write other formats. ' +
      `Files must be inside the workspace: ${workspace.roots.join(', ')}.`,
    tools: createTools(workspace),
    log,
  });
  log(`ready (workspace: ${workspace.roots.join(', ')})`);
  await serveStdio(server, process.stdin, process.stdout, log);
}

main();

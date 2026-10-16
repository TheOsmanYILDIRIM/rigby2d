// SPDX-License-Identifier: MIT OR Apache-2.0
// MCP server: protocol handling, the project tools (on the bundled Rigbytron project) and the
// stdio transport.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ErrorCode, PROTOCOL_VERSIONS, ToolError, checkArguments, createServer } from '../src/mcp/protocol.js';
import { Workspace, createTools } from '../src/mcp/tools.js';

const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
const RIGBY = 'branding/rigbytron/rigbytron.rigby';
const SKEL = 'branding/rigbytron/export/rigbytron.skel';
const JSON_FILE = 'branding/rigbytron/export/rigbytron.json';

const request = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

function echoServer() {
  return createServer({
    name: 'test',
    version: '1.0.0',
    tools: [
      {
        name: 'echo',
        description: 'Echo',
        inputSchema: { type: 'object', properties: { text: { type: 'string' }, n: { type: 'integer', minimum: 1 } }, required: ['text'], additionalProperties: false },
        handler: async ({ text }) => {
          if (text === 'fail') throw new ToolError('asked to fail');
          if (text === 'crash') throw new Error('boom');
          return { text };
        },
      },
    ],
  });
}

test('mcp protocol: initialize negotiates the protocol version', async () => {
  const server = echoServer();
  const known = await server.handle(request(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } }));
  assert.equal(known.result.protocolVersion, '2025-03-26');
  assert.deepEqual(known.result.capabilities, { tools: { listChanged: false } });
  assert.equal(known.result.serverInfo.name, 'test');
  const unknown = await server.handle(request(2, 'initialize', { protocolVersion: '1999-01-01' }));
  assert.equal(unknown.result.protocolVersion, PROTOCOL_VERSIONS[0]);
});

test('mcp protocol: ping, notifications, unknown methods and malformed messages', async () => {
  const server = echoServer();
  assert.deepEqual((await server.handle(request(1, 'ping'))).result, {});
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await server.handle(request(2, 'resources/list'))).error.code, ErrorCode.METHOD_NOT_FOUND);
  assert.equal((await server.handle({ id: 3, method: 'ping' })).error.code, ErrorCode.INVALID_REQUEST);
  assert.equal((await server.handle(request(4, 'tools/call', {}))).error.code, ErrorCode.INVALID_PARAMS);
});

test('mcp protocol: tool calls report results, tool errors and unknown tools', async () => {
  const server = echoServer();
  const list = await server.handle(request(1, 'tools/list'));
  assert.deepEqual(list.result.tools.map((t) => t.name), ['echo']);
  const ok = await server.handle(request(2, 'tools/call', { name: 'echo', arguments: { text: 'hi' } }));
  assert.equal(ok.result.isError, false);
  assert.deepEqual(ok.result.structuredContent, { text: 'hi' });
  assert.deepEqual(JSON.parse(ok.result.content[0].text), { text: 'hi' });
  const failed = await server.handle(request(3, 'tools/call', { name: 'echo', arguments: { text: 'fail' } }));
  assert.equal(failed.result.isError, true);
  assert.equal(failed.result.content[0].text, 'asked to fail');
  const crashed = await server.handle(request(4, 'tools/call', { name: 'echo', arguments: { text: 'crash' } }));
  assert.equal(crashed.result.isError, true);
  assert.match(crashed.result.content[0].text, /Internal error: boom/);
  const badArgs = await server.handle(request(5, 'tools/call', { name: 'echo', arguments: { text: 1, extra: true } }));
  assert.equal(badArgs.result.isError, true);
  assert.match(badArgs.result.content[0].text, /'text' must be of type string; unknown argument 'extra'/);
  assert.equal((await server.handle(request(6, 'tools/call', { name: 'nope' }))).error.code, ErrorCode.INVALID_PARAMS);
});

test('mcp protocol: argument checks', () => {
  const schema = { type: 'object', properties: { v: { type: 'string', enum: ['a', 'b'] }, t: { type: 'number', minimum: 0 } }, required: ['v'] };
  assert.deepEqual(checkArguments(schema, { v: 'a', t: 1 }), []);
  assert.deepEqual(checkArguments(schema, {}), ["'v' is required"]);
  assert.deepEqual(checkArguments(schema, { v: 'c' }), ["'v' must be one of a, b"]);
  assert.deepEqual(checkArguments(schema, { v: 'a', t: -1 }), ["'t' must be at least 0"]);
  assert.deepEqual(checkArguments(schema, []), ['arguments must be an object']);
});

async function toolbox() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rigby-mcp-'));
  const ws = await Workspace.open([REPO, tmp]);
  const tools = Object.fromEntries(createTools(ws).map((t) => [t.name, t.handler]));
  return { tmp, tools };
}

test('mcp tools: inspect, describe and sample the Rigbytron project', async () => {
  const { tools } = await toolbox();
  const info = await tools.inspect_project({ path: RIGBY });
  assert.equal(info.format, 'rigby');
  assert.deepEqual(info.counts, { bones: 11, slots: 9, skins: 1, constraints: 0, events: 1, animations: 2, images: 10 });
  assert.deepEqual(info.animations.map((a) => [a.name, a.duration]), [['hold', 2.4], ['release', 1.6]]);

  const skel = await tools.inspect_project({ path: SKEL });
  assert.equal(skel.format, 'skel');
  assert.equal(skel.counts.bones, 11);

  const rig = await tools.describe_rig({ path: JSON_FILE });
  assert.equal(rig.bones[0].name, 'root');
  assert.equal(rig.bones.find((b) => b.name === 'hand_r').parent, 'forearm_r');
  assert.deepEqual(rig.slots.find((s) => s.name === 'hand').attachments.map((a) => a.name), ['hand', 'hand_e']);

  const release = await tools.describe_animation({ path: RIGBY, animation: 'release' });
  assert.deepEqual(release.events, [{ time: 0.42, name: 'slash' }]);
  assert.deepEqual(release.slots.find((s) => s.slot === 'hand').attachmentKeys.map((k) => k.name), ['hand', 'hand_e']);

  const setup = await tools.sample_pose({ path: SKEL });
  const outward = await tools.sample_pose({ path: SKEL, animation: 'release', time: 1.2 });
  assert.equal(setup.slots.find((s) => s.name === 'hand').attachment, 'hand');
  assert.equal(outward.slots.find((s) => s.name === 'hand').attachment, 'hand_e');
  assert.deepEqual(outward.eventsUpToTime.map((e) => e.name), ['slash']);
  const handX = (pose) => pose.bones.find((b) => b.name === 'hand_r').x;
  assert.ok(handX(outward) < handX(setup) - 300, 'the hand ends out to the side');
  assert.ok(outward.bounds.maxY > 1200);

  await assert.rejects(tools.describe_animation({ path: RIGBY, animation: 'walk' }), /No animation 'walk'. Animations: hold, release/);
  await assert.rejects(tools.sample_pose({ path: RIGBY, skin: 'gold' }), /No skin 'gold'/);
});

test('mcp tools: validate finds no problems in the shipped files and reports missing images', async () => {
  const { tmp, tools } = await toolbox();
  for (const p of [RIGBY, SKEL, JSON_FILE]) {
    const report = await tools.validate_project({ path: p });
    assert.equal(report.valid, true, p);
    assert.deepEqual(report.warnings, [], p);
    assert.deepEqual(report.checks, { structure: 'ok', images: 'ok', jsonRoundTrip: 'ok', binaryExport: 'ok' }, p);
  }
  // Without its atlas the images cannot be checked; with an atlas missing a region they are missing.
  const lone = path.join(tmp, 'lone.json');
  await fs.copyFile(path.join(REPO, JSON_FILE), lone);
  assert.equal((await tools.validate_project({ path: lone })).checks.images, 'not checked');
  const atlas = await fs.readFile(path.join(REPO, 'branding/rigbytron/export/rigbytron.atlas'), 'utf8');
  await fs.writeFile(path.join(tmp, 'lone.atlas'), atlas.replace(/^hand_e$/m, 'hand_x'));
  const report = await tools.validate_project({ path: lone });
  assert.equal(report.valid, false);
  assert.match(report.errors[0], /1 image\(s\) missing from the atlas lone.atlas: hand_e/);
});

test('mcp tools: convert writes JSON and .skel inside the workspace only', async () => {
  const { tmp, tools } = await toolbox();
  const out = path.join(tmp, 'rigbytron-38.json');
  const res = await tools.convert_project({ input: RIGBY, output: out, version: '3.8' });
  assert.equal(res.version, '3.8');
  const written = JSON.parse(await fs.readFile(out, 'utf8'));
  assert.equal(written.bones.length, 11);
  await assert.rejects(tools.convert_project({ input: RIGBY, output: out }), /already exists/);
  await tools.convert_project({ input: RIGBY, output: out, overwrite: true });

  const skel = path.join(tmp, 'r.skel');
  await tools.convert_project({ input: out, output: skel });
  assert.equal((await tools.inspect_project({ path: skel })).counts.animations, 2);
  await assert.rejects(tools.convert_project({ input: RIGBY, output: path.join(tmp, 'r.skel'), version: '4.2', overwrite: true }), /format 4.3/);
  await assert.rejects(tools.convert_project({ input: RIGBY, output: path.join(tmp, 'r.rigby') }), /must end in .json or .skel/);

  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'rigby-outside-'));
  await fs.copyFile(path.join(REPO, SKEL), path.join(outside, 'x.skel'));
  await assert.rejects(tools.inspect_project({ path: path.join(outside, 'x.skel') }), /outside the workspace/);
  await assert.rejects(tools.convert_project({ input: RIGBY, output: path.join(outside, 'y.json') }), /outside the workspace/);
  await assert.rejects(tools.inspect_project({ path: 'README.md' }), /Unsupported file type '.md'/);
});

test('mcp server: answers over stdio', async () => {
  const child = spawn(process.execPath, [path.join(REPO, 'src/mcp/server.js'), '--root', REPO], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buffer += d;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      lines.push(JSON.parse(buffer.slice(0, nl)));
      buffer = buffer.slice(nl + 1);
    }
  });
  const send = (msg) => child.stdin.write(`${typeof msg === 'string' ? msg : JSON.stringify(msg)}\n`);
  send(request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }));
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send(request(2, 'tools/list'));
  send(request(3, 'tools/call', { name: 'inspect_project', arguments: { path: SKEL } }));
  send('{not json');
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  const byId = new Map(lines.map((m) => [m.id, m]));
  assert.equal(byId.get(1).result.serverInfo.name, 'rigby2d');
  assert.equal(byId.get(2).result.tools.length, 6);
  assert.equal(byId.get(3).result.structuredContent.counts.bones, 11);
  assert.equal(byId.get(null).error.code, ErrorCode.PARSE_ERROR);
  assert.equal(lines.length, 4);
});

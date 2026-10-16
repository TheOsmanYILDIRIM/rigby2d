// SPDX-License-Identifier: MIT OR Apache-2.0
// The lessons, from the very basics. Each step says what to do in plain words, points at the
// control, and notices when it is done. Written for people who have never used an animation tool.

import { FPS } from '../app.js';
import { boneSpot, byText, menuItem, treeRow } from './coach.js';
import { isPractice, openPractice } from './practice.js';

const $ = (s) => document.querySelector(s);
const bone = (app, name) => app.doc.bones.findIndex((b) => b.name === name);
const selectedBone = (app) => (app.sel?.bone !== undefined ? app.doc.bones[app.sel.bone]?.name : null);
const selectedSlot = (app) => (app.sel?.slot !== undefined ? app.doc.slots[app.sel.slot]?.name : null);
const frame = (app) => Math.round(app.time * FPS);
const tool = (name) => () => byText('#viewbar button.tool', name);
const keyAt = (app, boneName, f) => {
  const anim = app.currentAnimation();
  const keys = anim?.boneTimeline(bone(app, boneName))?.rotate ?? [];
  return keys.some((k) => Math.abs(k.time * FPS - f) < 0.5);
};

export const LESSONS = [
  {
    id: 'basics',
    title: '1 · Getting started',
    minutes: 4,
    summary: 'Find your way around: the viewport, the timeline, the tree, the inspector and the two modes.',
    steps: [
      {
        text: '<b>Welcome to Rigby2D!</b> In a few minutes you will know your way around. This lesson uses <b>Rigbytron</b>, the demo character. Nothing you do here can break anything.',
        action: { label: 'Open Rigbytron', run: ({ app }) => app.openDemo(true) },
        done: ({ app }) => app.path === 'rigbytron.rigby',
      },
      {
        text: 'This big area is the <b>viewport</b>, where your character lives. Put the mouse over it and <b>turn the mouse wheel</b> to zoom in and out.',
        target: () => $('#center'),
        enter: ({ app, mark }) => (mark.zoom = app.view.zoom),
        done: ({ app, mark }) => Math.abs(app.view.zoom - mark.zoom) > 0.05,
      },
      {
        text: 'Now <b>drag with the right mouse button</b> (or the middle button) to move the view around. Lost? <i>View ▸ Fit the skeleton in view</i> brings the character back.',
        target: () => $('#center'),
        enter: ({ app, mark }) => (mark.pan = [app.view.panX, app.view.panY]),
        done: ({ app, mark }) => Math.hypot(app.view.panX - mark.pan[0], app.view.panY - mark.pan[1]) > 20,
      },
      {
        text: 'At the bottom is the <b>timeline</b>. Press <b>▶</b> to play or pause the animation. The <kbd>Space</kbd> key does the same.',
        target: () => byText('#controls button', 'Play / pause'),
        enter: ({ app, mark }) => (mark.playing = app.playing),
        done: ({ app, mark }) => app.playing !== mark.playing,
      },
      {
        text: 'A character can have many animations. Rigbytron has two. Pick <b>hold</b> in this list.',
        target: () => $('#controls select'),
        done: ({ app }) => app.currentAnimation()?.name === 'hold',
      },
      {
        text: 'On the right is the <b>tree</b>. It lists the parts of the character: <b>bones</b> 🦴 (the skeleton), <b>slots</b> ▣ (where images are drawn) and <b>images</b> 📎. Click <b>head</b> in the tree.',
        target: () => treeRow('head') ?? $('#tree'),
        done: ({ app }) => selectedBone(app) === 'head',
      },
      {
        text: 'Below it, the <b>inspector</b> shows the details of whatever you selected: here, the head bone\'s name, parent, rotation, position and scale.',
        target: () => $('#properties'),
      },
      {
        text: 'Rigby2D has two <b>modes</b>. <b>Setup</b> is for building the character; <b>Animate</b> is for making it move. Click this button to switch (or press <kbd>Tab</kbd>).',
        target: () => $('#menubar .mode'),
        enter: ({ app, mark }) => (mark.mode = app.mode),
        done: ({ app, mark }) => app.mode !== mark.mode,
      },
      {
        text: 'Two <b>workspaces</b> tailor the editor: <b>Game</b> for exporting to game engines, <b>Film</b> for rendering video. You can switch at any time; your work is never changed by it.',
        target: () => $('.workspaces'),
      },
      {
        text: '<b>That\'s the tour!</b> Next you will rig your first character in five minutes. You can come back to these lessons any time from <i>Help ▸ Tutorials</i>.',
        target: () => menuItem('Help', 'Tutorials'),
      },
    ],
  },

  {
    id: 'autorig',
    title: '2 · Your first character',
    minutes: 5,
    summary: 'Turn a layered drawing into a moving character with AutoRig, then move it.',
    steps: [
      {
        text: 'A character starts as a <b>layered drawing</b>: one layer per body part (head, body, arms, legs). Usually you import your own PSD with <i>File ▸ Import PSD</i>. For practice, load ours.',
        action: { label: 'Load the practice character', run: ({ app }) => openPractice(app) },
        done: ({ app }) => isPractice(app, false),
      },
      {
        text: 'Here are the layers. Each one is a separate image, and nothing is connected yet. If you moved the body, the head would stay behind. <b>Rigging</b> connects them with bones.',
        target: () => $('#tree'),
      },
      {
        text: 'Rigby2D can rig it for you. Open the <b>File</b> menu and choose <b>AutoRig artwork…</b>',
        target: () => menuItem('File', 'AutoRig'),
        done: () => !!$('.modal .autorig-table'),
      },
      {
        text: 'AutoRig read each layer\'s <b>name</b> to find the body part, and its side. If one is wrong, you can change it in the list. These all look right, so click <b>Generate rig</b>.',
        target: () => byText('.modal button', 'Generate rig'),
        done: ({ app }) => app.doc.bones.length > 1,
      },
      {
        text: '<b>Rigged!</b> The tree now has bones: <b>hip</b>, <b>chest</b>, <b>head</b>, arms and legs. The bones named <b>ik_…</b> are handles: move one and the whole arm or leg follows. Click <b>ik_hand_r</b> in the tree.',
        target: () => treeRow('ik_hand_r') ?? $('#tree'),
        done: ({ app }) => selectedBone(app) === 'ik_hand_r',
      },
      {
        text: 'Choose the <b>Translate</b> tool (or press <kbd>G</kbd>). It moves things.',
        target: tool('Translate'),
        done: ({ app }) => app.tool === 'translate',
      },
      {
        text: 'Now <b>drag in an empty part of the viewport</b>. The hand follows the mouse, and the elbow bends by itself. That is <b>IK</b> (inverse kinematics).',
        target: (ctx) => boneSpot(ctx, 'ik_hand_r'),
        enter: ({ app, mark }) => {
          const b = app.doc.bones[bone(app, 'ik_hand_r')];
          mark.at = b ? [b.setup.x, b.setup.y] : null;
        },
        done: ({ app, mark }) => {
          const b = app.doc.bones[bone(app, 'ik_hand_r')];
          return !!(b && mark.at && Math.hypot(b.setup.x - mark.at[0], b.setup.y - mark.at[1]) > 15);
        },
      },
      {
        text: 'Made a mess? <b>Ctrl+Z</b> undoes it, as many times as you like. Try moving <b>ik_foot_l</b> too, to bend a knee.',
        target: (ctx) => boneSpot(ctx, 'ik_foot_l'),
      },
      {
        text: '<b>Your character is rigged.</b> Everything AutoRig made is ordinary rig data that you can edit. In the next lessons you will build bones by hand and then animate.',
      },
    ],
  },

  {
    id: 'bones',
    title: '3 · Bones and images by hand',
    minutes: 6,
    summary: 'Draw bones yourself and attach images to them. This is what AutoRig does for you.',
    steps: [
      {
        text: 'AutoRig is quick, but it helps to know what it does. Let\'s rig by hand. Load the practice character again (loose layers, no bones).',
        action: { label: 'Load the practice character', run: ({ app }) => openPractice(app) },
        done: ({ app }) => isPractice(app, false),
      },
      {
        text: 'Bones are drawn in <b>Setup</b> mode. If the button at the top says ANIMATE, click it to switch to SETUP.',
        target: () => $('#menubar .mode'),
        done: ({ app }) => app.mode === 'setup',
      },
      {
        text: 'Choose the <b>Create</b> tool (or press <kbd>B</kbd>).',
        target: tool('Create'),
        done: ({ app }) => app.tool === 'create',
      },
      {
        text: '<b>Drag in the viewport</b> from the character\'s hips up to the bottom of the neck. That draws the <b>spine</b> bone.',
        target: () => $('#center'),
        enter: ({ app, mark }) => (mark.count = app.doc.bones.length),
        done: ({ app, mark }) => app.doc.bones.length > mark.count,
      },
      {
        text: 'The new bone is selected, so the next one you draw becomes its <b>child</b>. Drag again from the neck up to the top of the head to draw the head bone.',
        target: () => $('#center'),
        enter: ({ app, mark }) => (mark.count = app.doc.bones.length),
        done: ({ app, mark }) => app.doc.bones.length > mark.count,
      },
      {
        text: 'Now attach the images. Click the <b>torso</b> slot ▣ in the tree.',
        target: () => treeRow('torso') ?? $('#tree'),
        done: ({ app }) => selectedSlot(app) === 'torso',
      },
      {
        text: 'In the inspector, open the <b>Bone</b> list and pick the first bone you drew (the spine). The torso image is now attached to it.',
        target: () => $('#properties select'),
        done: ({ app }) => {
          const s = app.doc.slots.find((x) => x.name === 'torso');
          return !!s && s.bone !== 0;
        },
      },
      {
        text: 'Do the same for the head: click the <b>head</b> slot ▣ and set its <b>Bone</b> to the head bone you drew.',
        target: ({ app }) => (selectedSlot(app) === 'head' ? $('#properties select') : treeRow('head') ?? $('#tree')),
        done: ({ app }) => {
          const s = app.doc.slots.find((x) => x.name === 'head');
          return !!s && s.bone !== 0;
        },
      },
      {
        text: 'Test it. Choose <b>Rotate</b> (<kbd>R</kbd>), click your spine bone in the tree, then drag in an empty part of the viewport. The torso and head turn together, because the head bone is a child of the spine.',
        target: tool('Rotate'),
        enter: ({ app, mark }) => (mark.rot = app.doc.bones.map((b) => b.setup.rotation)),
        done: ({ app, mark }) => app.doc.bones.some((b, i) => i > 0 && i < mark.rot.length && Math.abs(b.setup.rotation - mark.rot[i]) > 3),
      },
      {
        text: '<b>That is rigging:</b> bones in a hierarchy, with images attached to them. AutoRig does the same for every part, and adds meshes and IK. Next: making it move.',
      },
    ],
  },

  {
    id: 'animate',
    title: '4 · Your first animation',
    minutes: 6,
    summary: 'Make the character nod: keys, frames, Auto key and playback.',
    steps: [
      {
        text: 'Animation is <b>poses at moments in time</b>; Rigby2D fills in the movement between them. Start with a rigged character.',
        action: { label: 'Load the rigged practice character', run: ({ app }) => openPractice(app, { rigged: true }) },
        // The lesson animates the head, so any rig with a head bone will do (the practice one, Rigbytron).
        done: ({ app }) => bone(app, 'head') > 0,
      },
      {
        text: 'Click <b>＋ New</b> in the timeline to start a new animation. Rigby2D switches to <b>Animate</b> mode for you.',
        target: () => byText('#controls button', '＋ New'),
        enter: ({ app, mark }) => (mark.count = app.doc.animations.length),
        done: ({ app, mark }) => app.doc.animations.length > mark.count && app.mode === 'animate',
      },
      {
        text: 'Turn on <b>Auto key</b>. Then every change you make is saved as a <b>key</b> (a pose at the current frame).',
        target: () => byText('#viewbar button', 'Auto key'),
        done: ({ app }) => app.autoKey,
      },
      {
        text: 'Click <b>head</b> in the tree, then press <b>◆ Key</b> (or <kbd>K</kbd>). That stores the head\'s starting pose at <b>frame 0</b>.',
        target: ({ app }) => (selectedBone(app) === 'head' ? byText('#controls button', 'Key') : treeRow('head') ?? $('#tree')),
        done: ({ app }) => keyAt(app, 'head', 0),
      },
      {
        text: 'Move to around <b>frame 15</b>: click <b>▶|</b> (or press <kbd>→</kbd>) until the timeline shows frame 15, or click in the timeline. Anything from 10 to 20 is fine.',
        target: () => byText('#controls button', 'Next frame'),
        done: ({ app }) => frame(app) >= 10 && frame(app) <= 20,
      },
      {
        text: 'Choose <b>Rotate</b> (<kbd>R</kbd>) and <b>drag in an empty part of the viewport</b> to tilt the head down. With Auto key on, that sets a key here.',
        target: tool('Rotate'),
        enter: ({ app, mark }) => (mark.frame = frame(app)),
        done: ({ app }) => keyAt(app, 'head', frame(app)) && frame(app) > 0,
      },
      {
        text: 'Go to around <b>frame 30</b> and tilt the head back up. Each key you add becomes a diamond ◆ in the timeline.',
        target: () => $('#dopesheet') ?? $('#timeline'),
        done: ({ app }) => frame(app) >= 25 && keyAt(app, 'head', frame(app)),
      },
      {
        text: 'Press <b>▶</b> (or <kbd>Space</kbd>). Rigbytron nods! Rigby2D drew every frame between your keys.',
        target: () => byText('#controls button', 'Play / pause'),
        done: ({ app }) => app.playing,
      },
      {
        text: '<b>You made an animation.</b> Save it with <i>File ▸ Save</i>. From here you can animate the arms with the <b>ik_…</b> handles, make movement smoother with the <b>Graph</b> view, or render a video in the <b>Film</b> workspace.',
      },
    ],
  },
];


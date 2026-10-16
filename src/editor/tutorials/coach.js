// SPDX-License-Identifier: MIT OR Apache-2.0
// The tutorial coach: a small panel that walks through a lesson one step at a time, highlights the
// control to use, and moves on by itself when the step is done (or with Next, for steps that only
// explain). Lessons are plain data (lessons.js); the coach never clicks anything for the user.

import { makeDraggable } from '../logwindow.js';
import { h } from '../widgets.js';

const PROGRESS = 'rigby.tutorials';

/** Finished lesson ids. */
export function finishedLessons() {
  try {
    return new Set(JSON.parse(localStorage.getItem(PROGRESS) ?? '[]'));
  } catch {
    return new Set();
  }
}

function markFinished(id) {
  const done = finishedLessons();
  done.add(id);
  try {
    localStorage.setItem(PROGRESS, JSON.stringify([...done]));
  } catch {
    // progress is a convenience; the lesson still works
  }
}

// ---- finding things on screen -----------------------------------------------------------------

/** The first element matching `selector` whose text or title contains `text` (case-insensitive). */
export function byText(selector, text) {
  const t = text.toLowerCase();
  return [...document.querySelectorAll(selector)].find((el) => el.offsetParent !== null && `${el.textContent} ${el.title ?? ''}`.toLowerCase().includes(t)) ?? null;
}

/** A menu: the item when the menu is open, otherwise its title in the menu bar. */
export function menuItem(menu, item) {
  return byText('.popup .item', item) ?? [...document.querySelectorAll('.menu-title')].find((b) => b.textContent === menu) ?? null;
}

/** A tree row by the name it shows. */
export function treeRow(name) {
  return [...document.querySelectorAll('#tree .row')].find((r) => r.textContent.replace(/[▾▸]/g, '').trim().endsWith(name)) ?? null;
}

/** A screen box around a bone's base in the viewport. */
export function boneSpot(ctx, name) {
  const { app, viewport } = ctx;
  const i = app.doc.bones.findIndex((b) => b.name === name);
  if (i < 0 || !viewport) return null;
  const [x, y] = viewport.toScreen(app.pose().world[i].apply([0, 0]));
  const r = viewport.canvas.getBoundingClientRect();
  return { left: r.left + x - 22, top: r.top + y - 22, width: 44, height: 44, round: true };
}

// ---- coach ------------------------------------------------------------------------------------

/**
 * Runs lessons. A lesson is { id, title, minutes, summary, steps }. A step is:
 * - text: what to do (simple HTML: <b>, <kbd>, <i>);
 * - target(ctx): the element (or screen box) to highlight, or null;
 * - enter(ctx): runs when the step starts (remember starting values in ctx.mark);
 * - done(ctx): true when the user has done it (checked several times a second); without it the
 *   step waits for Next;
 * - action: { label, run(ctx) } for a button in the step (e.g. load the practice character).
 * ctx is { app, viewport, mark }.
 */
export class Coach {
  constructor(app, viewport, { onFinish = () => {} } = {}) {
    this.app = app;
    this.viewport = viewport;
    this.onFinish = onFinish;
    this.lesson = null;
    this.index = 0;
    this.panel = null;
    this.spot = null;
    this.timer = 0;
  }

  get ctx() {
    return { app: this.app, viewport: this.viewport, mark: this.mark };
  }

  start(lesson) {
    this.stop();
    this.lesson = lesson;
    this.index = 0;
    this.spot = h('div', { class: 'coach-spot', hidden: true });
    document.body.append(this.spot);
    this.build();
    this.enter();
    // The highlight follows its target every frame; whether the step is done is checked on a
    // timer, so lessons advance even while the window is in the background.
    const loop = () => {
      if (!this.lesson) return;
      this.place();
      this.timer = requestAnimationFrame(loop);
    };
    this.timer = requestAnimationFrame(loop);
    this.checker = setInterval(() => {
      if (!this.lesson) return;
      this.check();
      // Also here, in case animation frames are paused (a hidden or background window).
      this.place();
    }, 200);
  }

  stop() {
    cancelAnimationFrame(this.timer);
    clearInterval(this.checker);
    this.panel?.remove();
    this.spot?.remove();
    this.panel = this.spot = this.lesson = null;
  }

  get step() {
    return this.lesson.steps[this.index];
  }

  enter() {
    this.mark = {};
    this.completed = false;
    try {
      this.step.enter?.(this.ctx);
    } catch (e) {
      console.warn('tutorial step', e);
    }
    this.render();
  }

  go(delta) {
    const next = this.index + delta;
    if (next < 0) return;
    if (next >= this.lesson.steps.length) return this.finish();
    this.index = next;
    this.enter();
  }

  /** A step that checks for itself moves on a moment after it is done, so the user sees the tick. */
  check() {
    const step = this.step;
    if (!step.done || this.completed) return;
    let ok = false;
    try {
      ok = !!step.done(this.ctx);
    } catch {
      ok = false;
    }
    if (!ok) return;
    this.completed = true;
    this.render();
    const at = this.index;
    setTimeout(() => this.lesson && this.index === at && this.go(1), 700);
  }

  finish() {
    const lesson = this.lesson;
    markFinished(lesson.id);
    this.stop();
    this.onFinish(lesson);
  }

  place() {
    let target = null;
    try {
      target = this.step.target?.(this.ctx) ?? null;
    } catch {
      target = null;
    }
    const box = target instanceof Element ? target.getBoundingClientRect() : target;
    if (!box || (box.width === 0 && box.height === 0)) {
      this.spot.hidden = true;
      return;
    }
    const pad = 4;
    Object.assign(this.spot.style, {
      left: `${box.left - pad}px`,
      top: `${box.top - pad}px`,
      width: `${box.width + pad * 2}px`,
      height: `${box.height + pad * 2}px`,
      borderRadius: box.round ? '50%' : '8px',
    });
    this.spot.hidden = false;
    this.dodge(box);
  }

  /** Keeps the panel off the control it points at: it moves to the other end of the viewport. */
  dodge(box) {
    if (this.moved || !this.panel) return;
    const r = this.panel.getBoundingClientRect();
    const overlaps = box.left < r.right && box.left + box.width > r.left && box.top < r.bottom && box.top + box.height > r.top;
    if (!overlaps) return;
    this.atTop = !this.atTop;
    this.panel.classList.toggle('at-top', this.atTop);
  }

  build() {
    const close = h('button', { title: 'Close the lesson (your work stays)', onclick: () => this.stop() }, '✕');
    this.header = h('div', { class: 'float-header' }, h('b', { class: 'coach-title' }), h('span', { class: 'float-spacer' }), close);
    this.body = h('div', { class: 'coach-body' });
    this.panel = h('div', { class: 'float-window coach' }, this.header, this.body);
    makeDraggable(this.panel, this.header);
    // Once the user places the panel, it stays where they put it.
    this.moved = false;
    this.atTop = false;
    this.header.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('button')) this.moved = true;
    });
    document.body.append(this.panel);
  }

  render() {
    const { lesson, index } = this;
    const step = this.step;
    const total = lesson.steps.length;
    this.header.querySelector('.coach-title').textContent = lesson.title;
    const text = h('div', { class: 'coach-text' });
    text.innerHTML = step.text;
    const waiting = step.done && !this.completed;
    const parts = [
      h('div', { class: 'coach-progress' }, h('div', { class: 'bar', style: { width: `${((index + (this.completed ? 1 : 0)) / total) * 100}%` } })),
      h('div', { class: 'coach-count weak small' }, `Step ${index + 1} of ${total}`),
      text,
      step.action
        ? h(
            'button',
            {
              class: 'primary coach-action',
              onclick: async (e) => {
                e.currentTarget.disabled = true;
                try {
                  await step.action.run(this.ctx);
                } finally {
                  if (e.currentTarget) e.currentTarget.disabled = false;
                }
              },
            },
            step.action.label,
          )
        : null,
      this.completed ? h('div', { class: 'coach-done' }, '✓ Done') : waiting ? h('div', { class: 'coach-wait weak small' }, 'Waiting for you to do this…') : null,
      h(
        'div',
        { class: 'coach-buttons' },
        h('button', { disabled: index === 0, onclick: () => this.go(-1) }, 'Back'),
        h('span', { class: 'float-spacer' }),
        waiting ? h('button', { class: 'weak', title: 'Go on without doing this step', onclick: () => this.go(1) }, 'Skip') : null,
        !step.done || this.completed ? h('button', { class: 'primary', onclick: () => this.go(1) }, index === total - 1 ? 'Finish' : 'Next') : null,
      ),
    ];
    this.body.replaceChildren(...parts.filter(Boolean));
  }
}

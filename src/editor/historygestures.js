// SPDX-License-Identifier: MIT OR Apache-2.0
// Preserve one history state per completed pointer edit even when RAF is throttled.
// Capture schedules *after* the target's pointerup/click edits have run.
export function installGestureHistoryCommits(app, target = window) {
  let active = true;
  const commit = () => {
    queueMicrotask(() => {
      if (active) app.commitHistory(false);
    });
  };
  target.addEventListener('pointerup', commit, true);
  target.addEventListener('pointercancel', commit, true);
  // Click-only UI mutations (such as draw-order arrows) occur after pointerup.
  target.addEventListener('click', commit, true);
  return () => {
    active = false;
    target.removeEventListener('pointerup', commit, true);
    target.removeEventListener('pointercancel', commit, true);
    target.removeEventListener('click', commit, true);
  };
}

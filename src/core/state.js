// SPDX-License-Identifier: MIT
// Playback: advances time and crossfades between animations.

/** Plays animations on a skeleton, with optional crossfading when switching. */
export class AnimationState {
  constructor() {
    this.current = null;
    this.previous = null;
    this.mixTime = 0;
    this.mixDuration = 0;
    /** Playback speed multiplier. */
    this.speed = 1;
  }

  /**
   * Starts playing the named animation, crossfading from the current one over `mix` seconds.
   * Returns false if no animation has that name.
   */
  play(sk, name, looping, mix) {
    const animation = sk.animations.findIndex((a) => a.name === name);
    if (animation < 0) return false;
    this.previous = mix > 0 ? this.current : null;
    this.current = { animation, time: 0, looping };
    this.mixTime = 0;
    this.mixDuration = mix;
    return true;
  }

  stop() {
    this.current = null;
    this.previous = null;
  }

  currentTime() {
    return this.current ? this.current.time : null;
  }

  /** Advances time by `dt` seconds. */
  update(dt) {
    dt *= this.speed;
    if (this.current) this.current.time += dt;
    if (this.previous) this.previous.time += dt;
    this.mixTime += dt;
    if (this.mixTime >= this.mixDuration) this.previous = null;
  }

  /** Resets `pose` to setup, applies the active animations and updates world transforms. */
  apply(sk, pose) {
    pose.reset(sk);
    if (this.previous) applyTrack(sk, pose, this.previous, 1);
    if (this.current) {
      const alpha =
        this.previous && this.mixDuration > 0 ? Math.min(1, Math.max(0, this.mixTime / this.mixDuration)) : 1;
      applyTrack(sk, pose, this.current, alpha);
    }
    pose.updateWorld(sk);
  }
}

export function remEuclid(a, b) {
  return ((a % b) + b) % b;
}

function applyTrack(sk, pose, track, alpha) {
  const anim = sk.animations[track.animation];
  if (!anim) return;
  const time = track.looping && anim.duration > 0 ? remEuclid(track.time, anim.duration) : Math.min(track.time, anim.duration);
  pose.apply(sk, anim, time, alpha);
}

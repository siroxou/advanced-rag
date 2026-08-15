/**
 * Checks for the two pieces of gesture maths that are wrong in ways you cannot
 * see in a screenshot: momentum projection, and a spring that has to settle
 * exactly on its target.
 *
 *   node --experimental-strip-types --test src/lib/motion.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

import { project, rubberband, springTo } from "./motion.ts";

// The spring is driven by the display clock in the browser; here a timer stands
// in for it so the maths can be checked without one.
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  Number(setTimeout(() => cb(performance.now()), 16))) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;

test("projection scales with velocity and keeps its sign", () => {
  assert.equal(project(0), 0);
  assert.ok(project(-1000) < 0, "a leftward throw projects leftward");
  assert.ok(project(2000) > project(1000), "faster throws travel further");
});

test("velocity decides the snap, not the release position", () => {
  // The whole point of projecting: the same 40px of travel commits when it is
  // thrown and settles back when it is eased out. Position alone cannot tell
  // those two gestures apart.
  const halfway = -128;
  assert.ok(-40 + project(-1200) < halfway, "a flick commits");
  assert.ok(-40 + project(-60) > halfway, "the same distance, eased out, returns");
});

test("rubberband resists progressively and never runs away", () => {
  const a = rubberband(50, 256);
  const b = rubberband(200, 256);
  assert.ok(a < 50 && b < 200, "the surface moves less than the finger");
  assert.ok(b > a, "further out still moves further");
  assert.ok(b < 256, "resistance keeps it bounded");
});

test("the spring lands exactly on the target, from either side", async () => {
  for (const [from, to] of [
    [-256, 0],
    [0, -256],
  ]) {
    const frames: number[] = [];
    await new Promise<void>((resolve) => {
      springTo(from, to, (v) => frames.push(v), { response: 0.3, onDone: resolve });
    });
    assert.equal(frames.at(-1), to, "settles on the target, not near it");
    assert.ok(frames.length > 1, "it animates rather than jumping");
    // Critically damped: never crosses the target and comes back.
    const overshot = frames.some((v) => (to > from ? v > to : v < to));
    assert.equal(overshot, false, "no overshoot on a critically damped spring");
  }
});

test("velocity carries into the animation", async () => {
  const withThrow: number[] = [];
  await new Promise<void>((resolve) => {
    springTo(-40, 0, (v) => withThrow.push(v), {
      response: 0.3,
      velocity: 600,
      onDone: resolve,
    });
  });
  const still: number[] = [];
  await new Promise<void>((resolve) => {
    springTo(-40, 0, (v) => still.push(v), { response: 0.3, onDone: resolve });
  });
  assert.ok(
    withThrow[0] > still[0],
    "the first frame after a throw is already further along than one from rest"
  );
});

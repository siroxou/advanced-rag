/**
 * Spring settling and momentum projection for gesture-driven motion.
 *
 * A CSS transition cannot do this job: it runs for a fixed duration from a fixed
 * start, so grabbing a drawer mid-flight makes it jump back to where the
 * transition thinks it is. These helpers animate from whatever value is on
 * screen right now, carrying the velocity the finger had at release, so a drag
 * and the animation that follows it are one continuous motion.
 */

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Where a flick would come to rest, using the exponential decay real scroll
 * views use. Snap decisions read this, not the release position, which is what
 * makes a fast short flick commit and a slow long drag settle back.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past an edge, instead of a dead stop. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

type SpringOptions = {
  /** Seconds to approach the target. Lower is snappier. */
  response?: number;
  /** Velocity in units/second at the moment the gesture ended. */
  velocity?: number;
  onDone?: () => void;
};

/**
 * Critically damped spring (no overshoot), solved analytically per frame.
 *
 * Returns a cancel function. Cancelling mid-flight leaves the value wherever it
 * is, which is what an interrupting gesture needs: it reads that value and
 * carries on from there.
 */
export function springTo(
  from: number,
  to: number,
  onFrame: (value: number) => void,
  { response = 0.35, velocity = 0, onDone }: SpringOptions = {}
): () => void {
  // Nothing can be shown moving in a hidden tab - the frame loop is throttled to
  // a standstill there - so settle at the target rather than leaving the element
  // stranded wherever the gesture left it.
  const hidden = typeof document !== "undefined" && document.hidden;
  if (prefersReducedMotion() || response <= 0 || hidden) {
    onFrame(to);
    onDone?.();
    return () => {};
  }

  const omega = (2 * Math.PI) / response;
  const delta = from - to;
  const c = velocity + omega * delta;
  const start = performance.now();
  let frame = 0;

  const tick = (now: number) => {
    const t = (now - start) / 1000;
    const decay = Math.exp(-omega * t);
    const value = to + (delta + c * t) * decay;
    const settled = Math.abs(value - to) < 0.5 && Math.abs(c * decay) < 10;

    if (settled) {
      onFrame(to);
      onDone?.();
      return;
    }
    onFrame(value);
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  // Every caller stores this and calls it on unmount, so the loop can never
  // outlive the element it is moving.
  return () => cancelAnimationFrame(frame);
}

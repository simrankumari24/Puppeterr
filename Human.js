"use strict";
/**
 * Human.js — humanization primitives for Puppeterr's OWN actions.
 *
 * Scope, explicitly: this module shapes HOW Puppeterr executes its real,
 * legitimate actions (mouse movement curves, timing jitter) — it does NOT
 * generate fake browsing history, fabricate cookies, or attempt to borrow
 * trust signals from unrelated activity. Every delay/path produced here is
 * applied to an action Puppeterr is actually taking for a real task.
 *
 * Two concrete gaps this fills versus the existing inline code in agent.js:
 *   1. Mouse movement was linear interpolation + noise (constant velocity).
 *      Real human movement accelerates then decelerates — ease-in-out.
 *   2. Action delays were mostly fixed config constants. Real human timing
 *      is right-skewed (usually fast, occasionally much slower) — better
 *      modeled with a log-normal-ish distribution than a flat random range.
 */

// ---------------------------------------------------------------------
// Motion curve
// ---------------------------------------------------------------------

// Ease-in-out cubic: slow start, fast middle, slow finish — matches how a
// real hand accelerates a mouse then decelerates into the target, unlike
// constant-velocity linear interpolation.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Generate a humanlike path of {x,y} points from (x0,y0) to (x1,y1).
 * - eased progress (accelerate/decelerate) instead of constant velocity
 * - a single mild curve offset (real pointer paths aren't perfectly
 *   straight lines — they bow slightly), not per-step random jitter alone
 * - point count scales with distance, like a real movement would take
 *   proportionally more, not a fixed step count regardless of distance
 *
 * Returns an array of {x, y, delayMs} — delayMs is the recommended wait
 * before executing page.mouse.move to this point (mimics natural pacing,
 * not fixed per-step intervals).
 */
function generateMovementPath(x0, y0, x1, y1) {
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(8, Math.min(40, Math.round(distance / 12)));

  // Single perpendicular bow, magnitude scaled to distance and randomized
  // in direction/size — approximates natural path curvature without
  // needing a full bezier control-point system.
  const bowMagnitude = Math.min(40, distance * 0.08) * (Math.random() < 0.5 ? -1 : 1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const perpX = -dy / len;
  const perpY = dx / len;

  const points = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = easeInOutCubic(t);
    // bow peaks mid-path, tapers to zero at both ends
    const bow = Math.sin(t * Math.PI) * bowMagnitude;
    const x = x0 + dx * eased + perpX * bow + (Math.random() * 2 - 1);
    const y = y0 + dy * eased + perpY * bow + (Math.random() * 2 - 1);
    // Velocity-proportional pacing: slower near start/end (matches the
    // ease curve's own slope), faster mid-path.
    const speedFactor = 1 - Math.abs(0.5 - t) * 1.2; // ~0.4x at ends, 1x mid
    const delayMs = Math.max(3, Math.round((7 + Math.random() * 10) / Math.max(0.35, speedFactor)));
    points.push({ x, y, delayMs });
  }
  return points;
}

// ---------------------------------------------------------------------
// Timing distribution
// ---------------------------------------------------------------------

// Box-Muller transform for a standard normal sample.
function sampleGaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Sample a humanlike delay around baseMs: log-normal-ish (right-skewed —
 * usually close to baseMs, occasionally noticeably slower, rarely much
 * faster than a hard floor). Closer to how real reaction/dwell times
 * distribute than a flat uniform random range.
 *
 * @param {number} baseMs - target median-ish delay
 * @param {number} varianceFactor - 0..1, how much spread (default moderate)
 * @param {number} minMs - hard floor so it never goes unrealistically low
 */
function sampleHumanDelay(baseMs, varianceFactor = 0.35, minMs = 0) {
  const base = Math.max(0, Number(baseMs) || 0);
  if (!base) return Math.max(0, minMs);
  const z = sampleGaussian();
  // exp(z * sigma) skews right; clamp sigma so outliers stay reasonable
  const sigma = Math.max(0.05, Math.min(0.6, varianceFactor));
  const multiplier = Math.exp(z * sigma * 0.5);
  const value = base * multiplier;
  return Math.round(Math.max(minMs, Math.min(base * 3, value)));
}

/**
 * Occasionally insert a short "reading pause" between actions — humans
 * don't act at perfectly uniform cadence; every so often there's a longer
 * gap (reading content, deciding what to do next).
 * Returns 0 most of the time, a real pause occasionally.
 */
function maybeReadingPause(chance = 0.12, minMs = 400, maxMs = 1800) {
  if (Math.random() > chance) return 0;
  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

/**
 * Like generateMovementPath, but adds a real human quirk: slight overshoot
 * past the target followed by a small corrective move back. Most human
 * pointer movement toward a small target doesn't land perfectly on the
 * first pass — it overshoots by a few px and corrects, especially at
 * higher approach speed. This appends 2-4 short correction points after
 * the main path lands near (but slightly past) the true target.
 */
function generateMovementPathWithOvershoot(x0, y0, x1, y1) {
  const distance = Math.hypot(x1 - x0, y1 - y0);
  // Overshoot scales with distance but stays small — a fast long move
  // overshoots more than a short careful one, capped so it never looks silly.
  const overshootChance = distance > 60 ? 0.55 : 0.2; // short moves rarely overshoot
  if (Math.random() > overshootChance) {
    return generateMovementPath(x0, y0, x1, y1); // no overshoot this time — also human
  }

  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const overshootDist = Math.min(14, 3 + distance * 0.04);
  const ox = x1 + (dx / len) * overshootDist + (Math.random() * 4 - 2);
  const oy = y1 + (dy / len) * overshootDist + (Math.random() * 4 - 2);

  const mainPath = generateMovementPath(x0, y0, ox, oy);

  // Corrective micro-path back to the true target — quick, small, slightly
  // under/over-corrected like a real fine-motor adjustment.
  const correctionSteps = 2 + Math.floor(Math.random() * 3); // 2-4 points
  const correction = [];
  let cx = ox, cy = oy;
  for (let i = 1; i <= correctionSteps; i++) {
    const t = i / correctionSteps;
    const eased = easeInOutCubic(t);
    const wobble = i === correctionSteps ? 0 : (Math.random() * 3 - 1.5); // final point lands exactly
    correction.push({
      x: ox + (x1 - ox) * eased + wobble,
      y: oy + (y1 - oy) * eased + wobble,
      delayMs: Math.max(4, Math.round(15 + Math.random() * 25)) // corrections are quick, deliberate
    });
    cx = correction[correction.length - 1].x;
    cy = correction[correction.length - 1].y;
  }
  // Force exact landing on the true target so callers can rely on it.
  correction[correction.length - 1].x = x1;
  correction[correction.length - 1].y = y1;

  return mainPath.concat(correction);
}

/**
 * Small continuous jitter to apply while "at rest" hovering/dwelling on a
 * point (e.g. before a click fires, or during a reading pause) — real
 * hands aren't perfectly still. Returns a tiny {dx, dy} offset, typically
 * sub-pixel to a few px.
 */
function microTremor(magnitudePx = 1.2) {
  return {
    dx: (Math.random() * 2 - 1) * magnitudePx,
    dy: (Math.random() * 2 - 1) * magnitudePx
  };
}

// ---------------------------------------------------------------------
// Hover hesitation
// ---------------------------------------------------------------------

/** Pause before a click actually fires, once the pointer has arrived. */
function hoverHesitationMs() {
  return Math.round(80 + Math.random() * 120); // 80-200ms
}

// ---------------------------------------------------------------------
// Search-pattern movement (small wander before locking onto target)
// ---------------------------------------------------------------------

/**
 * A few small, decreasing-radius wander points around a target before the
 * final precise move — like a human's eye/hand doing a last-moment search
 * near roughly the right spot before committing, rather than beelining
 * with mathematical precision every time.
 */
function generateSearchWander(targetX, targetY, count = 2) {
  const points = [];
  let radius = 18;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    points.push({
      x: targetX + Math.cos(angle) * radius * Math.random(),
      y: targetY + Math.sin(angle) * radius * Math.random(),
      delayMs: Math.round(20 + Math.random() * 40)
    });
    radius *= 0.5; // each wander point tightens in on the target
  }
  return points;
}

// ---------------------------------------------------------------------
// Scroll physics
// ---------------------------------------------------------------------

/**
 * Break a total scroll distance into a realistic delta sequence:
 * accelerate -> steady -> decelerate -> slight overshoot -> small
 * corrective scroll back. Returns an array of {deltaY, delayMs} chunks
 * (deltaX mirrors proportionally if provided) instead of one flat wheel
 * event, which is how real trackpad/wheel scrolling actually arrives.
 */
function generateScrollPhysics(totalDeltaY, totalDeltaX = 0) {
  const distance = Math.abs(totalDeltaY);
  if (distance < 40) {
    // Tiny scrolls don't have room for a full accel/decel curve.
    return [{ deltaY: totalDeltaY, deltaX: totalDeltaX, delayMs: 30 + Math.random() * 40 }];
  }
  const sign = totalDeltaY < 0 ? -1 : 1;
  const xSign = totalDeltaX < 0 ? -1 : 1;
  const xRatio = totalDeltaX ? Math.abs(totalDeltaX) / distance : 0;

  const chunkCount = Math.max(5, Math.min(14, Math.round(distance / 90)));
  const chunks = [];
  let remaining = distance;
  for (let i = 0; i < chunkCount; i++) {
    const t = i / (chunkCount - 1);
    // triangular-ish speed profile: ramps up to mid, ramps down after
    const speedProfile = t < 0.5 ? (t / 0.5) : (1 - (t - 0.5) / 0.5);
    const weight = Math.max(0.15, speedProfile);
    let chunk = Math.round((distance / chunkCount) * (0.6 + weight));
    chunk = Math.min(chunk, remaining);
    remaining -= chunk;
    chunks.push({
      deltaY: chunk * sign,
      deltaX: Math.round(chunk * xRatio) * xSign,
      delayMs: Math.round(16 + (1 - weight) * 30 + Math.random() * 15)
    });
  }
  if (remaining > 0) chunks.push({ deltaY: remaining * sign, deltaX: 0, delayMs: 20 });

  // Overshoot + corrective scroll-back — real scrolling often goes slightly
  // too far then nudges back, especially with momentum/trackpad scrolling.
  if (Math.random() < 0.4) {
    const overshoot = Math.round(15 + Math.random() * 35);
    chunks.push({ deltaY: overshoot * sign, deltaX: 0, delayMs: 40 + Math.random() * 30 });
    chunks.push({ deltaY: -overshoot * sign, deltaX: 0, delayMs: 60 + Math.random() * 60 });
  }
  return chunks;
}

// ---------------------------------------------------------------------
// Typing entropy
// ---------------------------------------------------------------------

/**
 * Build a per-character typing plan for a string: variable inter-key
 * delay (faster for common short words / digraphs, slower for punctuation
 * and after spaces), occasional short thinking-pauses mid-word, and
 * occasional backspace-and-retype "typos" for realism. Returns an array
 * of steps: {char, delayBeforeMs} or {backspace: true, count, delayBeforeMs}
 * or {retype: "chars", delayBeforeMs}.
 *
 * Only meaningful for real per-keystroke simulation (Playwright's `type`
 * action) — Playwright's `fill` sets the DOM value directly and never
 * dispatches individual key events, so this plan can't apply there.
 */
function generateTypingPlan(text, options = {}) {
  const str = String(text || "");
  const typoChance = options.typoChance ?? 0.03;
  const wordPauseChance = options.wordPauseChance ?? 0.15;
  const baseWpm = 38 + Math.random() * 34; // ~38-72 WPM, varies per "session"
  const msPerChar = 60000 / (baseWpm * 5); // ~5 chars/word convention

  const steps = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    let delay = sampleHumanDelay(msPerChar, 0.45, 12);
    if (ch === " ") delay += 20 + Math.random() * 40; // slight pause around word boundaries
    if (/[.,!?;:]/.test(ch)) delay += 60 + Math.random() * 90; // punctuation makes people pause

    if (ch === " " && Math.random() < wordPauseChance) {
      delay += Math.round(150 + Math.random() * 350); // occasional "what's next" pause
    }

    // Occasional typo: type a wrong nearby-ish char, notice, backspace, retype correct.
    if (/[a-z0-9]/i.test(ch) && Math.random() < typoChance) {
      const wrongChar = String.fromCharCode(ch.charCodeAt(0) + (Math.random() < 0.5 ? 1 : -1));
      steps.push({ char: wrongChar, delayBeforeMs: delay });
      steps.push({ backspace: true, count: 1, delayBeforeMs: Math.round(180 + Math.random() * 220) });
      steps.push({ char: ch, delayBeforeMs: Math.round(90 + Math.random() * 120) });
      continue;
    }

    steps.push({ char: ch, delayBeforeMs: delay });
  }
  return steps;
}

// ---------------------------------------------------------------------
// Decision pauses
// ---------------------------------------------------------------------

/**
 * Longer pause appropriate after navigation lands or after "reading" a
 * page, before the next action — humans don't act instantly on page load.
 * kind: "postNavigation" (skim time) | "postRead" (deciding what's next).
 */
function decisionPauseMs(kind = "postNavigation") {
  if (kind === "postRead") {
    return Math.round(500 + Math.random() * 1400);
  }
  return Math.round(350 + Math.random() * 900); // postNavigation
}

module.exports = {
  easeInOutCubic,
  generateMovementPath,
  generateMovementPathWithOvershoot,
  microTremor,
  sampleGaussian,
  sampleHumanDelay,
  maybeReadingPause,
  hoverHesitationMs,
  generateSearchWander,
  generateScrollPhysics,
  generateTypingPlan,
  decisionPauseMs
};
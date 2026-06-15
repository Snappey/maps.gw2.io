// Throwing validation gates, run before any committed file is overwritten (see
// writeJsonAtomic in io.mjs), so a collapsed/empty/malformed upstream response
// fails the run instead of silently committing garbage.

export function assertNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}: expected a non-empty array, got ${describe(value)}`);
  }
}

export function assertMinCount(arr, min, label) {
  assertNonEmptyArray(arr, label);
  if (arr.length < min) {
    throw new Error(`${label}: only ${arr.length} items, expected at least ${min}`);
  }
}

// Fail if the new array collapsed: below ratio*previous, or below minAbsolute
// when there is no usable previous file (first run / previously empty).
export function assertNotShrunk(newArr, oldArr, {ratio = 0.9, minAbsolute = 1, label = "data"} = {}) {
  assertNonEmptyArray(newArr, label);
  const previous = Array.isArray(oldArr) ? oldArr.length : 0;
  const floor = previous > 0 ? Math.floor(previous * ratio) : minAbsolute;
  if (newArr.length < floor) {
    const basis = previous > 0
      ? `${Math.round(ratio * 100)}% of previous ${previous}`
      : `minimum ${minAbsolute}`;
    throw new Error(
      `${label}: ${newArr.length} items is below the floor of ${floor} (${basis}) — refusing to overwrite`,
    );
  }
}

// event_timers.json is keyed-by-event ({version, events:{...}}) rather than an
// array, so the shrink gate counts total displayable phases across all events.
export function assertEventTimers(data, prev, {ratio = 0.85, minAbsolute = 30, label = "event_timers"} = {}) {
  const count = countPhases(data);
  if (count === 0) {
    throw new Error(`${label}: produced no events/phases — refusing to overwrite`);
  }
  const previous = countPhases(prev);
  const floor = previous > 0 ? Math.floor(previous * ratio) : minAbsolute;
  if (count < floor) {
    const basis = previous > 0
      ? `${Math.round(ratio * 100)}% of previous ${previous}`
      : `minimum ${minAbsolute}`;
    throw new Error(
      `${label}: ${count} phases is below the floor of ${floor} (${basis}) — refusing to overwrite`,
    );
  }
}

function countPhases(data) {
  if (!data || typeof data !== "object" || !data.events) return 0;
  return Object.values(data.events)
    .reduce((n, ev) => n + (Array.isArray(ev?.phases) ? ev.phases.length : 0), 0);
}

export function assertShape(arr, requiredKeys, label) {
  assertNonEmptyArray(arr, label);
  arr.forEach((item, i) => {
    for (const key of requiredKeys) {
      if (item == null || !(key in item)) {
        throw new Error(`${label}[${i}]: missing required key "${key}"`);
      }
    }
  });
}

function describe(value) {
  if (Array.isArray(value)) return `array(${value.length})`;
  return value === null ? "null" : typeof value;
}

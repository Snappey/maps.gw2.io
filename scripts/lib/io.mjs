// Deterministic, atomic file I/O for the seeding scripts. Stable serialization
// makes a no-op regeneration produce an empty git diff; atomic writes mean a
// failed run (or a validation gate that throws) never clobbers committed data.

import fs from "node:fs";
import path from "node:path";

// Object keys sorted recursively, arrays left in place (row order is meaningful
// data), 2-space indent, trailing newline.
export function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2) + "\n";
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys(value[key]);
    }
    return out;
  }
  return value;
}

// Run the optional validate() gate first, then write deterministically and
// atomically. If validate throws, the committed file is left untouched.
export function writeJsonAtomic(file, data, {validate} = {}) {
  if (validate) validate(data);
  writeFileAtomic(file, Buffer.from(stableStringify(data)));
}

// Write via a sibling temp file + fsync + rename, which is atomic on the same
// filesystem so a crash mid-write can't leave a truncated target.
export function writeFileAtomic(file, buffer) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, buffer);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// Load a committed JSON file for shrink/regression comparison; null if absent.
export function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

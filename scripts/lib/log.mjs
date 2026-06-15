// Minimal timestamped, level-prefixed logger shared by the seeding scripts.
// Writes to stderr so stdout stays clean for any future piping/CI capture.

function emit(level, args) {
  const line = args
    .map((v) => {
      if (typeof v === "string") return v;
      if (v instanceof Error) return v.stack ?? v.message;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    })
    .join(" ");
  process.stderr.write(`${new Date().toISOString()} [${level}] ${line}\n`);
}

export const log = {
  info: (...args) => emit("INFO", args),
  warn: (...args) => emit("WARN", args),
  error: (...args) => emit("ERROR", args),
};

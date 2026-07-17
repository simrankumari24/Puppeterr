function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createProgressBar({ total, label = "Progress", width = 32 } = {}) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeWidth = Math.max(10, Number(width) || 32);
  const isTTY = !!process.stdout.isTTY;
  let current = 0;
  let lastLineLength = 0;
  let ended = false;

  function line(detail = "") {
    const pct = clamp(Math.round((current / safeTotal) * 100), 0, 100);
    const filled = clamp(Math.round((current / safeTotal) * safeWidth), 0, safeWidth);
    const bar = `${"#".repeat(filled)}${"-".repeat(safeWidth - filled)}`;
    const suffix = detail ? ` - ${detail}` : "";
    return `[${bar}] ${String(pct).padStart(3, " ")}% (${current}/${safeTotal}) ${label}${suffix}`;
  }

  function render(detail = "") {
    const text = line(detail);
    if (isTTY) {
      const padLen = Math.max(0, lastLineLength - text.length);
      process.stdout.write(`\r${text}${" ".repeat(padLen)}`);
      lastLineLength = text.length;
      if (current >= safeTotal && !ended) {
        ended = true;
        process.stdout.write("\n");
      }
      return;
    }

    // Non-interactive shells still get periodic progress snapshots.
    if (current === 0 || current === safeTotal || current % Math.max(1, Math.floor(safeTotal / 5)) === 0) {
      console.log(text);
    }
  }

  function set(value, detail = "") {
    current = clamp(Math.round(Number(value) || 0), 0, safeTotal);
    render(detail);
  }

  function tick(detail = "") {
    set(current + 1, detail);
  }

  function complete(detail = "done") {
    set(safeTotal, detail);
  }

  render("starting");

  return {
    tick,
    set,
    complete,
    get value() {
      return current;
    },
    get total() {
      return safeTotal;
    }
  };
}

module.exports = {
  createProgressBar
};

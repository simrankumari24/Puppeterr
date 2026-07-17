async function mapWithConcurrency(items, worker, maxConcurrency = 2) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  if (total === 0) return [];

  const concurrency = Math.max(1, Math.min(Number(maxConcurrency) || 1, total));
  const results = new Array(total);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) return;
      results[index] = await worker(list[index], index);
    }
  }

  const runners = [];
  for (let i = 0; i < concurrency; i++) {
    runners.push(runWorker());
  }

  await Promise.all(runners);
  return results;
}

module.exports = {
  mapWithConcurrency
};

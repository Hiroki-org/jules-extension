/**
 * Process an array of items with a concurrency limit.
 *
 * @param items The array of items to process.
 * @param limit The maximum number of concurrent executions.
 * @param iterator The async function to execute for each item.
 * @returns A promise that resolves to an array of results in the same order as items.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  iterator: (item: T) => Promise<R>
): Promise<R[]> {
  if (limit < 1) {
    throw new Error('Limit must be at least 1');
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const executing: Promise<void>[] = [];

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await iterator(items[index]);
    }
  };

  const workerCount = Math.min(items.length, limit);
  for (let i = 0; i < workerCount; i += 1) {
    executing.push(worker());
  }

  const settlements = await Promise.allSettled(executing);

  const firstRejection = settlements.find(s => s.status === 'rejected');
  if (firstRejection && firstRejection.status === 'rejected') {
    throw firstRejection.reason;
  }

  return results;
}

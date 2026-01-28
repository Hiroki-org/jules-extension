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
  const entries = items.entries();
  const executing: Promise<void>[] = [];

  const worker = async () => {
    for (const [index, item] of entries) {
      results[index] = await iterator(item);
    }
  };

  for (let i = 0; i < Math.min(items.length, limit); i++) {
    executing.push(worker());
  }

  await Promise.all(executing);
  return results;
}

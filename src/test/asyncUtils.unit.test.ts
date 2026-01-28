import * as assert from 'assert';
import { mapLimit } from '../asyncUtils';

suite('AsyncUtils Test Suite', () => {
  test('mapLimit processes all items and maintains order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapLimit(items, 2, async (item) => {
      return item * 2;
    });
    assert.deepStrictEqual(results, [2, 4, 6, 8, 10]);
  });

  test('mapLimit respects concurrency limit', async () => {
    const items = [1, 2, 3, 4, 5];
    let activeCount = 0;
    let maxActiveCount = 0;

    await mapLimit(items, 2, async (item) => {
      activeCount++;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 10));
      activeCount--;
      return item;
    });

    assert.strictEqual(maxActiveCount, 2, `Max active count ${maxActiveCount} should be exactly 2`);
    assert.strictEqual(activeCount, 0, 'All tasks should finish');
  });

  test('mapLimit propagates errors', async () => {
    const items = [1, 2, 3];
    try {
      await mapLimit(items, 2, async (item) => {
        if (item === 2) {
          throw new Error('Test Error');
        }
        return item;
      });
      assert.fail('Should have thrown an error');
    } catch (error: any) {
      assert.strictEqual(error.message, 'Test Error');
    }
  });

  test('mapLimit handles empty array', async () => {
    const results = await mapLimit([], 2, async (item) => item);
    assert.deepStrictEqual(results, []);
  });

  test('mapLimit throws if limit is less than 1', async () => {
    try {
      await mapLimit([1], 0, async (item) => item);
      assert.fail('Should have thrown');
    } catch (error: any) {
      assert.strictEqual(error.message, 'Limit must be at least 1');
    }
  });
});

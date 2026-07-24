import { describe, it, expect } from 'vitest';
import { ChatSerializer } from './chat-serializer';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('ChatSerializer', () => {
  it('runs same-chat tasks sequentially in arrival order', async () => {
    const s = new ChatSerializer();
    const order: string[] = [];

    const t1 = s.serialize('c1', async () => {
      order.push('t1-start');
      await delay(10);
      order.push('t1-end');
    });
    const t2 = s.serialize('c1', async () => {
      order.push('t2-start');
      await delay(10);
      order.push('t2-end');
    });

    await Promise.all([t1, t2]);
    expect(order).toEqual(['t1-start', 't1-end', 't2-start', 't2-end']);
  });

  it('runs different-chat tasks concurrently (does not block across chats)', async () => {
    const s = new ChatSerializer();
    let running = 0;
    let maxConcurrent = 0;

    const task = async () => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      await delay(10);
      running--;
    };

    await Promise.all([s.serialize('c1', task), s.serialize('c2', task)]);

    expect(maxConcurrent).toBe(2);
  });

  it('a rejecting task does not block later tasks on the same chat', async () => {
    const s = new ChatSerializer();

    const t1 = s.serialize('c1', async () => {
      throw new Error('boom');
    });
    let ran = false;
    const t2 = s.serialize('c1', async () => {
      ran = true;
    });

    await expect(t1).rejects.toThrow('boom');
    await t2;
    expect(ran).toBe(true);
  });
});

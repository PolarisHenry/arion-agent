import { describe, it, expect } from 'vitest';
import { execFileAsync } from './exec';

describe('execFileAsync signal', () => {
  it('kills the child and rejects with AbortError when signal aborts', async () => {
    const ac = new AbortController();
    // node -e sleeps 10s; we abort after 50ms.
    const p = execFileAsync('node', ['-e', 'setTimeout(()=>{}, 10000)'], {
      signal: ac.signal
    });
    setTimeout(() => ac.abort(), 50);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects with AbortError when signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      execFileAsync('node', ['-e', 'process.stdout.write("hi")'], { signal: ac.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('resolves normally when signal never aborts', async () => {
    const ac = new AbortController();
    const r = await execFileAsync('node', ['-e', 'process.stdout.write("hi")'], {
      signal: ac.signal
    });
    expect(r.stdout).toBe('hi');
  });

  it('ignores signal when none is passed (existing behavior)', async () => {
    const r = await execFileAsync('node', ['-e', 'process.stdout.write("ok")']);
    expect(r.stdout).toBe('ok');
  });
});

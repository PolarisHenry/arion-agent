import { describe, it, expect } from 'vitest';
import { chunkMarkdownForStream, streamTextInChunks } from './stream-chunk';

// -----------------------------------------------------------
// chunkMarkdownForStream — pure splitter
// -----------------------------------------------------------

describe('chunkMarkdownForStream', () => {
  it('returns [] for empty text', () => {
    expect(chunkMarkdownForStream('')).toEqual([]);
  });

  it('keeps a short single-line text as one piece', () => {
    expect(chunkMarkdownForStream('hello')).toEqual(['hello']);
  });

  it('preserves trailing newline of a non-final line', () => {
    // "a\nb" → line "a" gets '\n' appended, last line "b" does not.
    expect(chunkMarkdownForStream('a\nb')).toEqual(['a\n', 'b']);
  });

  it('preserves a trailing blank line', () => {
    // "a\n" splits into ['a', ''] → "a\n" + "" (last line, empty, no newline added).
    expect(chunkMarkdownForStream('a\n')).toEqual(['a\n', '']);
  });

  it('splits a long line into <= maxChars pieces', () => {
    const text = '0123456789'.repeat(10); // 100 chars
    const pieces = chunkMarkdownForStream(text, 40);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(40);
  });

  it('respects the join equivalence invariant on a markdown table', () => {
    // The property the runtime relies on: re-joining the pieces MUST reproduce
    // the original text exactly (no lost/duplicated chars), otherwise the
    // streamed reply would silently differ from finalContent.
    const table = [
      '**📊 7月份午饭消费统计**',
      '',
      '| 金额 | 次数 | 小计 |',
      '|------|------|------|',
      '| ¥16.80 | 6 次 | ¥100.80 |',
      '| ¥15.00 | 10 次 | ¥150.00 |',
      ''
    ].join('\n');
    const pieces = chunkMarkdownForStream(table, 40);
    expect(pieces.join('')).toBe(table);
  });

  it('honours the join invariant across many random-ish shapes', () => {
    const samples = ['x', '\n', '\n\n', 'a\nb\nc', '短中文一行', '中\n文\n换行', ' '.repeat(99)];
    for (const s of samples) {
      expect(chunkMarkdownForStream(s, 8).join('')).toBe(s);
    }
  });

  it('uses a default maxChars when omitted', () => {
    // A line longer than the default still gets split; the exact default does
    // not matter, only that it is finite and the invariant holds.
    const long = 'a'.repeat(500);
    const pieces = chunkMarkdownForStream(long);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe(long);
  });
});

// -----------------------------------------------------------
// streamTextInChunks — chunked append coordinator
// -----------------------------------------------------------

describe('streamTextInChunks', () => {
  it('appends pieces whose concatenation equals the original text', async () => {
    const appended: string[] = [];
    const table = '| 金额 | 次数 |\n|---|---|\n| ¥16.80 | 6 次 |\n';
    await streamTextInChunks(
      table,
      async (c) => {
        appended.push(c);
      },
      async () => {},
      { maxChars: 10, delayMs: 0 }
    );
    expect(appended.join('')).toBe(table);
  });

  it('sleeps between pieces but not after the last one', async () => {
    const text = '0123456789'.repeat(10); // 100 chars → many pieces at maxChars 10
    let sleeps = 0;
    let appends = 0;
    await streamTextInChunks(
      text,
      async () => {
        appends++;
      },
      async () => {
        sleeps++;
      },
      { maxChars: 10, delayMs: 5 }
    );
    expect(appends).toBe(Math.ceil(text.length / 10));
    expect(sleeps).toBe(appends - 1); // no sleep after the final piece
  });

  it('does not call sleep when delayMs is 0', async () => {
    let sleeps = 0;
    await streamTextInChunks(
      'a\nb\nc',
      async () => {},
      async () => {
        sleeps++;
      },
      { maxChars: 1, delayMs: 0 }
    );
    expect(sleeps).toBe(0);
  });

  it('is a no-op (no append, no sleep) for empty text', async () => {
    let appends = 0;
    let sleeps = 0;
    await streamTextInChunks(
      '',
      async () => {
        appends++;
      },
      async () => {
        sleeps++;
      },
      { maxChars: 10, delayMs: 5 }
    );
    expect(appends).toBe(0);
    expect(sleeps).toBe(0);
  });

  it('propagates an append error', async () => {
    await expect(
      streamTextInChunks(
        'hello',
        async () => {
          throw new Error('boom');
        },
        async () => {},
        { maxChars: 10, delayMs: 0 }
      )
    ).rejects.toThrow('boom');
  });
});

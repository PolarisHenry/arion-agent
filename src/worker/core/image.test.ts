import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  buildImageUserMessage,
  stripImagesForPersist,
  isVisionRejection,
  downloadAndPrepareImages,
  cleanupTempPaths,
  runWithVisionFallback,
  MAX_IMAGES,
  type PreparedImages
} from './image';
import type { LlmMessage } from './llm';
import type { LarkChannel, NormalizedMessage } from '@larksuite/channel';

// 1x1 transparent PNG — a real image sharp can actually process.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function mockChannel(
  download: (fileKey: string) => { buffer: Buffer; contentType?: string }
): LarkChannel {
  return {
    downloadResourceWithMeta: (_id: string, fileKey: string) => Promise.resolve(download(fileKey))
  } as unknown as LarkChannel;
}

function msgWithImages(n: number): NormalizedMessage {
  const resources = Array.from({ length: n }, (_, i) => ({
    type: 'image' as const,
    fileKey: `fk-${i}`
  }));
  return {
    messageId: `mid-${Math.random().toString(36).slice(2)}`,
    resources
  } as unknown as NormalizedMessage;
}

function prepared(n: number): PreparedImages {
  return {
    imageBlocks: Array.from({ length: n }, () => ({
      type: 'image_url' as const,
      image_url: { url: 'data:image/jpeg;base64,AAA' }
    })),
    tempPaths: Array.from({ length: n }, (_, i) => `/tmp/x-${i}.png`)
  };
}

describe('buildImageUserMessage', () => {
  it('returns plain string content when there are no images', () => {
    const m = buildImageUserMessage('hello', null, { withVision: true });
    expect(m).toEqual({ role: 'user', content: 'hello' });
  });

  it('returns plain string content when prepared has no image blocks', () => {
    const m = buildImageUserMessage(
      'hello',
      { imageBlocks: [], tempPaths: [] },
      { withVision: true }
    );
    expect(m.content).toBe('hello');
  });

  it('embeds image_url blocks and a path note when withVision=true', () => {
    const m = buildImageUserMessage('看这张图', prepared(2), { withVision: true });
    expect(Array.isArray(m.content)).toBe(true);
    const blocks = m.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(blocks[0].type).toBe('text');
    expect(blocks[0].text).toContain('看这张图');
    expect(blocks[0].text).toContain('附图 2 张');
    expect(blocks[0].text).toContain('/tmp/x-0.png, /tmp/x-1.png');
    expect(blocks.filter((b) => b.type === 'image_url')).toHaveLength(2);
  });

  it('falls back to string content with a "cannot see" note when withVision=false', () => {
    const m = buildImageUserMessage('看这张图', prepared(1), { withVision: false });
    expect(typeof m.content).toBe('string');
    expect(m.content).toContain('看这张图');
    expect(m.content).toContain('无法识别图片内容');
    expect(m.content).toContain('/tmp/x-0.png');
  });
});

describe('stripImagesForPersist', () => {
  it('leaves string-content messages untouched', () => {
    const msgs: LlmMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ];
    expect(stripImagesForPersist(msgs)).toEqual(msgs);
  });

  it('flattens image-array user content to a string (drops base64, keeps text + note)', () => {
    const msgs: LlmMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: '看这张图\n\n[附图 1 张; 路径: /tmp/x.png]' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BIGBYTES' } }
        ]
      },
      { role: 'assistant', content: '回复' }
    ];
    const out = stripImagesForPersist(msgs);
    expect(typeof out[0].content).toBe('string');
    expect(out[0].content).toContain('看这张图');
    expect(out[0].content).not.toContain('BIGBYTES');
    expect(out[0].content).not.toContain('image_url');
    expect(out[1].content).toBe('回复');
  });
});

describe('isVisionRejection', () => {
  it('returns true only for HTTP 400', () => {
    expect(isVisionRejection({ status: 400 })).toBe(true);
    expect(isVisionRejection({ status: 400, message: 'unsupported input' })).toBe(true);
  });

  it('returns false for 429 / 500 / network / non-object', () => {
    expect(isVisionRejection({ status: 429 })).toBe(false);
    expect(isVisionRejection({ status: 500 })).toBe(false);
    expect(isVisionRejection(new Error('network'))).toBe(false);
    expect(isVisionRejection(null)).toBe(false);
    expect(isVisionRejection(undefined)).toBe(false);
    expect(isVisionRejection('a string')).toBe(false);
  });
});

describe('downloadAndPrepareImages', () => {
  it('returns null when there are no image resources', async () => {
    const channel = mockChannel(() => ({ buffer: TINY_PNG, contentType: 'image/png' }));
    const m = { messageId: 'm1', resources: [] } as unknown as NormalizedMessage;
    expect(await downloadAndPrepareImages(channel, m)).toBeNull();
  });

  it('caps ingestion at MAX_IMAGES', async () => {
    let calls = 0;
    const channel = mockChannel(() => {
      calls++;
      return { buffer: TINY_PNG, contentType: 'image/png' };
    });
    const result = await downloadAndPrepareImages(channel, msgWithImages(MAX_IMAGES + 3));
    expect(calls).toBe(MAX_IMAGES);
    expect(result?.imageBlocks).toHaveLength(MAX_IMAGES);
    expect(result?.tempPaths).toHaveLength(MAX_IMAGES);
    await cleanupTempPaths(result?.tempPaths ?? []);
  });

  it('skips a failed download but keeps the rest (best-effort)', async () => {
    let calls = 0;
    const channel = mockChannel((fileKey) => {
      calls++;
      if (fileKey === 'fk-1') throw new Error('boom');
      return { buffer: TINY_PNG, contentType: 'image/png' };
    });
    const result = await downloadAndPrepareImages(channel, msgWithImages(3));
    expect(calls).toBe(3);
    expect(result?.imageBlocks).toHaveLength(2); // fk-1 skipped
    await cleanupTempPaths(result?.tempPaths ?? []);
  });

  it('writes original temp files and cleans them up', async () => {
    const channel = mockChannel(() => ({ buffer: TINY_PNG, contentType: 'image/png' }));
    const result = await downloadAndPrepareImages(channel, msgWithImages(1));
    expect(result).not.toBeNull();
    if (!result) return;
    const p = result.tempPaths[0];
    expect(existsSync(p)).toBe(true);
    await cleanupTempPaths(result.tempPaths);
    expect(existsSync(p)).toBe(false);
  });

  it('produces image_url blocks as data URLs', async () => {
    const channel = mockChannel(() => ({ buffer: TINY_PNG, contentType: 'image/png' }));
    const result = await downloadAndPrepareImages(channel, msgWithImages(1));
    expect(result).not.toBeNull();
    if (!result) return;
    const block = result.imageBlocks[0];
    expect(block.type).toBe('image_url');
    if (block.type !== 'image_url') return;
    const url = block.image_url.url;
    expect(url.startsWith('data:image/')).toBe(true);
    expect(url).toContain('base64,');
    await cleanupTempPaths(result.tempPaths);
  });
});

describe('runWithVisionFallback', () => {
  it('returns run() result when it succeeds (no fallback)', async () => {
    const result = await runWithVisionFallback({
      run: async () => 'ok',
      fallback: async () => 'fallback',
      hasImages: true
    });
    expect(result).toBe('ok');
  });

  it('falls back when run() rejects with a 400 and images were attached', async () => {
    let fallbackCalled = false;
    let onRetryCalled = false;
    const result = await runWithVisionFallback({
      run: async () => {
        throw { status: 400 };
      },
      fallback: async () => {
        fallbackCalled = true;
        return 'fallback';
      },
      hasImages: true,
      onRetry: () => {
        onRetryCalled = true;
      }
    });
    expect(result).toBe('fallback');
    expect(fallbackCalled).toBe(true);
    expect(onRetryCalled).toBe(true);
  });

  it('does NOT fall back on a non-400 error (rethrows)', async () => {
    await expect(
      runWithVisionFallback({
        run: async () => {
          throw { status: 500 };
        },
        fallback: async () => 'fallback',
        hasImages: true
      })
    ).rejects.toEqual({ status: 500 });
  });

  it('does NOT fall back when there were no images (rethrows the 400)', async () => {
    await expect(
      runWithVisionFallback({
        run: async () => {
          throw { status: 400 };
        },
        fallback: async () => 'fallback',
        hasImages: false
      })
    ).rejects.toEqual({ status: 400 });
  });

  it('propagates the fallback failure if fallback also throws', async () => {
    await expect(
      runWithVisionFallback({
        run: async () => {
          throw { status: 400 };
        },
        fallback: async () => {
          throw new Error('real failure');
        },
        hasImages: true
      })
    ).rejects.toThrow('real failure');
  });
});

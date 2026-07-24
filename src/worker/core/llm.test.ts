import { describe, it, expect } from 'vitest';
import { stripToolCallMarkup, parseDsmlToolCalls, createDsmlStreamFilter } from './llm';

// U+FF5C fullwidth vertical bar — the actual char DeepSeek emits in DSML.
const BAR = '｜';
const O = `<${BAR}${BAR}DSML${BAR}${BAR}`; // opener incl '<'  → <｜｜DSML｜｜
const C = `</${BAR}${BAR}DSML${BAR}${BAR}`; // closer incl '</' → </｜｜DSML｜｜

// Exact shape the model leaked to the user in the reported bug.
const PROSE = '好的，我试着查一下当前应用的详情，看能不能找到对应的链接！';
const LEAKED = [
  PROSE,
  `${O}tool_calls>`,
  `${O}invoke name="run_lark_cli">`,
  `${O}parameter name="argv" string="false">["application","+slash-command-list","--as","bot"]${C}parameter>`,
  `${C}invoke>`,
  `${C}tool_calls>`
].join('\n');

describe('stripToolCallMarkup', () => {
  it('removes real (double-bar) DSML tool-call markup from content', () => {
    const cleaned = stripToolCallMarkup(LEAKED);
    expect(cleaned).not.toContain(BAR);
    expect(cleaned).not.toContain('DSML');
    expect(cleaned).toContain(PROSE);
  });

  it('leaves plain prose untouched when there is no markup', () => {
    expect(stripToolCallMarkup('只是一段普通文字，没有标签。')).toBe(
      '只是一段普通文字，没有标签。'
    );
  });
});

describe('parseDsmlToolCalls', () => {
  it('recovers a leaked DSML tool call with typed argv and strips it from content', () => {
    const recovered = parseDsmlToolCalls(LEAKED);
    expect(recovered).not.toBeNull();
    expect(recovered!.toolCalls).toHaveLength(1);
    expect(recovered!.toolCalls[0].name).toBe('run_lark_cli');
    // string="false" → argv must survive as a real array, not a string
    // (a string argv silently no-ops in executeTool via Array.isArray).
    const args = JSON.parse(recovered!.toolCalls[0].arguments);
    expect(Array.isArray(args.argv)).toBe(true);
    expect(args.argv).toEqual(['application', '+slash-command-list', '--as', 'bot']);
    expect(recovered!.content).not.toContain(BAR);
    expect(recovered!.content).toContain(PROSE);
  });

  it('returns null when there is no DSML in content', () => {
    expect(parseDsmlToolCalls('just prose')).toBeNull();
    expect(parseDsmlToolCalls('')).toBeNull();
    expect(parseDsmlToolCalls(null)).toBeNull();
  });
});

// Feeds `input` to the filter one character at a time (worst-case split),
// flushes, and returns everything the sink received.
function streamCharByChar(input: string): string {
  const seen: string[] = [];
  const f = createDsmlStreamFilter((c) => seen.push(c));
  for (const ch of input) f.push(ch);
  f.flush();
  return seen.join('');
}

describe('createDsmlStreamFilter', () => {
  it('never forwards DSML tokens to the sink (the reported leak)', () => {
    const out = streamCharByChar(LEAKED);
    expect(out).not.toContain(BAR);
    expect(out).not.toContain('DSML');
    expect(out).toContain(PROSE);
  });

  it('preserves prose both before and after a DSML block', () => {
    const block = LEAKED.replace(`${PROSE}\n`, '');
    const out = streamCharByChar(`前面正文。\n${block}\n后面正文。`);
    expect(out).not.toContain(BAR);
    expect(out).toContain('前面正文。');
    expect(out).toContain('后面正文。');
  });

  it('drops an unterminated DSML block (stream cut mid-markup) without leaking fragments', () => {
    const out = streamCharByChar(`正文。\n${O}tool_calls>\n${O}invoke name="run_lark_cli">`);
    expect(out).not.toContain(BAR);
    expect(out).not.toContain('DSML');
    expect(out).not.toContain('run_lark_cli');
    expect(out).toContain('正文。');
  });

  it('streams plain prose straight through (typewriter preserved)', () => {
    const seen: string[] = [];
    const f = createDsmlStreamFilter((c) => seen.push(c));
    f.push('Hello ');
    f.push('world!');
    f.flush();
    expect(seen.join('')).toBe('Hello world!');
  });
});

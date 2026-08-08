import { describe, it, expect } from 'vitest';
import { sanitizeHistory, type Message } from './index';

const user = (content: string): Message => ({ role: 'user', content });
const assistant = (content: string): Message => ({ role: 'assistant', content });
const assistantToolCalls = (ids: string[]): Message => ({
  role: 'assistant',
  content: '',
  tool_calls: ids.map((id) => ({
    id,
    type: 'function',
    function: { name: 'search', arguments: '{}' }
  }))
});
const tool = (id: string): Message => ({ role: 'tool', content: 'ok', tool_call_id: id });

describe('sanitizeHistory', () => {
  it('passes well-formed history through unchanged', () => {
    const msgs = [
      user('hi'),
      assistantToolCalls(['a', 'b']),
      tool('a'),
      tool('b'),
      assistant('done')
    ];
    expect(sanitizeHistory(msgs)).toEqual(msgs);
  });

  it('drops a forward-orphan assistant(tool_calls) missing some results', () => {
    // assistant requested a + b, but only a has a tool result — this is exactly
    // what the API rejects as "insufficient tool messages following tool_calls".
    const msgs = [user('hi'), assistantToolCalls(['a', 'b']), tool('a'), assistant('hmm')];
    const out = sanitizeHistory(msgs);
    // The broken assistant(tool_calls) AND its orphan partial result are gone;
    // the surrounding user / assistant text messages survive.
    expect(out).toEqual([user('hi'), assistant('hmm')]);
  });

  it('drops a reverse-orphan tool message whose assistant was truncated away', () => {
    const msgs = [tool('orphan'), user('hi'), assistant('hello')];
    expect(sanitizeHistory(msgs)).toEqual([user('hi'), assistant('hello')]);
  });

  it('drops system messages', () => {
    const msgs = [{ role: 'system', content: 'sys' } as Message, user('hi'), assistant('hello')];
    expect(sanitizeHistory(msgs)).toEqual([user('hi'), assistant('hello')]);
  });

  it('keeps a clean batch and drops a broken batch in the same history', () => {
    const msgs = [
      user('hi'),
      assistantToolCalls(['a', 'b']),
      tool('a'),
      tool('b'),
      assistantToolCalls(['c', 'd']), // d has no result → whole batch dropped
      tool('c'),
      assistant('final')
    ];
    expect(sanitizeHistory(msgs)).toEqual([
      user('hi'),
      assistantToolCalls(['a', 'b']),
      tool('a'),
      tool('b'),
      assistant('final')
    ]);
  });
});

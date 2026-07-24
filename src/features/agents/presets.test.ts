import { describe, it, expect } from 'vitest';
import { personalizePresetPrompt, matchPresetId, AGENT_PRESETS } from './presets';

describe('personalizePresetPrompt', () => {
  it('inserts the name before the first comma of the opening line', () => {
    const preset =
      '你是公司的行政秘书，负责协助团队成员高效处理日常事务。你是一位细心、可靠、有条理的助手。';
    expect(personalizePresetPrompt(preset, 'kelly')).toBe(
      '你是公司的行政秘书“kelly”，负责协助团队成员高效处理日常事务。你是一位细心、可靠、有条理的助手。'
    );
  });

  it('returns the prompt unchanged when the name is empty or whitespace', () => {
    const preset = '你是公司的行政秘书，负责…';
    expect(personalizePresetPrompt(preset, '')).toBe(preset);
    expect(personalizePresetPrompt(preset, '   ')).toBe(preset);
  });

  it('returns the prompt unchanged when there is no comma to anchor on', () => {
    const preset = '你是无敌的存在。';
    expect(personalizePresetPrompt(preset, 'kelly')).toBe(preset);
  });

  it('trims surrounding whitespace from the name', () => {
    const preset = '你是公司的行政秘书，负责…';
    expect(personalizePresetPrompt(preset, '  kelly  ')).toBe('你是公司的行政秘书“kelly”，负责…');
  });

  it('lands the name after the role for every shipped preset', () => {
    // Every preset opens with "你是…[角色]，…", so the name must always land
    // before that first comma — never mid-sentence in the body.
    for (const { id, systemPrompt } of AGENT_PRESETS) {
      const out = personalizePresetPrompt(systemPrompt, 'X');
      expect(out).toContain('“X”，');
      expect(out.startsWith(systemPrompt.slice(0, systemPrompt.indexOf('，')))).toBe(true);
      expect(id).toBeTruthy();
    }
  });
});

describe('matchPresetId', () => {
  it('every preset is uniquely identifiable, including the new lifestyle ones', () => {
    // If any two presets shared a normalized full text or structured body,
    // matchPresetId would return the earlier one and this would fail — so this
    // also guards the 3 new presets against colliding with existing ones.
    for (const { id, systemPrompt } of AGENT_PRESETS) {
      expect(matchPresetId(systemPrompt)).toBe(id);
    }
    expect(AGENT_PRESETS.find((p) => p.id === 'personal-doctor')).toBeDefined();
    expect(AGENT_PRESETS.find((p) => p.id === 'nutritionist')).toBeDefined();
    expect(AGENT_PRESETS.find((p) => p.id === 'fitness-coach')).toBeDefined();
  });

  it('still matches after the intro is personalized with a name', () => {
    const doctor = AGENT_PRESETS.find((p) => p.id === 'personal-doctor')!;
    expect(matchPresetId(personalizePresetPrompt(doctor.systemPrompt, '阿明'))).toBe(
      'personal-doctor'
    );
  });

  it('returns empty string for a prompt matching no preset', () => {
    expect(matchPresetId('一段和任何人设都无关的随机提示词，没有任何结构化标题。')).toBe('');
  });
});

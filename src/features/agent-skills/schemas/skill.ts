import * as z from 'zod';

// Mirrors the worker's isValidSkillName: lowercase snake/kebab with dot
// segments, length 1–64. Keep in sync with src/worker/core/skill-source.ts.
export const skillSchema = z.object({
  name: z
    .string()
    .min(1, 'Skill name is required.')
    .max(64, 'Skill name must be at most 64 characters.')
    .regex(
      /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*$/,
      'Use lowercase snake_case/kebab-case (a-z 0-9 _ - .), e.g. weekly_report.'
    ),
  description: z
    .string()
    .min(1, 'Description is required.')
    .max(300, 'Description must be at most 300 characters.'),
  body: z
    .string()
    .min(1, 'Skill body is required.')
    .max(8000, 'Skill body must be at most 8000 characters.'),
  enabled: z.boolean()
});

export type SkillFormValues = {
  name: string;
  description: string;
  body: string;
  enabled: boolean;
};

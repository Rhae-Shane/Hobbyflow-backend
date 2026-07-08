import { clampModality, getAllowedModalities } from '../src/services/planner/modalityRules';

describe('modalityRules', () => {
  it('disallows audio for chess', () => {
    expect(clampModality('chess', 'audio')).toBe('video');
  });

  it('allows audio for guitar', () => {
    expect(getAllowedModalities('guitar')).toContain('audio');
  });
});

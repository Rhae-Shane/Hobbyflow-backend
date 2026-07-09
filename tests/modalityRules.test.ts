import { applyModalityRules, clampModality, getAllowedModalities } from '../src/services/planner/modalityRules';

const blindLearnerContext = `
Accessibility and learning needs:
- Blindness: Prioritize audio, tactile, and descriptive non-visual instructions; avoid visual-only steps.
`;

describe('modalityRules', () => {
  it('disallows audio for chess', () => {
    expect(clampModality('chess', 'audio')).toBe('video');
  });

  it('allows audio for guitar', () => {
    expect(getAllowedModalities('guitar')).toContain('audio');
  });

  it('removes video for blind learners on custom hobbies', () => {
    const allowed = getAllowedModalities('Calisthenics', blindLearnerContext);

    expect(allowed).not.toContain('video');
    expect(allowed).toEqual(expect.arrayContaining(['audio', 'article']));
  });

  it('remaps video techniques to accessible modalities for blind learners', () => {
    const [technique] = applyModalityRules(
      'Calisthenics',
      [
        {
          modality: 'video',
          searchQuery: 'calisthenics bodyweight squat tutorial for beginners',
        },
      ],
      blindLearnerContext,
    );

    expect(technique.modality).not.toBe('video');
    expect(['audio', 'article']).toContain(technique.modality);
    expect(technique.searchQuery.length).toBeGreaterThan(0);
  });
});

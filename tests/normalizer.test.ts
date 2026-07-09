import { normalizeTechniques } from '../src/services/planner/normalizer';

describe('normalizer', () => {
  it('fills defaults for a thin technique object (§5.3 example)', () => {
    const [technique] = normalizeTechniques(
      { techniques: [{ name: 'Fork', order: 3 }] },
      'Chess',
    );

    expect(technique).toEqual({
      id: 't3',
      name: 'Fork',
      why: 'Technique in your Chess roadmap.',
      order: 3,
      modality: 'video',
      estimatedMinutes: 20,
      searchQuery: 'GothamChess Chess Fork explained',
      status: 'todo',
    });
  });
});

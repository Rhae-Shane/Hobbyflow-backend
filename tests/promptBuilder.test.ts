import { buildRoadmapSystemPrompt, buildRoadmapUserPrompt } from '../src/services/planner/promptBuilder';

describe('buildRoadmapUserPrompt', () => {
  it('includes learner context when provided', () => {
    const prompt = buildRoadmapUserPrompt({
      hobby: 'Guitar',
      level: 'beginner',
      goal: 'play songs',
      timeBudget: '30 min/day',
      learnerContext: 'Practice environment:\n- At home only: Avoid studio-only techniques',
    });

    expect(prompt).toContain('Generate a learning roadmap for Guitar.');
    expect(prompt).toContain('Learner profile');
    expect(prompt).toContain('At home only');
  });

  it('omits learner profile section when context is absent', () => {
    const prompt = buildRoadmapUserPrompt({
      hobby: 'Chess',
      level: 'beginner',
      goal: '',
      timeBudget: '15 min/day',
    });

    expect(prompt).not.toContain('Learner profile');
  });
});

describe('buildRoadmapSystemPrompt', () => {
  it('includes accessibility constraints for blind learners', () => {
    const prompt = buildRoadmapSystemPrompt('Calisthenics', `
Accessibility and learning needs:
- Blindness: Prioritize audio, tactile, and descriptive non-visual instructions; avoid visual-only steps.
`);

    expect(prompt).toContain('Allowed modalities for this hobby: article, audio.');
    expect(prompt).toContain('never assign video');
    expect(prompt).toContain('Accessibility needs override preferred content format');
  });
});

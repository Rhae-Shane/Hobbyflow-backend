import {
  buildAccessibilityRetryHint,
  enrichSearchQueryForModality,
  parseAccessibilityConstraints,
  rawPlanViolatesAccessibility,
} from '../src/services/planner/learnerAccessibility';

const blindLearnerContext = `
Accessibility and learning needs:
- Blindness: Prioritize audio, tactile, and descriptive non-visual instructions; avoid visual-only steps.
Preferred content format:
- Video: Prefer video-led techniques with demos the user can follow along.
`;

describe('learnerAccessibility', () => {
  it('detects blindness constraints from learner context', () => {
    const constraints = parseAccessibilityConstraints(blindLearnerContext);

    expect(constraints).not.toBeNull();
    expect(constraints?.forbiddenModalities).toEqual(
      expect.arrayContaining(['video', 'interactive']),
    );
    expect(constraints?.preferredModalities).toEqual(
      expect.arrayContaining(['audio', 'article']),
    );
    expect(constraints?.promptLines.join('\n')).toContain('never assign video');
  });

  it('flags raw plans that use forbidden modalities', () => {
    const constraints = parseAccessibilityConstraints(blindLearnerContext);

    expect(
      rawPlanViolatesAccessibility(
        [{ modality: 'video' }, { modality: 'article' }],
        constraints!,
      ),
    ).toBe(true);
    expect(
      rawPlanViolatesAccessibility(
        [{ modality: 'audio' }, { modality: 'article' }],
        constraints!,
      ),
    ).toBe(false);
  });

  it('enriches audio search queries for blind learners', () => {
    const constraints = parseAccessibilityConstraints(blindLearnerContext);

    expect(
      enrichSearchQueryForModality(
        'calisthenics bodyweight squat tutorial for beginners',
        'audio',
        constraints,
      ),
    ).toContain('audio guide podcast');
  });

  it('builds a retry hint for accessibility violations', () => {
    const constraints = parseAccessibilityConstraints(blindLearnerContext);

    expect(buildAccessibilityRetryHint(constraints!)).toContain('CORRECTION');
    expect(buildAccessibilityRetryHint(constraints!)).toContain('video');
  });
});

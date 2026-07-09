import {
  validateRawPlanResponse,
  validateRawTechniqueResponse,
} from '../src/services/planner/validator';

function validTechniques(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Technique ${i + 1}`,
    why: `Why ${i + 1}`,
    order: i + 1,
    modality: 'video' as const,
  }));
}

describe('validator', () => {
  it('accepts a valid plan shape', () => {
    const result = validateRawPlanResponse({ techniques: validTechniques(5) });
    expect(result.techniques).toHaveLength(5);
  });

  it('rejects more than 8 techniques', () => {
    expect(() => validateRawPlanResponse({ techniques: validTechniques(9) })).toThrow();
  });

  it('rejects a URL in technique name', () => {
    expect(() =>
      validateRawTechniqueResponse({
        name: 'Learn from https://evil.com',
        order: 1,
      }),
    ).toThrow(/URLs are not allowed/);
  });
});

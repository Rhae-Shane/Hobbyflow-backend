import { materializeRoadmapRequestSchema } from '../src/schemas/roadmapMaterialize.schema';

describe('roadmapMaterialize.schema', () => {
  it('parses a valid materialize request', () => {
    const parsed = materializeRoadmapRequestSchema.parse({
      hobby: 'Drums',
      level: 'beginner',
      goalCard: {
        suggestedHobby: 'Drums',
        suggestedName: 'Drumming Foundations',
        suggestedGoal: 'Play along to songs',
        suggestedBackground: 'Beginner',
        suggestedLevel: 'beginner',
      },
      lessonPlan: {
        courseTitle: 'Drumming Foundations',
        sections: [
          {
            name: 'Basics',
            lessons: [
              { name: 'Pulse', hook: 'Feel it?', meaning: 'Timing matters.' },
              { name: 'Grip', hook: 'Hold how?', meaning: 'Comfort first.' },
            ],
          },
          {
            name: 'Grooves',
            lessons: [{ name: 'Rock beat', hook: 'Ready?', meaning: 'Play songs.' }],
          },
        ],
        stage: 'outline',
        lessonPlanId: '19ea8d96-a62a-4a69-b45e-6fcb3bcdaab4',
      },
      userRoles: ['Student'],
      isFirstRoadmap: true,
    });

    expect(parsed.lessonPlan.sections).toHaveLength(2);
    expect(parsed.isFirstRoadmap).toBe(true);
  });

  it('rejects outline with fewer than 2 sections', () => {
    expect(() =>
      materializeRoadmapRequestSchema.parse({
        hobby: 'Drums',
        level: 'beginner',
        goalCard: {
          suggestedHobby: 'Drums',
          suggestedName: 'X',
          suggestedGoal: 'Y',
          suggestedBackground: 'Z',
          suggestedLevel: 'beginner',
        },
        lessonPlan: {
          courseTitle: 'X',
          sections: [
            {
              name: 'Only one',
              lessons: [{ name: 'A', hook: 'H?', meaning: 'M.' }],
            },
          ],
          stage: 'outline',
          lessonPlanId: '19ea8d96-a62a-4a69-b45e-6fcb3bcdaab4',
        },
      }),
    ).toThrow();
  });
});

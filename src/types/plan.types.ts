export type Modality = 'video' | 'article' | 'audio' | 'interactive';

export type TechniqueStatus = 'todo' | 'in_progress' | 'mastered' | 'skipped';

export type Technique = {
  id: string;
  name: string;
  why: string;
  order: number;
  modality: Modality;
  estimatedMinutes: number;
  searchQuery: string;
  status: TechniqueStatus;
};

export type Plan = {
  planId: string;
  hobby: string;
  goal: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  estimatedDuration: string;
  generatedAt: string;
  techniques: Technique[];
};

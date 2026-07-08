import type { PlanRequest } from '../../schemas/planRequest.schema';
import type { ReplaceRequest } from '../../schemas/replaceRequest.schema';
import type { RawPlanResponse } from '../planner/validator';

export interface AIProvider {
  generateRoadmap(input: PlanRequest): Promise<RawPlanResponse>;
  suggestReplacement(input: ReplaceRequest): Promise<RawPlanResponse['techniques'][number]>;
}

import { traceable } from 'langsmith/traceable';

type LlmTraceOptions = {
  name: string;
  provider: string;
  model: string;
};

export function traceLlmCall<T extends (...args: never[]) => Promise<string>>(
  fn: T,
  options: LlmTraceOptions,
): T {
  return traceable(fn, {
    name: options.name,
    run_type: 'llm',
    getInvocationParams: () => ({
      ls_provider: options.provider,
      ls_model_name: options.model,
      ls_model_type: 'chat',
    }),
  }) as T;
}

export function tracePlannerRun<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  name: string,
): T {
  return traceable(fn, { name, run_type: 'chain' }) as T;
}

export function traceRoadmapCreationRun<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  name = 'roadmap-creation-chat',
): T {
  return traceable(fn, { name, run_type: 'chain' }) as T;
}

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createChildLogger } from '../../lib/logger';
import { invokeChatModel } from '../langgraph/llm';

const log = createChildLogger({ module: 'roadmap-preview-copy' });

export type PreviewCopyInput = {
  title: string;
  goal: string;
  background: string;
  roles: string[];
};

export type PreviewCopy = {
  intro: string;
  achievements: string;
};

function rolesLine(roles: string[]): string {
  return roles.length > 0 ? roles.join(', ') : 'Learner';
}

function buildIntroPrompt(input: PreviewCopyInput): string {
  return `Write a short intro (1-2 sentences, under 30 words total) for a roadmap titled "${input.title}".
Context: The learner's goal is: ${input.goal}. Their background: ${input.background}. Their role(s): ${rolesLine(input.roles)}.

**Rules**:
- No heading, no bullets
- Friendly, specific to the learner's goal
- No questions, no emojis
- Do not repeat the roadmap title
- Return plain text only`;
}

function buildAchievementsPrompt(input: PreviewCopyInput): string {
  return `Write 3-4 bullet points describing what a learner will achieve in a roadmap titled "${input.title}".
Context: The learner's goal is: ${input.goal}. Their background: ${input.background}. Their role(s): ${rolesLine(input.roles)}.

**Rules**:
- Each bullet: one **bold** key skill or outcome, under 10 words. No full sentences.
- Use markdown bullets starting with "* "
- No heading (the heading is rendered separately)
- Friendly, specific to the learner's goal
- No questions, no emojis
- Do not repeat the roadmap title
- Return plain text only`;
}

async function invokePlainText(prompt: string): Promise<string> {
  const response = await invokeChatModel([
    new SystemMessage(
      'You write concise personalized learning-roadmap copy. Follow the user rules exactly. Return plain text only.',
    ),
    new HumanMessage(prompt),
  ]);
  const content =
    typeof response.content === 'string' ? response.content : String(response.content ?? '');
  return content.trim();
}

function fallbackIntro(input: PreviewCopyInput): string {
  return `Build practical skills toward ${input.goal.toLowerCase().replace(/\.$/, '')} with a clear, beginner-friendly path.`;
}

function fallbackAchievements(input: PreviewCopyInput): string {
  const hobbyHint = input.title.split(' ')[0] ?? 'core';
  return [
    `* **Foundational ${hobbyHint} skills** for steady progress`,
    `* **Goal-focused practice** aligned to your plan`,
    `* **Confidence building** through small wins`,
    `* **Consistent habits** that fit your routine`,
  ].join('\n');
}

export async function generateRoadmapPreviewCopy(
  input: PreviewCopyInput,
): Promise<PreviewCopy> {
  try {
    const [intro, achievements] = await Promise.all([
      invokePlainText(buildIntroPrompt(input)),
      invokePlainText(buildAchievementsPrompt(input)),
    ]);

    return {
      intro: intro || fallbackIntro(input),
      achievements: achievements || fallbackAchievements(input),
    };
  } catch (error) {
    log.warn({ err: error }, 'Preview copy LLM failed — using fallbacks');
    return {
      intro: fallbackIntro(input),
      achievements: fallbackAchievements(input),
    };
  }
}

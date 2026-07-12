import { supabaseAdmin } from '../../lib/supabase';
import { createChildLogger } from '../../lib/logger';
import { AppError, ErrorCodes } from '../../lib/AppError';

const log = createChildLogger({ module: 'ask.conversations' });

export const ASK_WORKFLOW = 'ask_anything';

export type AskStoredMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AskConversationSummary = {
  id: string;
  title: string;
  lastMessageAt: string | null;
  preview: string | null;
};

export type AskConversationDetail = {
  id: string;
  title: string;
  messages: AskStoredMessage[];
  lastMessageAt: string | null;
  context: Record<string, unknown>;
};

function titleFromMessage(message: string): string {
  return message.trim().slice(0, 80) || 'New chat';
}

function previewFromMessages(messages: AskStoredMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return null;
  return firstUser.content.trim().slice(0, 120);
}

export async function listAskConversations(
  userId: string,
  limit = 50,
): Promise<AskConversationSummary[]> {
  const capped = Math.min(Math.max(limit, 1), 50);
  const { data, error } = await supabaseAdmin
    .from('chat_conversations')
    .select('id, title, last_message_at, messages')
    .eq('user_id', userId)
    .eq('context->>workflow', ASK_WORKFLOW)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false })
    .limit(capped);

  if (error) {
    log.error({ err: error, userId }, 'listAskConversations failed');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to list conversations');
  }

  return (data ?? []).map((row) => {
    const messages = (row.messages ?? []) as AskStoredMessage[];
    return {
      id: row.id as string,
      title: row.title as string,
      lastMessageAt: (row.last_message_at as string | null) ?? null,
      preview: previewFromMessages(messages),
    };
  });
}

export async function getAskConversation(
  userId: string,
  conversationId: string,
): Promise<AskConversationDetail> {
  const { data, error } = await supabaseAdmin
    .from('chat_conversations')
    .select('id, title, messages, last_message_at, context, archived_at')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .eq('context->>workflow', ASK_WORKFLOW)
    .maybeSingle();

  if (error) {
    log.error({ err: error, userId, conversationId }, 'getAskConversation failed');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to load conversation');
  }

  if (!data || data.archived_at) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Conversation not found');
  }

  const messages = ((data.messages ?? []) as AskStoredMessage[]).map((m) => ({
    role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: String(m.content ?? ''),
  }));

  return {
    id: data.id as string,
    title: data.title as string,
    messages,
    lastMessageAt: (data.last_message_at as string | null) ?? null,
    context: (data.context as Record<string, unknown>) ?? {},
  };
}

export async function archiveAskConversation(
  userId: string,
  conversationId: string,
): Promise<void> {
  const existing = await getAskConversation(userId, conversationId);
  const { error } = await supabaseAdmin
    .from('chat_conversations')
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('user_id', userId);

  if (error) {
    log.error({ err: error, userId, conversationId }, 'archiveAskConversation failed');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to delete conversation');
  }
}

export async function persistAskTurn(options: {
  userId: string;
  conversationId?: string;
  userMessage: string;
  assistantMessage: string;
  priorMessages: AskStoredMessage[];
  activeHobbyHint?: string;
  toolsUsed?: string[];
}): Promise<string> {
  const now = new Date().toISOString();
  const messages: AskStoredMessage[] = [
    ...options.priorMessages,
    { role: 'user', content: options.userMessage },
    { role: 'assistant', content: options.assistantMessage },
  ];

  const context = {
    origin: 'ask_fab',
    workflow: ASK_WORKFLOW,
    activeHobbyHint: options.activeHobbyHint ?? null,
    lastToolsUsed: options.toolsUsed ?? [],
  };

  if (options.conversationId) {
    const existing = await getAskConversation(options.userId, options.conversationId);
    const { error } = await supabaseAdmin
      .from('chat_conversations')
      .update({
        messages,
        message_count: messages.length,
        last_message_at: now,
        updated_at: now,
        context: {
          ...existing.context,
          ...context,
        },
      })
      .eq('id', options.conversationId)
      .eq('user_id', options.userId);

    if (error) {
      log.error(
        { err: error, userId: options.userId, conversationId: options.conversationId },
        'Failed to update ask conversation',
      );
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to save conversation');
    }
    return options.conversationId;
  }

  const { data, error } = await supabaseAdmin
    .from('chat_conversations')
    .insert({
      user_id: options.userId,
      title: titleFromMessage(options.userMessage),
      messages,
      context,
      message_count: messages.length,
      last_message_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    log.error({ err: error, userId: options.userId }, 'Failed to create ask conversation');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to save conversation');
  }

  return data.id as string;
}

const TRUSTED_CREATORS: Record<string, string> = {
  chess: 'GothamChess',
  guitar: 'Justin Guitar',
  poker: 'Brad Owen',
};

export function getTrustedCreator(hobby: string): string | undefined {
  return TRUSTED_CREATORS[hobby.trim().toLowerCase()];
}

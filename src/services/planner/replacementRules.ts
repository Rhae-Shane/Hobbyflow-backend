export function isDuplicateTechniqueName(
  candidate: string,
  existingNames: string[],
): boolean {
  const normalized = candidate.trim().toLowerCase();
  return existingNames.some((name) => {
    const other = name.trim().toLowerCase();
    return other === normalized || other.includes(normalized) || normalized.includes(other);
  });
}

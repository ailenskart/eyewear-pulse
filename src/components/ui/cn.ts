/** Minimal className joiner — avoids pulling in clsx for a 20-line utility. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

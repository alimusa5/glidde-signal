/**
 * Normalize a single feedback text string.
 * Rules:
 * - trim
 * - convert CRLF to LF
 * - collapse multiple spaces/tabs to a single space
 * - collapse excessive newlines
 */
export function normalizeText(input: string): string {
  if (!input) return "";

  // Standardize line endings
  let text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Trim outer whitespace
  text = text.trim();

  // Collapse repeated spaces/tabs (but keep newlines for now)
  text = text.replace(/[ \t]+/g, " ");

  // Collapse 3+ newlines down to 2 (keeps paragraph breaks)
  text = text.replace(/\n{3,}/g, "\n\n");

  // Final trim again after collapsing
  return text.trim();
}

/**
 * Split pasted raw text into entries.
 * Recommended rule for Day 2: split by blank lines (paragraphs).
 * - Blank line = one or more empty lines between text blocks
 * - Removes empty segments
 */
export function splitRawText(input: string): string[] {
  if (!input) return [];

  // Standardize line endings
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  // Split by blank lines (one or more empty lines)
  const parts = text.split(/\n\s*\n+/);

  // Trim each part and drop empties
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Remove exact duplicates (case-insensitive).
 * Keeps the first occurrence, removes later duplicates.
 */
export function dedupeExact(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(item);
  }

  return out;
}

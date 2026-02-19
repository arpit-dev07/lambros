export const splitText = (text, { maxChars = 1000, overlap = 150 } = {}) => {
  if (!text || typeof text !== "string") return [];

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + maxChars, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
};

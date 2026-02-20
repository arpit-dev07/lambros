import { createEmbedding } from "./embedding.service.js";
import { index } from "./pinecone.service.js";
import { openai } from "../config/openai.js";

const KNOWN_CATEGORIES = new Set([
  "Technique",
  "Ingredient",
  "Style",
  "Recipe",
  "General",
]);

const getMaxContextChars = () => {
  const raw = Number.parseInt(process.env.RAG_MAX_CONTEXT_CHARS || "12000", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 12000;
  return raw;
};

const getMinScore = () => {
  const raw = Number.parseFloat(process.env.RAG_MIN_SCORE || "0");
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
};

const normalizeCategory = (category) => {
  if (typeof category !== "string") return "General";
  const trimmed = category.trim();
  if (!trimmed) return "General";
  if (KNOWN_CATEGORIES.has(trimmed)) return trimmed;
  return "General";
};

const normalizeSource = (sourceFile) => {
  if (typeof sourceFile !== "string") return "unknown";
  const value = sourceFile.trim();
  return value || "unknown";
};

const normalizeText = (text) => {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
};

const sanitizeModelAnswer = (text) => {
  if (typeof text !== "string") return "";

  return text
    .replace(/\r/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const dedupeMatches = (items) => {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const source = normalizeSource(item.sourceFile);
    const chunkIndex = Number.isFinite(item.chunkIndex) ? item.chunkIndex : "na";
    const textSig = item.text.slice(0, 180);
    const key = `${source}:${chunkIndex}:${textSig}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
};

const buildContext = (items, maxChars) => {
  const grouped = {
    Technique: [],
    Ingredient: [],
    Style: [],
    Recipe: [],
    General: [],
  };

  for (const item of items) {
    const source = normalizeSource(item.sourceFile);
    const section = normalizeCategory(item.category);
    grouped[section].push(`[Source: ${source}] ${item.text}`);
  }

  let context = "";
  for (const [section, sectionItems] of Object.entries(grouped)) {
    if (sectionItems.length === 0) continue;
    const sectionBlock = `\n### ${section}\n${sectionItems.join("\n\n")}\n`;
    if (context.length + sectionBlock.length > maxChars) break;
    context += sectionBlock;
  }

  return context.trim();
};

export const generateAnswerDetailed = async (question, { topK = 10 } = {}) => {
  const queryText = typeof question === "string" ? question.trim() : "";
  if (!queryText) {
    return {
      answer: "Please provide a cooking question so I can help.",
      sources: [],
    };
  }

  const queryEmbedding = await createEmbedding(queryText);
  const safeTopK = Number.isFinite(topK) ? Math.min(20, Math.max(1, Math.trunc(topK))) : 10;

  const results = await index.query({
    vector: queryEmbedding,
    topK: safeTopK,
    includeMetadata: true,
  });

  const minScore = getMinScore();
  const rawMatches = (results?.matches ?? [])
    .map((match) => {
      const metadata = match?.metadata || {};
      return {
        score: typeof match?.score === "number" ? match.score : 0,
        text: normalizeText(metadata.text),
        sourceFile: normalizeSource(metadata.sourceFile),
        chunkIndex:
          typeof metadata.chunkIndex === "number" ? metadata.chunkIndex : Number.NaN,
        category: normalizeCategory(metadata.category),
      };
    })
    .filter((item) => item.text.length >= 20 && item.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const matches = dedupeMatches(rawMatches);
  const maxContextChars = getMaxContextChars();
  const context = buildContext(matches, maxContextChars);

  const sources = [...new Set(matches.map((m) => m.sourceFile).filter((s) => s !== "unknown"))];

  if (!context) {
    return {
      answer:
        "I could not find enough relevant information in your uploaded files. Try a more specific question or upload more documents.",
      sources: [],
    };
  }

  const sourceList = sources.length ? sources.join(", ") : "No explicit sources found";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a culinary RAG assistant. Ground answers in provided context first. If context is insufficient, clearly state assumptions. Keep output practical and structured. Do not use Markdown symbols such as *, **, #, or backticks.",
      },
      {
        role: "user",
        content: [
          "Use the retrieved recipe context below to answer the user request.",
          "Priorities:",
          "1) Prefer grounded details from context.",
          "2) Synthesize ideas instead of copying one source verbatim.",
          "3) Mention techniques and ingredients when available.",
          "4) If uncertain, say what is missing.",
          "",
          "Required format:",
          "Recipe Name: ...",
          "Description: ...",
          "Ingredients:",
          "- ...",
          "Steps:",
          "1. ...",
          "Techniques Used: ...",
          "Sources Combined: ...",
          "",
          `Retrieved Sources: ${sourceList}`,
          "",
          "Context:",
          context,
          "",
          `User Request: ${queryText}`,
        ].join("\n"),
      },
    ],
    temperature: 0.55,
  });

  const answer = sanitizeModelAnswer(
    completion.choices?.[0]?.message?.content?.trim() ||
      "I could not generate a complete answer at the moment."
  );

  return { answer, sources };
};

export const generateAnswer = async (question) => {
  const { answer } = await generateAnswerDetailed(question);
  return answer;
};

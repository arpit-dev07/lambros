
import { createEmbedding } from "./embedding.service.js";
import { index } from "./pinecone.service.js";
import { openai } from "../config/openai.js";

const uniqSources = (items) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.sourceFile ?? ""}:${item.chunkIndex ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const getMaxContextChars = () => {
  const raw = Number.parseInt(process.env.RAG_MAX_CONTEXT_CHARS || "12000", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 12000;
  return raw;
};

export const generateAnswerDetailed = async (question, { topK = 10 } = {}) => {
  const queryEmbedding = await createEmbedding(question);

  const results = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  const matches = results?.matches ?? [];

  // Group matches by category for better synthesis
  const grouped = {
    Technique: [],
    Ingredient: [],
    Style: [],
    Recipe: [],
    General: []
  };

  const sourcesSet = new Set();

  matches.forEach(m => {
    const cat = m.metadata?.category || "General";
    const text = m.metadata?.text || "";
    const sourceFile = m.metadata?.sourceFile || "unknown";

    // Track sources
    if (sourceFile !== "unknown") {
      sourcesSet.add(sourceFile);
    }

    const content = `[Source: ${sourceFile}] ${text}`;

    if (Array.isArray(grouped[cat])) {
      grouped[cat].push(content);
    } else {
      grouped["General"].push(content);
    }
  });

  let context = "";
  for (const [cat, items] of Object.entries(grouped)) {
    if (items.length > 0) {
      context += `\n### ${cat}\n${items.join("\n\n")}\n`;
    }
  }

  const sources = Array.from(sourcesSet);

  if (!context.trim()) {
    return {
      answer: "I couldn't find a relevant answer in the knowledge base.",
      sources: []
    };
  }

  const prompt = `
You are an expert chef and culinary inventor.

Below are recipe fragments from my database, grouped by category:

${context}

Task: Create a NEW unique recipe based on the user's request.
- Combine ingredients from multiple sources if appropriate.
- Reuse techniques found in the context.
- Create an original step-by-step recipe.

Rules:
- Do not simply copy a recipe unless asked. Synthesize a new one using the components provided.
- If the context doesn't contain enough info to be creative, rely on your general culinary knowledge but PRIORITIZE the provided context.
- Output in the following structured format.

Output Format:
Recipe Name: [Name]
Description: [Brief description]
Ingredients:
- [Item]
Steps:
1. [Step]
Techniques Used: [List techniques from context]
Sources Combined: [List source files]
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a creative chef AI that synthesizes new recipes from retrieved context.",
      },
      {
        role: "user",
        content: `${prompt}\n\nUser Request:\n${question}`,
      },
    ],
  });

  const answer = completion.choices?.[0]?.message?.content ?? "I don't know";
  return { answer, sources };
};

export const generateAnswer = async (question) => {
  const { answer } = await generateAnswerDetailed(question);
  return answer;
};

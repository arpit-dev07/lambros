
import { openai } from "../config/openai.js";

export const createEmbedding = async (text) => {
  const embeddings = await createEmbeddings([text]);
  return embeddings[0];
};

export const createEmbeddings = async (inputs) => {
  const safeInputs = Array.isArray(inputs)
    ? inputs.filter((t) => typeof t === "string" && t.trim().length > 0)
    : [];

  if (safeInputs.length === 0) return [];

  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: safeInputs,
  });

  return res.data.map((d) => d.embedding);
};

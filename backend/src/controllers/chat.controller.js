
import { generateAnswerDetailed } from "../services/rag.service.js";

export const askQuestion = async (req, res) => {
  try {
    const question = req.body?.question;
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing 'question' string" });
    }

    const includeSources =
      String(req.query?.includeSources || req.body?.includeSources || "false").toLowerCase() ===
      "true";

    const topKRaw = req.body?.topK ?? req.query?.topK;
    const topKNum = Number(topKRaw);
    const topK = Number.isFinite(topKNum) ? Math.min(20, Math.max(1, Math.trunc(topKNum))) : 5;

    const { answer, sources } = await generateAnswerDetailed(question, { topK });

    return res.json(includeSources ? { answer, sources } : { answer });
  } catch (err) {
    return res.status(500).json({ error: "Failed to generate answer" });
  }
};

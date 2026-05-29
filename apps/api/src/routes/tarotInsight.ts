import { Router } from "express";
import { buildTarotInsightPrompt } from "tarot-core";
import { generateText } from "../lib/ai-client"; // OpenAI 연동 유틸리티

const router = Router();

router.post("/tarot-insight", async (req, res) => {
  const { ticker, cardId, orientation, marketCondition } = req.body;

  if (!ticker || !cardId || !orientation || !marketCondition) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const prompt = buildTarotInsightPrompt(ticker, cardId, orientation, marketCondition);

  try {
    const aiResponse = await generateText(prompt);
    const { Title, Content } = JSON.parse(aiResponse);

    if (!Title || !Content) {
      return res.status(500).json({ error: "Invalid AI response format" });
    }

    res.json({ title: Title, content: Content });
  } catch (error) {
    console.error("Error generating tarot insight:", error);
    res.status(500).json({ error: "Failed to generate tarot insight" });
  }
});

export default router;

import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {

  try {

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { code, language } = req.body || {};

    if (!code) {
      return res.status(400).json({
        summary: "No code provided.",
        score: 0,
        totalIssues: 0,
        timeComplexity: "Unknown",
        spaceComplexity: "Unknown",
        complexitySuggestions: "Provide code to analyze.",
        issues: []
      });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const prompt = `You are a senior software engineer. Review this ${language} code and explain the bugs.

Code:
${code}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt
    });

    const text = response?.text || "AI returned no explanation.";

    return res.status(200).json({
      summary: text,
      score: 80,
      totalIssues: 0,
      timeComplexity: "Unknown",
      spaceComplexity: "Unknown",
      complexitySuggestions: "AI explanation returned as text.",
      issues: []
    });

  } catch (error: any) {

    console.error("SERVER ERROR:", error);

    return res.status(200).json({
      summary: "AI analysis failed but server responded safely.",
      score: 0,
      totalIssues: 0,
      timeComplexity: "Unknown",
      spaceComplexity: "Unknown",
      complexitySuggestions: "Check server logs.",
      issues: []
    });

  }
}

import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {

  try {

    const { code, language } = req.body;

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const prompt = `
You are a senior software engineer and security auditor.

Review the following ${language} code and explain the bugs, logic errors, and performance problems.

Code:
${code}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt
    });

    const text = response.text || "No analysis returned.";

    res.status(200).json({
      summary: text,
      score: 80,
      totalIssues: 0,
      timeComplexity: "Unknown",
      spaceComplexity: "Unknown",
      complexitySuggestions: "AI returned explanation text.",
      issues: []
    });

  } catch (error: any) {

    console.error("API ERROR:", error);

    res.status(500).json({
      error: "Server error",
      message: error?.message
    });

  }
}

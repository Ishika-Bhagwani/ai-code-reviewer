import { GoogleGenAI, Type } from "@google/genai";
import { ReviewReport } from "../types";

const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY
});

export async function analyzeCode(code: string, language: string): Promise<ReviewReport> {
  const model = "gemini-3.1-pro-preview";

  const prompt = `You are a Senior Software Engineer and Security Auditor. Review this ${language} code.
Provide a detailed report in JSON format. Include an analysis of the overall time and space complexity of the provided code.
Also provide specific suggestions on how to improve the time or space complexity if possible (e.g., using a different data structure or algorithm).

Code to Analyze:
${code}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: `You are a strict Code Auditor. Your goal is to identify ACTUAL ERRORS in the code.

CRITICAL: Do NOT flag minor stylistic choices, naming conventions, or optional formatting unless they are objectively wrong or cause the code to fail.

Focus ONLY on:
1. SYNTAX ERRORS: Code that will not compile or run in the specified language (e.g., missing required semicolons in Java/C++, mismatched brackets, invalid keywords).
2. CRITICAL BUGS: Logic errors that will definitely cause a crash, infinite loop, or fundamentally incorrect output.
3. MAJOR SECURITY VULNERABILITIES: Blatant risks like hardcoded credentials or clear injection points.

Do NOT include:
- Suggestions for "cleaner" code or "best practices" if the current code is functional.
- Optional semicolons in languages like JavaScript/TypeScript.
- Indentation or spacing issues.
- Variable naming preferences.

For every issue found:
- line: The 1-based line number.
- category: One of 'Logic', 'Performance', 'Security', 'Style'. Use 'Style' only for actual syntax/grammar errors.
- severity: 'High' or 'Medium'. Do not report 'Low' severity issues.
- label: A short title for the error.
- explanation: Why this is a functional error.
- suggestion: The EXACT code that should replace the 'originalCode' to fix the error.
- originalCode: The exact snippet from the input that needs to be replaced.

Provide a high-level 'summary', a 'score' (0-100), and complexity analysis.`,

      responseMimeType: "application/json",

      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "A 2-sentence overview of code health"
          },
          score: {
            type: Type.NUMBER,
            description: "0-100 code quality score"
          },
          totalIssues: {
            type: Type.NUMBER
          },
          timeComplexity: {
            type: Type.STRING,
            description: "Big O notation for time complexity"
          },
          spaceComplexity: {
            type: Type.STRING,
            description: "Big O notation for space complexity"
          },
          complexitySuggestions: {
            type: Type.STRING,
            description: "Suggestions for improving time/space complexity"
          },
          issues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                line: { type: Type.NUMBER },
                category: {
                  type: Type.STRING,
                  enum: ["Logic", "Performance", "Security", "Style"]
                },
                severity: {
                  type: Type.STRING,
                  enum: ["High", "Medium", "Low"]
                },
                label: { type: Type.STRING },
                explanation: { type: Type.STRING },
                suggestion: { type: Type.STRING },
                originalCode: {
                  type: Type.STRING,
                  description: "The exact line or snippet of code from the input that is being flagged"
                }
              },
              required: [
                "line",
                "category",
                "severity",
                "label",
                "explanation",
                "suggestion",
                "originalCode"
              ]
            }
          }
        },
        required: [
          "summary",
          "score",
          "totalIssues",
          "timeComplexity",
          "spaceComplexity",
          "complexitySuggestions",
          "issues"
        ]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");

  return JSON.parse(text);
}

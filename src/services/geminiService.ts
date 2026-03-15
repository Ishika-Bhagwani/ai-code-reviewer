import { ReviewReport } from "../types";

export async function analyzeCode(code: string, language: string): Promise<ReviewReport> {

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const prompt = `
You are a Senior Software Engineer and Security Auditor.

Review this ${language} code and return a JSON report.

Code:
${code}

Return:
- summary
- score (0-100)
- totalIssues
- timeComplexity
- spaceComplexity
- complexitySuggestions
- issues
`;

const response = await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
{
method: "POST",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify({
contents: [
{
parts: [
{
text: prompt
}
]
}
]
})
}
);

const data = await response.json();

const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

if (!text) {
throw new Error("No response from AI");
}

return JSON.parse(text);

}

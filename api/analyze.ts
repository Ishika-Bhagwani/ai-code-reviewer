import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {

const { code, language } = req.body;

const ai = new GoogleGenAI({
apiKey: process.env.GEMINI_API_KEY
});

const prompt = `You are a senior software engineer. Review this ${language} code and find bugs.

Code:
${code}
`;

const response = await ai.models.generateContent({
model: "gemini-2.0-flash",
contents: prompt
});

res.status(200).json({
result: response.text
});

}

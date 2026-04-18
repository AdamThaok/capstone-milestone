// Thin wrapper around @google/generative-ai.
// Single provider strategy: Gemini does everything (parse, reason, generate).
// Stage files call these helpers; swap provider here to switch models.

import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_TEXT    = "gemini-2.5-flash";   // fast + cheap for parse/spec/compose
const MODEL_VISION  = "gemini-2.5-flash";   // same model handles images
const MODEL_CODEGEN = "gemini-2.5-pro";     // stronger for code-gen output

function client(): GoogleGenerativeAI {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error("GOOGLE_API_KEY not set");
    return new GoogleGenerativeAI(key);
}

/** Send a text prompt, return the raw text response. */
export async function askText(prompt: string, model = MODEL_TEXT): Promise<string> {
    const g = client().getGenerativeModel({ model });
    const res = await g.generateContent(prompt);
    return res.response.text();
}

/** Send text prompt expected to return JSON. Retries on parse failure once. */
export async function askJson<T = unknown>(prompt: string, model = MODEL_TEXT): Promise<T> {
    const text = await askText(
        `${prompt}\n\nRespond with a single valid JSON object. No markdown fences. No prose.`,
        model,
    );
    try {
        return JSON.parse(stripFences(text));
    } catch {
        // Second attempt with stricter wording
        const text2 = await askText(
            `Your previous output was not valid JSON. Try again.\n\n${prompt}\n\nReturn ONLY a JSON object, no fences.`,
            model,
        );
        return JSON.parse(stripFences(text2));
    }
}

/** Send file bytes + prompt (vision or text-file). */
export async function askMultimodal(
    prompt: string,
    file: { mime: string; base64: string },
    model = MODEL_VISION,
): Promise<string> {
    const g = client().getGenerativeModel({ model });
    const res = await g.generateContent([
        { text: prompt },
        { inlineData: { mimeType: file.mime, data: file.base64 } },
    ]);
    return res.response.text();
}

export async function askMultimodalJson<T = unknown>(
    prompt: string,
    file: { mime: string; base64: string },
    model = MODEL_VISION,
): Promise<T> {
    const text = await askMultimodal(
        `${prompt}\n\nRespond with a single valid JSON object. No markdown fences. No prose.`,
        file,
        model,
    );
    return JSON.parse(stripFences(text));
}

export function isGeminiConfigured(): boolean {
    return !!process.env.GOOGLE_API_KEY;
}

export const CODEGEN_MODEL = MODEL_CODEGEN;

function stripFences(s: string): string {
    return s
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
}

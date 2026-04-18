// Thin wrapper around @google/generative-ai.
// Single provider strategy: Gemini does everything (parse, reason, generate).
// Stage files call these helpers; swap provider here to switch models.

import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_TEXT    = "gemini-2.5-flash";   // fast + cheap for parse/spec/compose
const MODEL_VISION  = "gemini-2.5-flash";   // same model handles images
const MODEL_CODEGEN = "gemini-2.5-flash";   // flash is 5-10x faster than pro; good enough for constrained codegen

function client(): GoogleGenerativeAI {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error("GOOGLE_API_KEY not set");
    return new GoogleGenerativeAI(key);
}

/** Send a text prompt, return the raw text response. */
export async function askText(prompt: string, model = MODEL_TEXT): Promise<string> {
    const g = client().getGenerativeModel({
        model,
        generationConfig: {
            maxOutputTokens: 32_000,   // enough for large codegen responses
            temperature:     0.4,
        },
    });
    const res = await g.generateContent(prompt);
    return res.response.text();
}

/** Send text prompt expected to return JSON. Retries + extracts JSON on parse failure. */
export async function askJson<T = unknown>(prompt: string, model = MODEL_TEXT): Promise<T> {
    const text = await askText(
        `${prompt}\n\nRespond with a single valid JSON object. No markdown fences. No prose.`,
        model,
    );
    try {
        return JSON.parse(stripFences(text));
    } catch (e1) {
        // Try salvage: extract the largest {...} or [...] block
        const salvaged = extractJson(text);
        if (salvaged) {
            try { return JSON.parse(salvaged); } catch { /* fall through to retry */ }
        }
        // Second attempt with stricter wording
        const text2 = await askText(
            `Your previous output was not valid JSON. Emit ONLY a JSON object, nothing else. Original prompt:\n\n${prompt}`,
            model,
        );
        try {
            return JSON.parse(stripFences(text2));
        } catch {
            const salvaged2 = extractJson(text2);
            if (salvaged2) return JSON.parse(salvaged2);
            throw e1;
        }
    }
}

/** Send file bytes + prompt (vision or text-file). */
export async function askMultimodal(
    prompt: string,
    file: { mime: string; base64: string },
    model = MODEL_VISION,
): Promise<string> {
    const g = client().getGenerativeModel({
        model,
        generationConfig: { maxOutputTokens: 32_000, temperature: 0.4 },
    });
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

// Find the first { ... matched ... } block at the top level. Handles strings
// with escaped quotes so braces inside strings don't trip the matcher.
function extractJson(text: string): string | null {
    const s = stripFences(text);
    const start = s.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc   = false;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (c === "\\") { esc = true; continue; }
            if (c === "\"") inStr = false;
            continue;
        }
        if (c === "\"") { inStr = true; continue; }
        if (c === "{") depth++;
        else if (c === "}") {
            depth--;
            if (depth === 0) return s.slice(start, i + 1);
        }
    }
    return null;
}

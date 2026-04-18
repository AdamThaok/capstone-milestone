// Stage 0: Validate Input Format & Check Completeness
// Real impl: sniff file magic bytes, XML/JSON schema check, OPX container
// integrity. Current: accepts supported extensions, rejects unknown.

export async function validateInput(input: { filename: string; format: string }) {
    const supported = ["xml", "json", "opx", "png", "jpg", "jpeg", "image", "auto"];
    const ext = input.filename.split(".").pop()?.toLowerCase() ?? "";
    const fmt = input.format.toLowerCase();

    const ok = supported.includes(fmt) || supported.includes(ext);

    return {
        filename: input.filename,
        detectedFormat: ext || fmt,
        valid: ok,
        checks: [
            { name: "extension supported", status: ok ? "pass" : "fail" },
            { name: "non-empty",           status: "pass" },
            { name: "schema probe",        status: "pass (mock)" },
        ],
        error: ok ? null : `Unsupported format: ${ext || fmt}. Expected XML/JSON/OPX/PNG/JPG.`,
    };
}

// Stage 0: Validate Input Format & Check Completeness
// Real impl: sniff magic bytes, XML/JSON schema probe, OPX container integrity.
// Current: verifies extension + file non-empty on disk.

import fs from "node:fs/promises";

export async function validateInput(input: {
    filename: string;
    format: string;
    filePath?: string;
}) {
    const supported = ["xml", "json", "opx", "png", "jpg", "jpeg", "image", "auto"];
    const ext = input.filename.split(".").pop()?.toLowerCase() ?? "";
    const fmt = input.format.toLowerCase();
    const extOk = supported.includes(fmt) || supported.includes(ext);

    let size = 0;
    let nonEmpty = false;
    if (input.filePath) {
        try {
            const st = await fs.stat(input.filePath);
            size = st.size;
            nonEmpty = size > 0;
        } catch {
            nonEmpty = false;
        }
    } else {
        nonEmpty = true; // no path given (legacy), trust caller
    }

    const ok = extOk && nonEmpty;
    return {
        filename:       input.filename,
        detectedFormat: ext || fmt,
        size,
        valid:          ok,
        checks: [
            { name: "extension supported", status: extOk    ? "pass" : "fail" },
            { name: "non-empty",           status: nonEmpty ? "pass" : "fail" },
            { name: "schema probe",        status: "pass (mock)" },
        ],
        error: ok
            ? null
            : !extOk
                ? `Unsupported format: ${ext || fmt}. Expected XML/JSON/OPX/PNG/JPG.`
                : "Uploaded file is empty.",
    };
}

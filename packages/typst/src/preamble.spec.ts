import { describe, expect, it } from "vitest";

import { buildPreamble, formatDiagnostics } from "./preamble";

describe("buildPreamble", () => {
    it("sets the text color from a computed rgb() or rgba() color", () => {
        expect(buildPreamble({ textColor: "rgb(12, 34, 56)" })).toContain("#set text(fill: rgb(12, 34, 56))\n");
        expect(buildPreamble({ textColor: "rgba(1, 2, 3, 0.5)" })).toContain("#set text(fill: rgb(1, 2, 3))\n");
    });

    it("leaves the text color alone when it is missing or not in rgb() form", () => {
        for (const textColor of [ undefined, "oklch(0.5 0.1 200)", "#fff" ]) {
            const preamble = buildPreamble({ textColor });
            expect(preamble).toContain("#set page(");
            expect(preamble).not.toContain("#set text");
        }
    });
});

describe("formatDiagnostics", () => {
    it("reports positions relative to the note's source, one error per line", () => {
        const preamble = "#set page()\n#set text()\n";
        const message = formatDiagnostics([
            { path: "/main.typ", range: "2:9-2:10", severity: "error", message: "unclosed delimiter" },
            { path: "/main.typ", range: "4:0-4:1", severity: "error", message: "unexpected equals sign" }
        ], preamble);
        expect(message).toBe("Line 1, column 10: unclosed delimiter\nLine 3, column 1: unexpected equals sign");
    });

    it("keeps the path of errors in other files and falls back when there are none", () => {
        expect(formatDiagnostics([
            { path: "/lib.typ", range: "0:4-0:6", severity: "error", message: "unknown variable: x" }
        ], "")).toBe("/lib.typ:1:5: unknown variable: x");
        expect(formatDiagnostics([], "")).toBe("Compilation failed.");
    });
});

export const MAIN_FILE = "/main.typ";

export interface TypstRenderOptions {
    /** A CSS color in the `rgb(r, g, b)` form `getComputedStyle()` returns. Other forms are ignored. */
    textColor?: string;
}

export interface TypstDiagnostic {
    path: string;
    /** Zero-based `line:column-line:column`. */
    range: string;
    severity: string;
    message: string;
}

/**
 * Builds the set rules placed before the note's source. The note's own set rules come later, so they
 * override these.
 */
export function buildPreamble({ textColor }: TypstRenderOptions): string {
    const rules = [ "#set page(width: 16cm, height: auto, margin: 1em, fill: none)" ];
    const rgb = textColor?.match(RGB_COLOR);
    if (rgb) {
        rules.push(`#set text(fill: rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]}))`);
    }
    return rules.map((rule) => `${rule}\n`).join("");
}

/** Formats compiler errors with line and column numbers relative to the note's source. */
export function formatDiagnostics(diagnostics: TypstDiagnostic[], preamble: string): string {
    if (!diagnostics.length) {
        return "Compilation failed.";
    }

    const preambleLines = preamble.split("\n").length - 1;
    return diagnostics.map((diagnostic) => formatDiagnostic(diagnostic, preambleLines)).join("\n");
}

function formatDiagnostic({ path, range, message }: TypstDiagnostic, preambleLines: number) {
    const [ line, column ] = range.split(/[:-]/).map(Number);
    if (path !== MAIN_FILE) {
        return `${path}:${line + 1}:${column + 1}: ${message}`;
    }
    return `Line ${line - preambleLines + 1}, column ${column + 1}: ${message}`;
}

const RGB_COLOR = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/;

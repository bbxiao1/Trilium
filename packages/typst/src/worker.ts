import { createTypstCompiler, createTypstRenderer, loadFonts } from "@myriaddreamin/typst.ts";
import rendererWasm from "@myriaddreamin/typst-ts-renderer/wasm?url";
import compilerWasm from "@myriaddreamin/typst-ts-web-compiler/wasm?url";

import { MAIN_FILE, type TypstDiagnostic } from "./preamble";

export interface WorkerRequest {
    id: number;
    source: string;
}

export type WorkerResponse =
    | { id: number; svg: string }
    | { id: number; diagnostics: TypstDiagnostic[] }
    | { id: number; error: string };

const FONT_URLS = Object.values(
    import.meta.glob<string>("../fonts/*", { query: "?url", import: "default", eager: true })
);

let engine: Promise<Engine> | undefined;
let queue = Promise.resolve();

// Requests run one at a time, since they all share the compiler's single main file.
addEventListener("message", (e: MessageEvent<WorkerRequest>) => {
    queue = queue.then(async () => postMessage(await compile(e.data)));
});

type Engine = Awaited<ReturnType<typeof createEngine>>;

async function compile({ id, source }: WorkerRequest): Promise<WorkerResponse> {
    try {
        const { compiler, renderer } = await getEngine();
        compiler.addSource(MAIN_FILE, source);
        const { result, diagnostics } = await compiler.compile({ mainFilePath: MAIN_FILE, diagnostics: "full" });
        if (!result) {
            return { id, diagnostics: (diagnostics ?? []).filter((d) => d.severity === "error") };
        }

        const svg = await renderer.renderSvg({
            format: "vector",
            artifactContent: result,
            data_selection: { body: true, defs: true, css: true, js: false }
        });
        return { id, svg };
    } catch (e) {
        return { id, error: e instanceof Error ? e.message : String(e) };
    }
}

function getEngine() {
    if (!engine) {
        engine = createEngine();
        engine.catch(() => {
            engine = undefined;
        });
    }
    return engine;
}

async function createEngine() {
    const compiler = createTypstCompiler();
    const renderer = createTypstRenderer();
    await Promise.all([
        compiler.init({
            getModule: () => compilerWasm,
            beforeBuild: [ loadFonts(FONT_URLS, { assets: false }) ]
        }),
        renderer.init({ getModule: () => rendererWasm })
    ]);
    return { compiler, renderer };
}

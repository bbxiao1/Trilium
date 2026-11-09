import { buildPreamble, formatDiagnostics, type TypstRenderOptions } from "./preamble";
import type { WorkerRequest, WorkerResponse } from "./worker";

export type { TypstRenderOptions };

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, (response: WorkerResponse) => void>();

/**
 * Compiles a Typst document into a single SVG with its pages stacked vertically. The compiler runs in
 * a Web Worker that starts on the first call.
 *
 * @throws an `Error` listing the compiler errors when the document does not compile.
 */
export async function renderTypstSvg(source: string, options: TypstRenderOptions = {}): Promise<string> {
    const preamble = buildPreamble(options);
    const response = await request(preamble + source);
    if ("svg" in response) {
        return response.svg;
    }
    if ("diagnostics" in response) {
        throw new Error(formatDiagnostics(response.diagnostics, preamble));
    }
    throw new Error(response.error);
}

function request(source: string) {
    const id = nextId++;
    return new Promise<WorkerResponse>((resolve) => {
        pending.set(id, resolve);
        getWorker().postMessage({ id, source } satisfies WorkerRequest);
    });
}

function getWorker() {
    if (worker) {
        return worker;
    }

    const newWorker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    newWorker.addEventListener("message", (e: MessageEvent<WorkerResponse>) => {
        pending.get(e.data.id)?.(e.data);
        pending.delete(e.data.id);
    });
    newWorker.addEventListener("error", (e) => {
        console.error("Typst worker failed", e);
        newWorker.terminate();
        worker = undefined;
        for (const [ id, resolve ] of pending) {
            resolve({ id, error: e.message || "The Typst worker failed to start." });
        }
        pending.clear();
    });
    worker = newWorker;
    return newWorker;
}

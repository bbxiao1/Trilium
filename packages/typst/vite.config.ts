import { defineConfig } from "vite";

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/packages/typst",
    test: {
        watch: false,
        globals: true,
        environment: "happy-dom",
        include: ["src/**/*.spec.ts"]
    }
}));

# Typst notes for a personal Trilium fork: implementation plan

> Bootstrap document for adding Typst support (live split-view preview) and an optional Helix keymap to a personal Trilium fork, designed to rebase cleanly onto upstream releases.
>
> **Base:** upstream tag `v0.106.0` (`c0fdceba3b`, 2026-09-25). The file survey in §6–§7 was done against a later `main` (`c12c814`), so its "~line" references are approximate; re-locate them with the `grep` commands in §11.

---

## 0. Status (2026-10-08)

| Phase | Commit | State |
|---|---|---|
| 0: spike | (none) | **Done.** Wasm init ~95 ms, first compile ~180 ms, warm recompiles 5–8 ms. |
| 1: `packages/typst` | A `77f41cdbb4` | **Done.** |
| 1: wire into client | B `ea2303b882` | **Done.** |
| 1: note previews (§6.3) | (none) | Not started (optional). |
| 2: Helix keymap | C | Not started. |
| 3: later improvements | (none) | Not started. |

Branch `xba-fork` = `v0.106.0` + this plan + A + B. On 2026-10-08 it was moved off a later `main` onto `v0.106.0` by rebasing only the fork commits (§4). Verified on that base: `pnpm typecheck` clean; client (note types, NoteDetail, fnote and neighbours), `typst`, `commons`, `codemirror` and `highlightjs` specs green; `pnpm client:build` emits the Typst chunk, the worker, both wasm files and all 17 fonts. **Not yet verified in the running app**: the §9 checklist is still open.

---

## 1. Goals and constraints

**Goals**

- Edit Typst source in a note and see a live rendered preview next to it, the same way Markdown and Mermaid notes work.
- Keep the vim keymap working in the Typst source pane, and add an optional Helix keymap.
- Work fully offline, including in protected notes.

**Constraints (personal fork)**

- **Rebase friction is the main cost.** Every line changed in an upstream file is a potential conflict on every release. New files never conflict.
- No need for upstream polish: no i18n for all locales, no demo document, no docs pages.

**Non-goals (for now)**

- Typst inside text notes (CKEditor).
- A full language server (tinymist) in the browser.
- Server-side compilation, or rendering on shared pages.

---

## 2. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Note representation | **Code note with mime `text/x-typst`**, not a new note type | No sync-version bump, no server note-type registration, no type-selector changes. An unpatched Trilium (or a sync peer) just sees a plain code note, so data degrades gracefully. Upstream Markdown uses exactly this pattern (`type: "code"` + mime). |
| Preview widget | Reuse upstream **`SvgSplitEditor`** | It already gives split/source/preview modes, pan and zoom, error display with "last valid render", and **automatically saves the rendered SVG as an attachment**. Mermaid uses it. |
| Compiler | **typst.ts** (`@myriaddreamin/typst.ts` + `typst-ts-web-compiler` + `typst-ts-renderer`, v0.7.0) in a **Web Worker** | Mature, used by `typst-preview`/tinymist, compiles fully client-side. A worker keeps typing responsive. |
| Syntax highlighting | **`codemirror-lang-typst`** (kxxt, Apache-2.0, v0.6.0) | Drop-in CodeMirror 6 language. Fall back to a minimal hand-written Lezer grammar only if it doesn't fit. |
| Editor feature bundle (`@vedivad/codemirror-typst`) | **Not used** | Ships its own preset editor setup, which may fight Trilium's CodeMirror config and keymaps. Revisit later for diagnostics/completion via its engine package only. |
| Helix | **`codemirror-helix`** (jrvidal, MPL-2.0, v0.6.0) behind an option next to the existing vim one | Upstream already wires vim in one place; Helix slots in beside it. |
| Where new code lives | New workspace package **`packages/typst`** | Never conflicts on rebase. |

---

## 3. How the pieces fit

```
FNote (type "code", mime "text/x-typst")
   │  isTypst()
   ▼
NoteDetail.tsx  ──dispatch──►  "typst" widget (note_types.tsx registry)
                                   │
                                   ▼
                     Typst.tsx  (thin, in apps/client)
                                   │ renderSvg(content)
                                   ▼
                     SvgSplitEditor  (upstream, unchanged)
                       ├─ left:  EditableCode → CodeMirror
                       │           ├─ language: codemirror-lang-typst
                       │           └─ keymap:   vim | helix  (from options)
                       ├─ right: SVG preview, pan/zoom, error badge
                       └─ on save: POST attachment "typst-export.svg"
                                   ▲
                                   │ svg string
                     packages/typst  (new, all fork-owned)
                       ├─ client.ts   lazy-start worker, debounce, cancel stale jobs
                       ├─ worker.ts   typst.ts compiler + renderer
                       ├─ preamble.ts page/theme defaults injected before user source
                       └─ assets      wasm + fonts, bundled (no CDN)
```

---

## 4. Fork and branch layout

```
upstream/main  ──●──●──●── vX.Y.Z
                              \
xba-fork                       A ── B ── C
```

Keep the fork as a few commits on a release tag, rebased as a unit (branch `xba-fork`):

- **`initial plan`**: this file. New file only.
- **A: `feat(typst): add packages/typst`**: new files only. Never conflicts.
- **B: `feat(typst): wire Typst notes into client`**: the small upstream edits in §6.
- **C: `feat(editor): helix keymap option`**: optional, independent of A and B. Not written yet.

`origin` is the personal fork (`bbxiao1/Trilium`); add upstream once with
`git remote add upstream https://github.com/TriliumNext/Trilium.git`.

Rebase routine on each upstream release:

```bash
git fetch upstream --tags
git rebase --onto vNEW vOLD xba-fork      # replays only the fork commits
git range-diff vOLD..xba-fork@{1} vNEW..xba-fork   # review what changed in B/C
pnpm install && pnpm typecheck && pnpm --filter client test note_types NoteDetail
git push --force-with-lease origin xba-fork
```

**Always pass the old base.** A plain `git rebase vNEW` (or `-i`) from a branch that started on
`main` replays every upstream commit since the tag, over a thousand of them, with merges flattened.

**Lockfile conflicts**: take the base side (`git checkout --ours pnpm-lock.yaml` during the rebase),
then `pnpm install --lockfile-only` and stage it. Use pnpm 12 (the version in `packageManager`);
pnpm 11 rewrites the whole file. On NixOS the npm-distributed pnpm 12 binary does not run; use a
Nix-built one with `npm_config_manage_package_manager_versions=false`, and drop any entries it adds
for packages the base lists under `ignoredOptionalDependencies` (e.g. `@parcel/watcher`).

**Expect B to conflict where upstream reworked the new-note menu** (`note_types.ts`, its spec):
keep the base side and re-add only the Typst lines (§6.0, "New-note menu entry"). Where the base
has upstream's grouped menu (`MENU_GROUPS`, a Code-language submenu, as `main` did after v0.106.0),
also put Typst after Markdown in the first `MENU_GROUPS` group and filter `TYPST_NOTE_TYPE_MIME` out of
`getCodeLanguageItems()` next to Markdown; the pre-rebase commit `d7b55d47ba` shows that version.

Keep commit B's diff small enough to re-apply by hand if a rebase gets messy. The §6.1 table plus §6.0 double as the re-application checklist.

---

## 5. Phase 0: spike (done)

Result: the API below works with typst.ts 0.7.0 pinned; wasm init ~95 ms, first compile ~180 ms,
warm recompiles 5–8 ms; no extra debounce was added. Kept for reference:

Validate typst.ts in isolation before integrating. In a scratch Vite project:

1. Install `@myriaddreamin/typst.ts`, `@myriaddreamin/typst-ts-web-compiler`, `@myriaddreamin/typst-ts-renderer`.
2. Inside a Web Worker, initialise the compiler and renderer from **local** wasm URLs (Vite `?url` imports), load the bundled fonts, compile a string, and return an SVG string.
3. Measure:
   - cold start time (wasm instantiate + font load)
   - warm recompile time for a 1–3 page note after a one-character edit
   - output SVG size for a multi-page document
4. Confirm the exact typst.ts 0.7 API for: setting main content, adding fonts, mapping extra files (for images later), and producing a single merged SVG for all pages. The API has shifted between minor versions, so pin the version once this works.

**Exit criteria:** warm recompiles feel instant (target under ~100 ms for typical notes), and you have a working `compile(source) → svg` in a worker.

---

## 6. Phase 1: wire into Trilium (commits A and B, done)

### 6.0 As built, where it differs from the sketch below

- **Page width is 16cm, not `auto`**: with `width: auto` prose never wraps. Preamble:
  `#set page(width: 16cm, height: auto, margin: 1em, fill: none)` plus
  `#set text(fill: rgb(r, g, b))` from `getComputedStyle(document.body).color`. No `#typstRaw`
  label; the note's own set rules override the preamble.
- **`packages/typst` has no `client.ts` or `fonts.ts`**: worker lifecycle lives in `index.ts`,
  the preamble and diagnostic formatting in `preamble.ts` (with `preamble.spec.ts`). The worker
  handles requests one at a time (they share `/main.typ`) and retries the wasm load after a
  failure. Stale responses are not dropped; `SvgSplitEditor` debouncing has been enough.
- **Fonts**: Typst's 17 default text fonts (8.4 MB, typst-assets v0.13.1) are vendored in
  `packages/typst/fonts/` and emitted via `import.meta.glob`. Compiler wasm is 28 MB (11 MB gzip).
  No `optimizeDeps.exclude` and no `vite.config.mts` change were needed.
- **Syntax highlighting** uses `codemirror-lang-typst/lezer` (`typst_lezer()`): the package's default
  `typst()` needs a wasm plugin in Vite. highlight.js has no Typst grammar, so
  `packages/highlightjs/src/syntax_highlighting.ts` maps `text/x-typst` to `null` (required by its
  mime table type).
- **New-note menu entry** (was "later"): `TYPST_NOTE_TYPE_MIME` and a `NOTE_TYPES` entry after
  Markdown in `apps/client/src/services/note_types.ts`; `isCurrentNoteType()` ticks only the Typst
  entry for a Typst note; `selectableNoteTypes(true)` leaves it out beside the MIME list. The entry
  sets the mime itself, so it works where `codeNotesMimeTypes` predates Typst.
- **`BLOB_BACKED_TYPES`** in `NoteDetail.tsx` includes `"typst"`, so a withheld blob shows the stub
  instead of an editor that saves empty content back.
- **`Typst.tsx`** passes no `noteType` (the default suits) and uses `editable_code.placeholder`.
- **Extra upstream edits**: `note_types.ts` + spec, `NoteDetail.spec.ts`, `translation.json`
  (`note_types.typst`), `highlightjs`, `pnpm-lock.yaml`, and `tsconfig` references to
  `packages/typst` in `tsconfig.json`, `apps/client/tsconfig.json` and `tsconfig.app.json`.

The original plan follows.

### 6.1 Upstream files touched

| # | File | Change | Size |
|---|---|---|---|
| 1 | `packages/commons/src/lib/mime_type.ts` | Add `{ title: "Typst", mime: "text/x-typst", mdLanguageCode: "typst", default: true }` to the mime list (next to the Markdown entry, ~line 129). | 1 line |
| 2 | `packages/codemirror/src/syntax_highlighting.ts` | Add a loader: `"text/x-typst": async () => (await import("codemirror-lang-typst")).typst()`. `typst` is a confirmed export of v0.6.0. The package also exports completion and lint sources (`typstCompletionSource`, `typstLezerLinter`) to try later. | 1–3 lines |
| 3 | `packages/codemirror/package.json` | Add `codemirror-lang-typst`. | 1 line |
| 4 | `apps/client/src/entities/fnote.ts` | Add `isTypst() { return this.type === "code" && this.mime === "text/x-typst"; }` next to `isMarkdown()` (~line 1182). | 3 lines |
| 5 | `apps/client/src/widgets/note_types.tsx` | Add `"typst"` to `ExtendedNoteType` (line 15), and a registry entry `typst: { view: () => import("./type_widgets/typst/Typst"), className: "note-detail-typst", … }` modelled on the `mermaid` entry (~line 92). | ~6 lines |
| 6 | `apps/client/src/widgets/NoteDetail.tsx` | In the type dispatch (~line 418), add `else if (note.isTypst()) { resultingType = "typst"; }` **before** the generic `type === "code"` branches. | 2 lines |
| 7 | `apps/client/src/widgets/FloatingButtonsDefinitions.tsx` (~line 120) and `apps/client/src/widgets/ribbon/NoteActionsCustom.tsx` (~line 229) | Add `|| note.isTypst()` to the condition that shows the split/source/preview toggle. | 1 line each |
| 8 | `apps/client/package.json` | Add `@triliumnext/typst` (workspace) dependency. | 1 line |

New file in `apps/client` (fork-owned, no conflict):

- `apps/client/src/widgets/type_widgets/typst/Typst.tsx`: thin wrapper, ~40 lines, mirroring `mermaid/Mermaid.tsx`:

```tsx
// Sketch: mirror type_widgets/mermaid/Mermaid.tsx
import { useCallback } from "preact/hooks";
import { renderTypstSvg } from "@triliumnext/typst";
import SvgSplitEditor from "../helpers/SvgSplitEditor";
import { TypeWidgetProps } from "../type_widget";

export const TYPST_ATTACHMENT_TITLE = "typst-export.svg";

export default function Typst(props: TypeWidgetProps) {
    const renderSvg = useCallback(async (content: string) => {
        if (!content.trim()) return "";
        return renderTypstSvg(content, { theme: currentThemeColors() });
    }, []);

    return (
        <SvgSplitEditor
            attachmentTitle={TYPST_ATTACHMENT_TITLE}
            renderSvg={renderSvg}
            noteType="code"   // prop is typed NoteType and flows into EditableCode; the note really is a code note
            {...props}
        />
    );
}
```

Things to check when writing it:

- `NOTE_TYPE_IMAGE_ATTACHMENTS` in `packages/commons/src/lib/notes.ts` is keyed by real `NoteType`s. Don't add Typst there (it would mean touching another upstream file). `attachmentTitle` is a plain string prop, so a local constant is enough.
- The `noteType` prop is typed as `NoteType` and passed through to `EditableCode` (`code/Code.tsx`, line 93, default `"code"`). Pass `"code"`, since that is what the note is.
- The source pane is `EditableCode` from `code/Code.tsx`, which already reads `vimKeymapEnabled`. Vim works in the Typst pane with no extra work.

### 6.2 `packages/typst` (commit A)

```
packages/typst/
  package.json          name "@triliumnext/typst", deps: typst.ts trio (pinned)
  src/index.ts          export renderTypstSvg(source, opts): Promise<string>
  src/client.ts         worker lifecycle, request ids, debounce, drop stale results
  src/worker.ts         init compiler+renderer once; compile → svg
  src/preamble.ts       page/theme defaults (see below)
  src/fonts.ts          which fonts to load, lazily
  assets/               (optional) fonts if not taken from typst-assets
```

**Worker protocol:** `{ id, source, preamble } → { id, svg } | { id, error, diagnostics }`. The client keeps only the latest `id` per editor and ignores older responses. `SvgSplitEditor` already debounces on content change; add a short extra debounce (~150 ms) only if needed.

**Errors:** throw from `renderTypstSvg` with the first diagnostic's message and line. `SvgSplitEditor` shows the error and keeps the last valid render.

**Preamble (prepended to the user's source):**

```typst
#set page(width: auto, height: auto, margin: 1em, fill: none)
#set text(fill: rgb("<from CSS var>"), size: 11pt)
```

- `fill: none` and an injected text colour make the preview follow Trilium's light/dark theme. Read the colour from computed CSS (e.g. `--main-text-color`) at render time and include it in the cache key.
- Let notes opt out of the preamble, e.g. with a `#typstRaw` label or simply because the user's own `#set page(...)` comes after it and wins. Typst applies later set rules over earlier ones.
- Adjust the page line numbers in diagnostics by the preamble's line count.

**Bundling the wasm with Vite (`apps/client/vite.config.mts`):**

- Import the wasm files with `?url` inside `packages/typst` so Vite emits them as assets. No CDN, so it works offline and in Electron.
- If dependency pre-bundling breaks the wasm glue, add the three typst.ts packages to `optimizeDeps.exclude`. This is one more upstream line; avoid it if the spike shows it isn't needed.
- The server already sets `contentSecurityPolicy: false` (`apps/server/src/app.ts`), so wasm instantiation is not blocked by CSP.

**Payload:** roughly 7.6 MB compiler wasm + 4.4 MB text/math fonts + 0.35 MB renderer (typst.ts docs). It loads only when a Typst note is first opened. Skip CJK and emoji fonts unless you need them (+1.4 MB and +14.7 MB).

### 6.3 Note previews (optional, still client-only)

`SvgSplitEditor` stores `typst-export.svg` as an attachment on save. To show it in note lists, Include Note, and tooltips:

- `apps/client/src/services/content_renderer.ts` → in `getContentType()` (~line 810) return `"typst"` for `entity.isTypst()`. In the render switch (~line 140), render that attachment as an image, the way `["image", "canvas", "mindMap", "spreadsheet"]` are handled.
- This is ~6 more upstream lines. Do it only if you miss previews; the editor works without it.

---

## 7. Phase 2: Helix keymap (commit C)

The vim option is wired through exactly these places. Helix goes beside each:

| File | Existing vim wiring | Helix change |
|---|---|---|
| `packages/commons/src/lib/options_interface.ts` | `vimKeymapEnabled: boolean` | add `helixKeymapEnabled: boolean` |
| `packages/trilium-core/src/services/options_init.ts` (~line 184) | `{ name: "vimKeymapEnabled", value: "false", isSynced: false }` | same for helix |
| `packages/trilium-core/src/routes/api/options.ts` (~line 64) | `"vimKeymapEnabled"` in the allow-list | add `"helixKeymapEnabled"` |
| `apps/client/src/widgets/type_widgets/options/code_notes.tsx` (~lines 40, 82) | `FormToggle` for vim | second toggle; turning one on turns the other off |
| `apps/client/src/widgets/type_widgets/code/Code.tsx` (~lines 103, 163) | reads option → `vimKeybindings` prop | read helix option → `helixKeybindings` prop |
| `packages/codemirror/src/index.ts` (~lines 65, 123) | `EditorConfig.vimKeybindings`; `if (config.vimKeybindings) extensions.push(vim())` | `helixKeybindings?: boolean`; `else if (config.helixKeybindings) extensions.push(helix(), helixCommands)` |
| `packages/codemirror/package.json` | `@replit/codemirror-vim` | add `codemirror-helix` |

Two separate booleans conflict less on rebase than replacing the vim option with an enum. Accept the slight awkwardness of mutual exclusion in the UI.

Helix custom commands (`commands.of([...])` from `codemirror-helix`):

- `:w` → trigger Trilium's save (spaced update flush).
- `:q` → close tab, if you want it.

**Shortcut conflicts to test:** `Esc` (Trilium may use it to leave the editor or close dialogs), `Ctrl+J` and other global shortcuts while in Helix normal mode, `Space`-prefixed Helix menus, and focus leaving the editor. Fix in the Helix command layer, not in Trilium's shortcut service, to keep upstream untouched.

Because every CodeMirror editor goes through `Code.tsx` → `packages/codemirror`, the Helix option applies to Code, Markdown, Mermaid and Typst notes alike.

---

## 8. Phase 3: later improvements (pick as needed)

- **Images and other notes as files.** Resolve `#image("name.png")` against the note's attachments and child image notes. Fetch the bytes on the client and map them into the compiler's virtual filesystem before compiling.
- **Multi-note documents.** Map child Typst notes to `child-title.typ` so `#import`/`#include` work.
- **Typst Universe packages (`@preview/...`).** Needs network on first use. Add a cache (e.g. a hidden note or IndexedDB) to keep things working offline.
- **Diagnostics in the editor.** Feed compiler diagnostics into CodeMirror's `lint` extension via `editor.setNamedExtension(...)`, the same hook Mermaid uses for its linter.
- **Source ↔ preview navigation.** typst.ts exposes span information. Clicking the preview to jump to the source line is a nice-to-have.
- **PDF export.** Compile to PDF in the worker and download it. This sits nicely next to Trilium's own print/PDF flow without touching it.

---

## 9. Test checklist

Unit-tested so far: `isTypst()` routing and the blob stub (`NoteDetail.spec.ts`), the menu entry
(`note_types.spec.ts`), preamble and diagnostics (`packages/typst`). Everything below still needs a
manual pass in the app. Adapted from Trilium's own note-type checklist:

- [ ] Create a code note, choose **Typst** as the language → split view with a preview appears.
- [ ] Typing updates the preview; a syntax error shows the error badge and keeps the last good render.
- [ ] Switch split / source / preview modes; the mode persists per note.
- [ ] Read-only note: the source is not editable and the preview still renders.
- [ ] Refresh while on the note; navigate away and back; two tabs with different Typst notes.
- [ ] Light ↔ dark theme switch re-renders with the right text colour.
- [ ] Protected note: renders inside a protected session.
- [ ] Desktop offline: first Typst note opens with no network (wasm and fonts bundled).
- [ ] Server/web build: assets are served and the worker starts.
- [ ] Revisions: an old revision shows source correctly.
- [ ] Export/import ZIP round-trip keeps mime `text/x-typst`.
- [ ] Sync with an **unpatched** instance: the note appears as a plain code note and comes back intact.
- [ ] Vim on: works in the Typst source pane. Helix on: works; `:w` saves; global shortcuts don't fire in normal mode.

---

## 10. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `SvgSplitEditor`/`SplitEditor` props change upstream (the client is mid-migration from jQuery widgets to Preact) | Medium | `Typst.tsx` is ~40 lines; port it. Check `git log -p -- apps/client/src/widgets/type_widgets/helpers/` after each rebase. |
| `NoteDetail.tsx` dispatch refactored | Medium | It's a 2-line change; re-apply by hand. Search for `isMarkdown()` to find the new spot. |
| typst.ts lags behind Typst language releases | Medium | Pin versions; upgrade deliberately. Your notes only need the version you write against. |
| Large wasm payload on mobile web | Low (personal use) | Lazy-loaded only for Typst notes. Skip CJK/emoji fonts. |
| `codemirror-lang-typst` or `codemirror-helix` go stale | Low–medium | Both sit behind one import each. Swap or vendor them into `packages/typst`. |
| Helix keymap conflicts with Trilium shortcuts | Medium | Handle in Helix commands/keymap config; test the list in §7. |

---

## 11. Upstream reference points (to re-locate after rebases)

```bash
grep -rn "isMarkdown()" apps/client/src --include=*.ts --include=*.tsx | grep -v spec   # every place Markdown is special-cased
grep -rn "vimKeymapEnabled\|vimKeybindings" apps packages --include=*.ts --include=*.tsx | grep -v node_modules
grep -n "mermaid" apps/client/src/widgets/note_types.tsx
grep -n '"text/x-markdown"' packages/codemirror/src/syntax_highlighting.ts packages/commons/src/lib/mime_type.ts
```

Reference implementations to copy from:

- `apps/client/src/widgets/type_widgets/mermaid/Mermaid.tsx`: the closest analogue (SVG preview + linter hook).
- `apps/client/src/widgets/type_widgets/helpers/SvgSplitEditor.tsx`: preview, error handling, attachment saving.
- `apps/client/src/services/note_types.ts`: how Markdown is exposed as a code-note variant (`MARKDOWN_NOTE_TYPE_MIME`), if you later want Typst as its own entry in the "new note" menu.

## 12. Sources

- Trilium developer guide, note type checklist: https://docs.triliumnotes.org/developer-guide/concepts/note-types/new-note-type/checklist.html
- Trilium Markdown note type: https://docs.triliumnotes.org/user-guide/note-types/markdown
- typst.ts, getting started (module sizes, wasm split): https://myriad-dreamin.github.io/typst.ts/cookery/get-started.html
- codemirror-lang-typst: https://github.com/kxxt/codemirror-lang-typst
- codemirror-helix: https://gitlab.com/_rvidal/codemirror-helix
- typst-web / @vedivad/codemirror-typst (not used, for later): https://github.com/ost-fh/typst-web

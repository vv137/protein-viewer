# Protein Viewer — VSCode Extension

A VSCode extension that renders molecular structure files (PDB, CIF/mmCIF, mol, mol2, sdf, xyz, gro, etc.) inside a VSCode webview using [Mol*](https://github.com/molstar/molstar).

## Goals

1. **Open structures from the workspace** — clicking a `.pdb` / `.cif` / etc. file in the VSCode Explorer opens it in a Mol* viewer tab (custom editor).
2. **Drag-and-drop from the Explorer** — dragging a file from VSCode's left Explorer onto an open viewer adds it to the current scene.
3. **Open by path** — a command (and URI handler) to open arbitrary local paths, including paths outside the current workspace.
4. **Stay compatible with upstream Mol\*** — do not fork or patch Mol\*. Consume it as a regular npm dependency and only call its public API. Upgrading Mol\* must be `npm update molstar` + a smoke test, nothing more.

## Non-goals

- Editing structures (we are a viewer, not an editor).
- Re-implementing Mol\* features. If something is missing, file an issue upstream or use a Mol\* plugin/extension point — never patch sources.
- Server / cloud rendering. Everything runs locally in the webview.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ VSCode Extension Host (Node)                               │
│                                                            │
│  src/extension.ts        ── activate(), command + URI      │
│  src/viewerProvider.ts   ── CustomReadonlyEditorProvider   │
│  src/messages.ts         ── typed host ↔ webview messages  │
│                                                            │
│        │ webview.postMessage / onDidReceiveMessage         │
│        ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Webview (browser)                                    │  │
│  │   media/viewer.html                                  │  │
│  │   media/viewer.js   ── thin shim around Mol*         │  │
│  │       imports: molstar/build/viewer/molstar.js       │  │
│  │       imports: molstar/build/viewer/molstar.css      │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### Why this shape

- **CustomReadonlyEditorProvider** is the right VSCode primitive for "open a file and show a custom view." It gives us a tab per file, integrates with the Explorer's double-click / right-click → Open With, and survives editor restore.
- **Webview**, not a language-server view, because Mol\* is a WebGL app that needs a real DOM.
- **No Mol\* source edits.** We load Mol\*'s prebuilt bundle (`molstar/build/viewer/molstar.js` + `.css`) and drive it through the public `Viewer` / `PluginContext` API. If we need behavior Mol\* doesn't expose, we add it in `viewer.js` around Mol\*, not inside it.

### File flow

1. User opens `foo.cif` → VSCode invokes our custom editor.
2. Extension reads the file bytes (via `vscode.workspace.fs`), creates a webview, sends `{ kind: 'load', name, format, data }` as a message.
3. Webview shim calls `viewer.loadStructureFromData(data, format)` from Mol\*.
4. For drag-and-drop: the extension's `TreeDragAndDropController` consumer or the webview's `dragover`/`drop` handlers receive a VSCode URI list, the extension resolves them to bytes, and sends additional `load` messages to the existing webview.

## Project layout

```
protein-viewer/
├── package.json              ── extension manifest + npm config
├── tsconfig.json
├── esbuild.config.mjs        ── bundles extension host code only
├── src/
│   ├── extension.ts
│   ├── viewerProvider.ts
│   ├── messages.ts
│   └── fileTypes.ts          ── list of supported extensions / Mol* format ids
├── media/
│   ├── viewer.js             ── webview shim around Mol*'s prebuilt bundle
│   └── viewer.css            ── only our chrome; Mol*'s css comes from the package
├── README.md
├── LICENSE
└── DEVELOPMENT.md
```

`media/` is what we ship into the webview. We `localResourceRoots` it plus `node_modules/molstar/build/viewer/` so the webview can load Mol\*'s prebuilt assets directly without copying them.

## Supported formats (initial)

PDB (`.pdb`, `.ent`), mmCIF (`.cif`, `.mmcif`, `.bcif`), MOL (`.mol`), MOL2 (`.mol2`), SDF (`.sdf`), XYZ (`.xyz`), GRO (`.gro`), PSF + DCD/XTC trajectories (later). The mapping from extension to Mol\* format id lives in `src/fileTypes.ts` so adding a format is one line.

## Mol\* upgrade policy

- Pin Mol\* in `package.json` with a caret (`^`) so patch/minor upgrades land via `npm update`.
- Only import from `molstar/build/viewer/molstar.js` (the prebuilt UMD/ESM bundle) and `molstar/lib/...` public entry points. **Never** import from `molstar/src/...`.
- If a Mol\* breaking change forces us to change call sites, do it in `media/viewer.js` only — the extension host code shouldn't know Mol\* exists beyond the format-id list.
- Keep a tiny smoke test (load 1crn.pdb, check that the canvas renders) so upgrades are verifiable.

## Development workflow

```sh
npm install
npm run watch          # esbuild --watch on extension host
# F5 in VSCode → Extension Development Host
```

Webview assets are static; no bundler needed for `media/` — the browser loads them directly. This keeps Mol\* untouched and out of our build graph.

## Open questions / future work

- Multi-structure scenes: do we open each file in its own tab, or accumulate into one tab via drag-and-drop? Current plan: one tab per "first" file, drag-and-drop adds to that tab.
- Trajectory support (DCD/XTC) needs a topology file pairing — UI for that is TBD.
- Remote PDB fetch (by 4-letter code) — easy to add via a command since Mol\* already has a downloader.

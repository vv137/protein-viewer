# Protein Viewer (Mol\*)

View molecular structure files directly inside VS Code. Powered by [Mol\*](https://github.com/molstar/molstar).

![status](https://img.shields.io/badge/status-alpha-orange) ![license](https://img.shields.io/badge/license-MIT-blue) ![molstar](https://img.shields.io/badge/Mol*-5.x-green)

## Features

- Renders PDB, mmCIF, BCIF, MOL, MOL2, SDF, XYZ, GRO inside an editor tab.
- **Drag-and-drop** from VS Code's Explorer into an open viewer to add structures to the same scene.
- **Open by path** for files outside the workspace.
- **Open an empty viewer** from the command palette — load files into it later by drag-and-drop.
- Full Mol\* feature set available: representations, selections, **superposition (incl. TM-align)**, animations, screenshots, Download Structure from RCSB / PDBe / AlphaFold, and more.

## Supported file types

| Format           | Extensions              |
| ---------------- | ----------------------- |
| PDB              | `.pdb`, `.ent`          |
| mmCIF            | `.cif`, `.mmcif`        |
| Binary mmCIF     | `.bcif`                 |
| MOL / MOL2 / SDF | `.mol`, `.mol2`, `.sdf` |
| XYZ              | `.xyz`                  |
| GROMACS          | `.gro`                  |

The default editor for these files is still the text editor — the Mol\* viewer opens on demand.

## How to open a structure

- **Explorer right-click** → *Protein Viewer: Open in Mol\* Viewer*.
- **Editor tab right-click** → same option.
- **Command palette** (Ctrl/Cmd+Shift+P):
  - *Protein Viewer: Open in Mol\* Viewer* (when a supported file is the active editor)
  - *Protein Viewer: Open by Path…* (any absolute path)
  - *Protein Viewer: Open Empty Viewer*
- **VS Code's built-in "Open With…"** menu also lists the Mol\* viewer for any supported file.
- **URI handler**: `vscode://vv137xyz.molstar-viewer/open?path=/abs/path/to/file.pdb`

## Drag-and-drop

Drag any supported file from the VS Code Explorer onto an open Mol\* tab to add it to the current scene. **Hold `Shift` while dropping** — without it, VS Code's workbench-level drop handler intercepts the file and opens it in a new editor instead of letting the webview receive the event. With Shift, the drop is forwarded to the viewer and the file is added to the current scene.

Useful for superposing two or more structures (Mol\*'s right-side **Superposition** panel → *By TM-Align / By Chains / By Atoms / By DB Mapping*).

Alternative: select multiple files in the Explorer, right-click → *Protein Viewer: Open in Mol\* Viewer*, and they all load into one viewer tab.

## Design notes

- **Mol\* is consumed as a regular npm dependency**, not forked or patched. The prebuilt bundle (`node_modules/molstar/build/viewer/molstar.{js,css}`) is loaded directly into a webview. Upgrading Mol\* is `npm update molstar` and a smoke test — nothing in this extension's code knows about Mol\* internals beyond the public `Viewer.create()` and `loadStructureFromData()` APIs.
- The custom editor is registered with `priority: "option"`, so the **text editor remains the default**. The viewer opens only when explicitly chosen.

## Development

```sh
npm install
npm run watch     # esbuild --watch on extension host
# Press F5 in VS Code → Extension Development Host
```

Then open any supported file in the dev host.

## License

[MIT](LICENSE). Includes Mol\* (MIT) distributed unmodified.

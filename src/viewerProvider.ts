import * as vscode from 'vscode';
import * as path from 'path';
import { formatFromFilename, isBinaryExtension, isSupported } from './fileTypes';
import type { HostMessage, WebviewMessage } from './messages';

/**
 * One readonly document per file URI; Mol* renders it in a webview.
 *
 * We keep the document trivial (just the URI) — all bytes are read on demand
 * inside resolveCustomEditor so we can re-read after the user reverts/changes
 * the file without keeping it in memory for the editor's lifetime.
 */
class StructureDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {
    // nothing held
  }
}

export class ProteinViewerProvider
  implements vscode.CustomReadonlyEditorProvider<StructureDocument>
{
  public static readonly viewType = 'proteinViewer.viewer';

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): StructureDocument {
    return new StructureDocument(uri);
  }

  async resolveCustomEditor(
    document: StructureDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    attachViewer(webviewPanel, this.context, document.uri);
  }
}

/**
 * Opens an empty Mol* viewer in a new editor tab (no document attached).
 * Files can be loaded into it via drag-and-drop or the "Open by Path…" command.
 */
export function openEmptyViewerPanel(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    ProteinViewerProvider.viewType,
    'Mol* Viewer',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  attachViewer(panel, context, undefined);
}

/**
 * Wire a WebviewPanel into the Mol* shim. If `initialUri` is given, that file
 * is loaded when the webview signals 'ready'. Drag-and-drop always works.
 */
function attachViewer(
  webviewPanel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
  initialUri: vscode.Uri | undefined
): void {
  const extensionUri = context.extensionUri;
  const molstarBuildDir = vscode.Uri.joinPath(
    extensionUri,
    'node_modules',
    'molstar',
    'build',
    'viewer'
  );
  const mediaDir = vscode.Uri.joinPath(extensionUri, 'media');

  webviewPanel.webview.options = {
    enableScripts: true,
    localResourceRoots: [mediaDir, molstarBuildDir]
  };

  webviewPanel.webview.html = buildHtml(webviewPanel.webview, {
    mediaDir,
    molstarBuildDir
  });

  const post = (msg: HostMessage) => webviewPanel.webview.postMessage(msg);
  const loadUri = async (uri: vscode.Uri, replace: boolean) => {
    try {
      const filename = path.basename(uri.fsPath);
      const format = formatFromFilename(filename);
      if (!format) {
        post({ kind: 'error', message: `Unsupported file: ${filename}` });
        return;
      }
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (isBinaryExtension(filename)) {
        post({
          kind: 'load',
          name: filename,
          format,
          bytes: Array.from(bytes),
          replace
        });
      } else {
        const text = new TextDecoder('utf-8').decode(bytes);
        post({ kind: 'load', name: filename, format, text, replace });
      }
    } catch (err) {
      post({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err)
      });
    }
  };

  const sub = webviewPanel.webview.onDidReceiveMessage(
    async (msg: WebviewMessage) => {
      switch (msg.kind) {
        case 'ready':
          if (initialUri) await loadUri(initialUri, /*replace*/ true);
          return;
        case 'log':
          console[msg.level === 'error' ? 'error' : msg.level === 'warn' ? 'warn' : 'log'](
            `[protein-viewer webview] ${msg.message}`
          );
          return;
        case 'dropUris': {
          for (const raw of msg.uris) {
            const uri = parseDropUri(raw);
            if (!uri) continue;
            if (!isSupported(path.basename(uri.fsPath))) continue;
            await loadUri(uri, /*replace*/ false);
          }
          return;
        }
      }
    }
  );

  webviewPanel.onDidDispose(() => sub.dispose());
}

function buildHtml(
  webview: vscode.Webview,
  dirs: { mediaDir: vscode.Uri; molstarBuildDir: vscode.Uri }
): string {
  const nonce = makeNonce();
  const molstarJs = webview.asWebviewUri(
    vscode.Uri.joinPath(dirs.molstarBuildDir, 'molstar.js')
  );
  const molstarCss = webview.asWebviewUri(
    vscode.Uri.joinPath(dirs.molstarBuildDir, 'molstar.css')
  );
  const viewerJs = webview.asWebviewUri(
    vscode.Uri.joinPath(dirs.mediaDir, 'viewer.js')
  );
  const viewerCss = webview.asWebviewUri(
    vscode.Uri.joinPath(dirs.mediaDir, 'viewer.css')
  );

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: blob: https:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    // Mol* compiles expressions/shaders at runtime via `new Function` and `eval`,
    // so 'unsafe-eval' is required. It also instantiates an Emscripten WASM
    // module (CCD/parsing helpers), so we add 'wasm-unsafe-eval' explicitly —
    // newer Chromium / Electron splits WASM out from 'unsafe-eval'.
    // Scripts themselves are still pinned by nonce + cspSource.
    `script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval' 'wasm-unsafe-eval'`,
    `font-src ${webview.cspSource}`,
    // Mol*'s "Download Structure" panel fetches from rcsb.org / pdbe / alphafold /
    // emdb over HTTPS, so connect-src has to permit https:.
    `connect-src ${webview.cspSource} data: blob: https:`,
    `worker-src ${webview.cspSource} blob:`
  ].join('; ');

  return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link rel="stylesheet" href="${molstarCss}" />
  <link rel="stylesheet" href="${viewerCss}" />
  <title>Protein Viewer</title>
</head>
<body>
  <div id="drop-hint">Drop a structure file here to add it</div>
  <div id="viewer"></div>
  <script nonce="${nonce}" src="${molstarJs}"></script>
  <script nonce="${nonce}" src="${viewerJs}"></script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * VSCode passes its own URI list as `text/uri-list` (one per line, with `vscode-file:`
 * or `file:` schemes), and additionally as `application/vnd.code.uri-list` for
 * Explorer drags. Both end up as `file:` URIs after parsing.
 */
function parseDropUri(raw: string): vscode.Uri | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  try {
    return vscode.Uri.parse(trimmed, /*strict*/ true);
  } catch {
    return null;
  }
}

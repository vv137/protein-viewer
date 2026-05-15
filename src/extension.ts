import * as vscode from 'vscode';
import * as path from 'path';
import { ProteinViewerProvider, openViewerPanel } from './viewerProvider';
import { isSupported } from './fileTypes';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ProteinViewerProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ProteinViewerProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
      }
    )
  );

  // "Open in Mol* Viewer" — Explorer context menu (single + multi-select),
  // editor tab/body context menu, and command palette.
  // VSCode passes the right-clicked URI as `uri` and the full selection as
  // `allUris` when multiple Explorer items are selected. A single file goes
  // through `vscode.openWith` so it gets the standard per-document tab;
  // multiple files share one viewer panel.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'proteinViewer.openCurrent',
      async (uri?: vscode.Uri, allUris?: vscode.Uri[]) => {
        const candidates: vscode.Uri[] =
          allUris && allUris.length > 0
            ? allUris
            : uri
              ? [uri]
              : vscode.window.activeTextEditor
                ? [vscode.window.activeTextEditor.document.uri]
                : [];
        if (candidates.length === 0) {
          vscode.window.showWarningMessage('No file selected.');
          return;
        }
        const supported = candidates.filter((u) =>
          isSupported(path.basename(u.fsPath))
        );
        if (supported.length === 0) {
          vscode.window.showWarningMessage(
            'No supported structure files in selection.'
          );
          return;
        }
        if (supported.length === 1) {
          await vscode.commands.executeCommand(
            'vscode.openWith',
            supported[0],
            ProteinViewerProvider.viewType
          );
        } else {
          openViewerPanel(context, supported);
        }
      }
    )
  );

  // "Open Empty Viewer" — no file required; drag-and-drop into it afterwards.
  context.subscriptions.push(
    vscode.commands.registerCommand('proteinViewer.openEmpty', () => {
      openViewerPanel(context);
    })
  );

  // "Open by Path…" — accepts an arbitrary local path, even outside the workspace.
  context.subscriptions.push(
    vscode.commands.registerCommand('proteinViewer.openByPath', async () => {
      const input = await vscode.window.showInputBox({
        prompt: 'Absolute path to a structure file (PDB, CIF, …)',
        placeHolder: '/Users/you/structures/1crn.pdb',
        ignoreFocusOut: true
      });
      if (!input) return;
      const uri = vscode.Uri.file(input.trim());
      try {
        await vscode.workspace.fs.stat(uri); // surfaces a clear error if missing
      } catch {
        vscode.window.showErrorMessage(`File not found: ${uri.fsPath}`);
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        ProteinViewerProvider.viewType
      );
    })
  );

  // URI handler: vscode://<publisher>.<name>/open?path=/abs/path/to/file.pdb
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        if (uri.path !== '/open') return;
        const params = new URLSearchParams(uri.query);
        const fsPath = params.get('path');
        if (!fsPath) {
          vscode.window.showErrorMessage('Missing ?path= in protein-viewer URI.');
          return;
        }
        const fileUri = vscode.Uri.file(fsPath);
        vscode.commands.executeCommand(
          'vscode.openWith',
          fileUri,
          ProteinViewerProvider.viewType
        );
      }
    })
  );
}

export function deactivate(): void {
  // no-op
}

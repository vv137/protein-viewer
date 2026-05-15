import * as vscode from 'vscode';
import * as path from 'path';
import { ProteinViewerProvider, openEmptyViewerPanel } from './viewerProvider';
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

  // "Open in Mol* Viewer" — works from Explorer context menu (the clicked
  // URI is passed as the first argument) and from the command palette
  // (no argument; falls back to the active editor).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'proteinViewer.openCurrent',
      async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
          vscode.window.showWarningMessage('No file selected.');
          return;
        }
        if (!isSupported(path.basename(target.fsPath))) {
          vscode.window.showWarningMessage(
            `Unsupported file type: ${path.basename(target.fsPath)}`
          );
          return;
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          target,
          ProteinViewerProvider.viewType
        );
      }
    )
  );

  // "Open Empty Viewer" — no file required; drag-and-drop into it afterwards.
  context.subscriptions.push(
    vscode.commands.registerCommand('proteinViewer.openEmpty', () => {
      openEmptyViewerPanel(context);
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

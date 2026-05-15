/* eslint-env browser */
/* global acquireVsCodeApi, molstar */

// Thin shim around Mol*. Keep this file small — the goal is to never patch
// Mol* itself, so anything we want to customize wraps the prebuilt API here.

(function () {
  const vscode = acquireVsCodeApi();
  const log = (level, message) => vscode.postMessage({ kind: 'log', level, message });

  // ---------- error banner ----------
  const errorBanner = document.createElement('div');
  errorBanner.id = 'error-banner';
  document.body.appendChild(errorBanner);
  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.add('visible');
    setTimeout(() => errorBanner.classList.remove('visible'), 6000);
  }

  // ---------- Mol* viewer ----------
  if (typeof molstar === 'undefined' || !molstar.Viewer) {
    showError('Mol* bundle failed to load.');
    log('error', 'molstar global missing — webview cannot render.');
    return;
  }

  const target = document.getElementById('viewer');
  const viewerOptions = {
    layoutIsExpanded: false,
    layoutShowControls: true,
    layoutShowRemoteState: false,
    layoutShowSequence: true,
    layoutShowLog: false,
    viewportShowExpand: false,
    viewportShowSelectionMode: true,
    viewportShowAnimation: false,
    pdbProvider: 'rcsb',
    emdbProvider: 'rcsb'
  };

  let viewerPromise;
  try {
    viewerPromise = molstar.Viewer.create(target, viewerOptions);
  } catch (err) {
    showError('Failed to initialize Mol*: ' + (err && err.message ? err.message : err));
    log('error', String(err));
    return;
  }

  viewerPromise.then(
    (viewer) => {
      window.__mvViewer = viewer; // handy for debugging via Developer Tools
      vscode.postMessage({ kind: 'ready' });
    },
    (err) => {
      showError('Mol* initialization rejected: ' + (err && err.message ? err.message : err));
      log('error', String(err));
    }
  );

  async function getViewer() {
    return await viewerPromise;
  }

  // ---------- host → webview ----------
  window.addEventListener('message', async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.kind === 'error') {
      showError(msg.message);
      return;
    }

    if (msg.kind === 'load') {
      try {
        const viewer = await getViewer();
        if (msg.replace) {
          // Use the public plugin API to clear the current state. This is the
          // only call that knows about Mol* internals — keep it in one place.
          await viewer.plugin.clear();
        }
        const data = msg.bytes ? new Uint8Array(msg.bytes) : msg.text;
        await viewer.loadStructureFromData(data, msg.format);
        log('info', `loaded ${msg.name} (${msg.format})`);
      } catch (err) {
        showError('Failed to load: ' + (err && err.message ? err.message : err));
        log('error', String(err));
      }
    }
  });

  // ---------- drag-and-drop from the VSCode Explorer ----------
  // VSCode Explorer drops carry the file URI in `application/vnd.code.uri-list`
  // (and a copy in `text/uri-list`) — but no actual File objects, so Mol*'s
  // own drop handler can't load them. We intercept just to route the URIs to
  // the extension host.
  //
  // The dragover preventDefault is mandatory: without it the browser (and
  // VSCode's workbench layer above the webview) treats this region as a
  // non-drop-zone and opens the dropped file in a new text editor instead of
  // firing our drop handler. We don't call stopPropagation anywhere, so Mol*'s
  // own drag/drop listeners still run and clear its native overlay state.
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, { capture: true });

  window.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    const vsList =
      dt.getData('application/vnd.code.uri-list') ||
      dt.getData('text/uri-list') ||
      '';
    if (!vsList) return;
    const uris = vsList
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
    if (uris.length === 0) return;
    e.preventDefault();
    vscode.postMessage({ kind: 'dropUris', uris });
  }, { capture: true });
})();

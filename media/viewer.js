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
  // VSCode forwards Explorer drags into the webview with these mime types:
  //   - application/vnd.code.uri-list  (newline-separated VSCode URIs)
  //   - text/uri-list                  (same content, standard mime)
  // External OS file drops arrive as `Files` via dataTransfer.files.
  function setDragging(on) {
    document.body.classList.toggle('dragging', !!on);
  }

  ['dragenter', 'dragover'].forEach((type) => {
    window.addEventListener(type, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    });
  });

  ['dragleave', 'dragend'].forEach((type) => {
    window.addEventListener(type, (e) => {
      // Only clear when leaving the window itself, not child elements.
      if (e.target === document || e.target === document.body || type === 'dragend') {
        setDragging(false);
      }
    });
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const dt = e.dataTransfer;
    if (!dt) return;

    // 1) VSCode-internal Explorer drop: URI list.
    const vsList =
      dt.getData('application/vnd.code.uri-list') ||
      dt.getData('text/uri-list') ||
      '';
    const uris = vsList
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));

    if (uris.length > 0) {
      vscode.postMessage({ kind: 'dropUris', uris });
      return;
    }

    // 2) OS-level file drop: read in the webview, then send bytes to host
    //    by way of a `dropUris`-style path. The webview has no fs access, so
    //    for non-VSCode drops we just inspect dataTransfer.files and read
    //    them directly into Mol*.
    if (dt.files && dt.files.length > 0) {
      const viewer = await getViewer();
      for (const file of Array.from(dt.files)) {
        const format = inferFormat(file.name);
        if (!format) {
          showError(`Unsupported file: ${file.name}`);
          continue;
        }
        try {
          if (format === 'mmcif' && /\.bcif$/i.test(file.name)) {
            const buf = await file.arrayBuffer();
            await viewer.loadStructureFromData(new Uint8Array(buf), format);
          } else {
            const text = await file.text();
            await viewer.loadStructureFromData(text, format);
          }
          log('info', `loaded ${file.name} (${format}) via OS drop`);
        } catch (err) {
          showError('Failed to load ' + file.name + ': ' + (err && err.message ? err.message : err));
          log('error', String(err));
        }
      }
    }
  });

  // Minimal duplicate of fileTypes.ts kept here so the webview has no build step.
  function inferFormat(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    switch (ext) {
      case 'pdb': case 'ent': return 'pdb';
      case 'cif': case 'mmcif': case 'bcif': return 'mmcif';
      case 'mol': return 'mol';
      case 'mol2': return 'mol2';
      case 'sdf': return 'sdf';
      case 'xyz': return 'xyz';
      case 'gro': return 'gro';
      default: return null;
    }
  }
})();

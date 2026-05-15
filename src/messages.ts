// Typed message protocol between the extension host and the webview.
// Keep this file dependency-free so both sides can import its types.

import type { MolstarFormat } from './fileTypes';

/** Host → Webview. */
export type HostMessage =
  | {
      kind: 'load';
      /** Display label, usually the file basename. */
      name: string;
      format: MolstarFormat;
      /** Text payload (utf-8) for text formats. */
      text?: string;
      /** Binary payload for binary formats (e.g. bcif). Sent as Array of bytes (postMessage-safe). */
      bytes?: number[];
      /** If true, clear the current scene first. If false, append. */
      replace: boolean;
    }
  | { kind: 'error'; message: string };

/** Webview → Host. */
export type WebviewMessage =
  | { kind: 'ready' }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  /** Webview saw a drop from the VSCode Explorer; the host should resolve and reply with `load` messages. */
  | { kind: 'dropUris'; uris: string[] };

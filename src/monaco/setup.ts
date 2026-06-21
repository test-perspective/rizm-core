import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// Bundle Monaco locally instead of fetching it from a CDN at runtime.
// The default @monaco-editor/loader behaviour downloads the editor from
// jsdelivr, which fails in offline / network-restricted environments and
// leaves the Edit Manifest screen blank (REQ-304).
(self as unknown as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') {
      return new jsonWorker();
    }
    return new editorWorker();
  },
};

loader.config({ monaco });

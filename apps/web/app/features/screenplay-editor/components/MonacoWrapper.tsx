import { useState, useEffect, useRef, Suspense, lazy } from "react";
import type { Monaco } from "@monaco-editor/react";
import { registerFountainLanguage } from "../lib/fountain-language";
import { registerFountainKeybindings } from "../lib/fountain-keybindings";
import { registerFountainAutocomplete } from "../lib/fountain-autocomplete";
import { detectElement } from "../lib/fountain-element-detector";
import type { ElementType } from "../lib/fountain-element-detector";
import styles from "./MonacoWrapper.module.css";

// Lazy import — Monaco editor WebWorkers require a browser environment.
// This prevents the SSR render from crashing when the module is loaded.
const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.Editor })),
);

interface MonacoWrapperProps {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (lineNumber: number) => void;
  onElementChange?: (element: ElementType) => void;
  readOnly?: boolean;
}

/**
 * Client-only Monaco editor wrapper.
 * Guards against SSR with isMounted so the lazy import never runs on the server.
 */
export function MonacoWrapper({
  value,
  onChange,
  onCursorChange,
  onElementChange,
  readOnly = false,
}: MonacoWrapperProps) {
  const [isMounted, setIsMounted] = useState(false);
  // Ref so the autocomplete provider always reads the latest content without re-registration
  const contentRef = useRef(value);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    contentRef.current = value;
  }, [value]);

  if (!isMounted) {
    return <div className={styles.placeholder} aria-hidden="true" />;
  }

  const handleMount = (
    editor: Monaco["editor"]["IStandaloneCodeEditor"],
    monaco: Monaco,
  ) => {
    // Language + theme must be registered before keybindings so the editor tokenizes correctly
    registerFountainLanguage(monaco);
    if (!readOnly) {
      registerFountainKeybindings(editor, monaco);
      registerFountainAutocomplete(monaco, () => contentRef.current);
    }
    editor.onDidChangeCursorPosition(
      (e: { position: { lineNumber: number } }) => {
        onCursorChange?.(e.position.lineNumber);
        if (onElementChange) {
          const model = editor.getModel();
          if (model) {
            const lineNum = e.position.lineNumber;
            const line = model.getLineContent(lineNum);
            const prev = lineNum > 1 ? model.getLineContent(lineNum - 1) : null;
            onElementChange(detectElement(line, prev));
          }
        }
      },
    );
    editor.focus();
  };

  return (
    <Suspense fallback={<div className={styles.loading}>Loading editor…</div>}>
      <MonacoEditor
        language="fountain-screenplay"
        theme="fountain-dark"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleMount}
        options={{
          fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
          fontSize: 13,
          lineHeight: 22,
          wordWrap: "on",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderLineHighlight: "line",
          padding: { top: 56, bottom: 96 },
          lineNumbers: "off",
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          guides: { indentation: false },
          readOnly,
          domReadOnly: readOnly,
          scrollbar: {
            vertical: "auto",
            horizontal: "hidden",
            verticalScrollbarSize: 6,
          },
          tabCompletion: "on",
          suggestSelection: "first",
          wordBasedSuggestions: "off",
          suggest: { showIcons: false },
        }}
        className={styles.editor}
      />
    </Suspense>
  );
}

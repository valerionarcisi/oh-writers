import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { useMemo, useRef } from "react";
import styles from "./RichTextEditor.module.css";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number;
  readOnly?: boolean;
  onSelectionChange?: (text: string) => void;
  enableHeadings?: boolean;
}

const toTiptapHtml = (content: string): string => {
  if (!content) return "";
  if (content.trimStart().startsWith("<")) return content;
  return content
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
};

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  maxLength,
  readOnly = false,
  onSelectionChange,
  enableHeadings = false,
}: RichTextEditorProps) {
  // Callback refs — keep the same function identity across renders so Tiptap
  // never thinks options changed and never resets editor state.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Extensions MUST be stable across renders. Tiptap's compareOptions compares
  // the extensions array by reference; new instances every render cause the
  // editor to call setOptions (which resets caret + content). Memoize by the
  // structural knobs that actually change (enableHeadings / maxLength).
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: enableHeadings ? { levels: [2, 3] } : false,
        bulletList: enableHeadings ? {} : false,
        orderedList: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      ...(maxLength !== undefined
        ? [CharacterCount.configure({ limit: maxLength })]
        : []),
    ],
    [enableHeadings, maxLength, placeholder],
  );

  // Freeze the initial content; the editor is the source of truth once mounted.
  const initialContent = useMemo(() => toTiptapHtml(value), []); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate({ editor }) {
      onChangeRef.current(editor.getHTML());
    },
    onSelectionUpdate({ editor }) {
      onSelectionChangeRef.current?.(
        editor.state.doc.textBetween(
          editor.state.selection.from,
          editor.state.selection.to,
          " ",
        ),
      );
    },
  });

  return (
    <div
      className={`${styles.wrapper} ${readOnly ? styles.readOnly : ""}`}
      data-testid="rich-text-editor"
    >
      {enableHeadings && !readOnly && editor && (
        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive("heading", { level: 2 }) ? styles.active : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleHeading({ level: 2 }).run();
            }}
          >
            H2
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive("heading", { level: 3 }) ? styles.active : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleHeading({ level: 3 }).run();
            }}
          >
            H3
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive("bulletList") ? styles.active : ""}`}
            title="Bullet list"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleBulletList().run();
            }}
          >
            • List
          </button>
        </div>
      )}
      <EditorContent editor={editor} className={styles.editor} />
    </div>
  );
}

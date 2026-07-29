'use client';

import { useEffect } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

/**
 * Notion-style block editor for a resolution plan, built on BlockNote.
 *
 * Rendered client-only (the page dynamic-imports it with ssr:false). The parent
 * owns the editor instance via `onReady` so it can read the document on save;
 * remount with a `key` to load a different plan version.
 *
 * @param {object} props
 * @param {Array|undefined} props.initialContent BlockNote document (blocks), or undefined for a blank doc.
 * @param {boolean} props.editable Whether the document can be edited.
 * @param {(editor: object) => void} [props.onReady] Receives the editor instance once.
 */
export default function PlanEditor({ initialContent, editable, onReady }) {
  const editor = useCreateBlockNote({
    initialContent: Array.isArray(initialContent) && initialContent.length > 0 ? initialContent : undefined,
  });

  // The editor instance is stable for this component's life, so this runs once.
  useEffect(() => { onReady?.(editor); }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  return <BlockNoteView editor={editor} editable={editable} theme="light" />;
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Code, Eye, Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link, Unlink, Quote, Minus, Undo, Redo, Type, RemoveFormatting
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

type ToolbarAction = {
  icon: React.ReactNode;
  label: string;
  command: string;
  value?: string;
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange }) => {
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  // codeValue is used ONLY for the code-mode textarea
  const [codeValue, setCodeValue] = useState(value);
  const editorRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track what we last sent to the parent so we can ignore the echo
  const lastPropValue = useRef(value);
  const lastSyncedValue = useRef<string | null>(null);

  useEffect(() => {
    if (value !== lastPropValue.current) {
      lastPropValue.current = value;
      // If this value is just the echo of what we synced, skip the innerHTML reset
      if (value === lastSyncedValue.current) {
        return;
      }
      setCodeValue(value);
      if (editorRef.current) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [value]);

  // When switching to visual mode, push codeValue into the editor
  const handleModeSwitch = (newMode: 'visual' | 'code') => {
    if (newMode === mode) return;
    if (newMode === 'visual') {
      // Going from code -> visual: sync code textarea into contentEditable
      setMode('visual');
      // We need a rAF because the div isn't mounted yet
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = codeValue;
        }
      });
    } else {
      // Going from visual -> code: read current editor HTML into code textarea
      const html = editorRef.current?.innerHTML || '';
      setCodeValue(html);
      setMode('code');
    }
  };

  // Notify parent without touching React state / re-rendering the editor
  const syncToParent = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastSyncedValue.current = html;
      lastPropValue.current = html;
      onChangeRef.current(html);
    }
  }, []);

  const execFormat = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    // Just tell the parent about the new HTML — no setState, no re-render
    syncToParent();
  }, [syncToParent]);

  const handleLink = useCallback(() => {
    // Defer prompt() so it runs after the mousedown/mouseup event cycle
    setTimeout(() => {
      const selection = window.getSelection();
      const hasSelection = selection && selection.toString().length > 0;
      if (hasSelection) {
        const url = prompt('Enter URL:', 'https://');
        if (url) {
          execFormat('createLink', url);
        }
      } else {
        const url = prompt('Enter URL:', 'https://');
        if (url) {
          const text = prompt('Enter link text:', url);
          if (text) {
            execFormat('insertHTML', `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
          }
        }
      }
    }, 0);
  }, [execFormat]);

  const handleUnlink = useCallback(() => {
    execFormat('unlink');
  }, [execFormat]);

  const handleHorizontalRule = useCallback(() => {
    execFormat('insertHTML', '<hr/>');
  }, [execFormat]);

  const toolbarGroups: ToolbarAction[][] = [
    [
      { icon: <Undo size={15} />, label: 'Undo', command: 'undo' },
      { icon: <Redo size={15} />, label: 'Redo', command: 'redo' },
    ],
    [
      { icon: <Bold size={15} />, label: 'Bold', command: 'bold' },
      { icon: <Italic size={15} />, label: 'Italic', command: 'italic' },
      { icon: <Underline size={15} />, label: 'Underline', command: 'underline' },
      { icon: <Strikethrough size={15} />, label: 'Strikethrough', command: 'strikeThrough' },
    ],
    [
      { icon: <Heading1 size={15} />, label: 'Heading 1', command: 'formatBlock', value: 'h1' },
      { icon: <Heading2 size={15} />, label: 'Heading 2', command: 'formatBlock', value: 'h2' },
      { icon: <Heading3 size={15} />, label: 'Heading 3', command: 'formatBlock', value: 'h3' },
      { icon: <Type size={15} />, label: 'Paragraph', command: 'formatBlock', value: 'p' },
    ],
    [
      { icon: <List size={15} />, label: 'Bullet List', command: 'insertUnorderedList' },
      { icon: <ListOrdered size={15} />, label: 'Numbered List', command: 'insertOrderedList' },
      { icon: <Quote size={15} />, label: 'Blockquote', command: 'formatBlock', value: 'blockquote' },
    ],
    [
      { icon: <AlignLeft size={15} />, label: 'Align Left', command: 'justifyLeft' },
      { icon: <AlignCenter size={15} />, label: 'Align Center', command: 'justifyCenter' },
      { icon: <AlignRight size={15} />, label: 'Align Right', command: 'justifyRight' },
      { icon: <AlignJustify size={15} />, label: 'Justify', command: 'justifyFull' },
    ],
    [
      { icon: <Link size={15} />, label: 'Insert Link', command: '__link__' },
      { icon: <Unlink size={15} />, label: 'Remove Link', command: '__unlink__' },
      { icon: <Minus size={15} />, label: 'Horizontal Rule', command: '__hr__' },
      { icon: <RemoveFormatting size={15} />, label: 'Clear Formatting', command: 'removeFormat' },
    ],
  ];

  const handleToolbarClick = (action: ToolbarAction) => {
    if (action.command === '__link__') {
      handleLink();
    } else if (action.command === '__unlink__') {
      handleUnlink();
    } else if (action.command === '__hr__') {
      handleHorizontalRule();
    } else {
      execFormat(action.command, action.value);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-card">
      {/* Header bar with mode toggle */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="text-xs font-semibold text-gray-500 uppercase">Article Content</div>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => handleModeSwitch('visual')}
            className={`flex items-center px-2 py-1 text-xs font-medium rounded ${mode === 'visual' ? 'bg-card text-ots-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
          >
            <Eye size={14} className="mr-1" /> Visual
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('code')}
            className={`flex items-center px-2 py-1 text-xs font-medium rounded ${mode === 'code' ? 'bg-card text-ots-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
          >
            <Code size={14} className="mr-1" /> Code
          </button>
        </div>
      </div>

      {/* Formatting toolbar — only in visual mode */}
      {mode === 'visual' && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
          {toolbarGroups.map((group, gi) => (
            <React.Fragment key={gi}>
              {gi > 0 && (
                <div className="w-px h-5 bg-gray-300 mx-1" />
              )}
              {group.map((action, ai) => (
                <button
                  key={`${gi}-${ai}`}
                  type="button"
                  title={action.label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleToolbarClick(action);
                  }}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {action.icon}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Editor area */}
      {mode === 'code' ? (
        <textarea
          className="w-full h-96 p-4 font-mono text-sm focus:outline-none focus:ring-0 resize-none bg-[#111827] text-green-400"
          value={codeValue}
          onChange={(e) => {
            setCodeValue(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="Enter HTML code here..."
        />
      ) : (
        <div className="relative">
          <div
            ref={editorRef}
            className="w-full h-96 p-4 prose prose-sm max-w-none focus:outline-none overflow-y-auto"
            contentEditable
            suppressContentEditableWarning
            onBlur={() => syncToParent()}
          />
          <div className="absolute top-2 right-2 text-[10px] text-gray-400 pointer-events-none bg-white/80 px-2 rounded border border-gray-200">
            Editable Preview
          </div>
        </div>
      )}
    </div>
  );
};
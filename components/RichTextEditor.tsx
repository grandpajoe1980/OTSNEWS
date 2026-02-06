import React, { useState, useEffect } from 'react';
import { Code, Eye } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange }) => {
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [localValue, setLocalValue] = useState(value);

  // Sync internal state if prop changes from outside (e.g. load)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    onChange(localValue);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="text-xs font-semibold text-gray-500 uppercase">Article Content</div>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={`flex items-center px-2 py-1 text-xs font-medium rounded ${
              mode === 'visual' ? 'bg-card text-ots-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Eye size={14} className="mr-1" /> Visual
          </button>
          <button
            type="button"
            onClick={() => setMode('code')}
            className={`flex items-center px-2 py-1 text-xs font-medium rounded ${
              mode === 'code' ? 'bg-card text-ots-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Code size={14} className="mr-1" /> Code
          </button>
        </div>
      </div>

      {mode === 'code' ? (
        <textarea
          className="w-full h-96 p-4 font-mono text-sm focus:outline-none focus:ring-0 resize-none bg-[#111827] text-green-400"
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="Enter HTML code here..."
        />
      ) : (
        <div className="relative">
          <div 
             className="w-full h-96 p-4 prose prose-sm max-w-none focus:outline-none overflow-y-auto"
             contentEditable
             suppressContentEditableWarning
             onBlur={(e) => {
               const html = e.currentTarget.innerHTML;
               setLocalValue(html);
               onChange(html);
             }}
             dangerouslySetInnerHTML={{ __html: localValue }}
          />
          <div className="absolute top-2 right-2 text-[10px] text-gray-400 pointer-events-none bg-white/80 px-2 rounded border border-gray-200">
            Editable Preview
          </div>
        </div>
      )}
    </div>
  );
};
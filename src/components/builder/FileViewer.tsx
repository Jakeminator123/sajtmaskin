'use client';

import { Check, Copy, Edit3, Lock, RotateCcw, Save, Unlock } from 'lucide-react';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface FileViewerProps {
  fileName: string;
  content: string;
  onClose: () => void;
  chatId?: string;
  versionId?: string;
  locked?: boolean;
  onFileSaved?: (newContent: string, newDemoUrl?: string) => void;
}

export function FileViewer({
  fileName,
  content,
  onClose,
  chatId,
  versionId,
  locked = false,
  onFileSaved,
}: FileViewerProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(locked);

  const canEdit = chatId && versionId && !isLocked;

  const getLanguage = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    const languages: Record<string, string> = {
      tsx: 'tsx',
      ts: 'typescript',
      jsx: 'jsx',
      js: 'javascript',
      css: 'css',
      json: 'json',
      md: 'markdown',
      html: 'html',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      sql: 'sql',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
    };
    return languages[ext || ''] || 'text';
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(isEditing ? editedContent : content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEdit = () => {
    if (!canEdit) {
      if (isLocked) {
        toast.error('This file is locked and cannot be edited');
      } else {
        toast.error('Cannot edit: missing chat or version ID');
      }
      return;
    }
    setEditedContent(content);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedContent(content);
    setIsEditing(false);
  };

  const handleSave = useCallback(async () => {
    if (!chatId || !versionId) {
      toast.error('Cannot save: missing chat or version ID');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/v0/chats/${chatId}/files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          fileName,
          content: editedContent,
          locked: isLocked,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      toast.success('File saved successfully!');
      setIsEditing(false);

      if (onFileSaved) {
        onFileSaved(editedContent, data.demoUrl);
      }
    } catch (error) {
      console.error('Error saving file:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save file');
    } finally {
      setIsSaving(false);
    }
  }, [chatId, versionId, fileName, editedContent, isLocked, onFileSaved]);

  const toggleLock = async () => {
    if (!chatId || !versionId) {
      toast.error('Cannot toggle lock: missing chat or version ID');
      return;
    }

    const newLockState = !isLocked;
    setIsSaving(true);

    try {
      const response = await fetch(`/api/v0/chats/${chatId}/files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          fileName,
          content: isEditing ? editedContent : content,
          locked: newLockState,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      setIsLocked(newLockState);
      toast.success(newLockState ? 'File locked' : 'File unlocked');
    } catch (error) {
      console.error('Error toggling lock:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to toggle lock');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = editedContent !== content;

  return (
    <div className="flex h-full flex-col bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{fileName}</span>
          {isLocked && (
            <span className="flex items-center gap-1 rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400">
              <Lock className="h-3 w-3" />
              Locked
            </span>
          )}
          {isEditing && hasChanges && (
            <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-xs text-blue-400">
              Modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {chatId && versionId && (
            <button
              onClick={toggleLock}
              disabled={isSaving}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50"
              title={isLocked ? 'Unlock file' : 'Lock file'}
            >
              {isLocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            </button>
          )}

          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3 w-3" />
                    Save
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={handleEdit}
              disabled={!canEdit}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                canEdit ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200' : 'cursor-not-allowed text-gray-600'
              }`}
              title={!canEdit ? (isLocked ? 'File is locked' : 'Cannot edit') : 'Edit file'}
            >
              <Edit3 className="h-3 w-3" />
              Edit
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isEditing ? (
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full h-full min-h-[500px] resize-none bg-gray-900 text-gray-100 font-mono text-sm p-4 outline-none"
            spellCheck={false}
          />
        ) : (
          <SyntaxHighlighter
            language={getLanguage(fileName)}
            style={oneDark}
            customStyle={{
              margin: 0,
              background: 'transparent',
              fontSize: '14px',
            }}
          >
            {content}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}

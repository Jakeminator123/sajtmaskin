'use client';

import { FolderArchive, Github, Loader2, Lock, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';

interface InitFromRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (chatId: string) => void;
}

type SourceType = 'github' | 'zip';

export function InitFromRepoModal({ isOpen, onClose, onSuccess }: InitFromRepoModalProps) {
  const [sourceType, setSourceType] = useState<SourceType>('github');
  const [githubUrl, setGithubUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [message, setMessage] = useState('');
  const [lockConfigFiles, setLockConfigFiles] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [zipFileName, setZipFileName] = useState<string | null>(null);
  const [zipContent, setZipContent] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      toast.error('Please select a ZIP file');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 50MB.');
      return;
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== 'string') return reject(new Error('Failed to read file'));
          const commaIdx = result.indexOf(',');
          if (commaIdx === -1) return reject(new Error('Invalid file encoding'));
          resolve(result.slice(commaIdx + 1));
        };
        reader.readAsDataURL(file);
      });

      setZipContent(base64);
      setZipFileName(file.name);
      toast.success(`Selected: ${file.name}`);
    } catch {
      toast.error('Failed to read file');
    }
  };

  const handleSubmit = async () => {
    if (sourceType === 'github' && !githubUrl.trim()) {
      toast.error('Please enter a GitHub URL');
      return;
    }
    if (sourceType === 'zip' && !zipContent) {
      toast.error('Please select a ZIP file');
      return;
    }

    setIsLoading(true);
    try {
      const body: any = {
        source:
          sourceType === 'github'
            ? { type: 'github', url: githubUrl.trim(), branch: branch.trim() || undefined }
            : { type: 'zip', content: zipContent },
        lockConfigFiles,
      };

      if (message.trim()) {
        body.message = message.trim();
      }

      const response = await fetch('/api/v0/chats/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.details || 'Failed to initialize');
      }

      const data = await response.json();
      const chatId = data.id;

      if (!chatId) {
        throw new Error('No chat ID returned');
      }

      toast.success('Project imported successfully!');
      onSuccess(chatId);
      onClose();
    } catch (error) {
      console.error('Init error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to import project');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Import Existing Project</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSourceType('github')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === 'github'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Github className="h-4 w-4" />
            GitHub Repo
          </button>
          <button
            onClick={() => setSourceType('zip')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === 'zip'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <FolderArchive className="h-4 w-4" />
            ZIP File
          </button>
        </div>

        {sourceType === 'github' ? (
          <div className="space-y-4 mb-6">
            <div>
              <label
                htmlFor="init-github-url"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Repository URL
              </label>
              <input
                id="init-github-url"
                name="githubUrl"
                type="url"
                placeholder="https://github.com/username/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-2 text-xs text-gray-500">
                Public repos work best. For private repos, download a ZIP and use the ZIP tab.
              </p>
            </div>
            <div>
              <label htmlFor="init-branch" className="block text-sm font-medium text-gray-700 mb-1">
                Branch (optional)
              </label>
              <input
                id="init-branch"
                name="branch"
                type="text"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <label htmlFor="init-zip-file" className="block text-sm font-medium text-gray-700 mb-1">
              ZIP File
            </label>
            <input
              id="init-zip-file"
              name="zipFile"
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-8 text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              <Upload className="h-8 w-8" />
              {zipFileName ? (
                <span className="text-sm font-medium text-gray-700">{zipFileName}</span>
              ) : (
                <span className="text-sm">Click to select ZIP file (max 50MB)</span>
              )}
            </button>
          </div>
        )}

        <div className="mb-6">
          <label htmlFor="init-message" className="block text-sm font-medium text-gray-700 mb-1">
            Initial Instructions (optional)
          </label>
          <textarea
            id="init-message"
            name="message"
            placeholder="e.g., Add a new contact page with a form"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <Lock className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                id="init-lock-config-files"
                name="lockConfigFiles"
                type="checkbox"
                checked={lockConfigFiles}
                onChange={(e) => setLockConfigFiles(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-amber-800">Lock config files</span>
            </label>
            <p className="text-xs text-amber-700 mt-1">
              Prevent AI from modifying package.json, config files, and dependencies
            </p>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 text-white font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {isLoading ? 'Importing...' : 'Import Project'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { ExternalLink, FileCode, Github, Loader2, TerminalSquare, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';

type SandboxRuntime = 'node24' | 'node22' | 'python3.13';
type SourceType = 'version' | 'git';

interface SandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string | null;
  versionId: string | null;
  onUseInPreview?: (url: string) => void;
}

type SandboxCreateResponse = {
  success: true;
  sandboxId: string;
  urls: Record<number, string>;
  primaryUrl: string | null;
  timeout: string;
  runtime: SandboxRuntime;
  ports: number[];
};

function parsePorts(input: string): number[] {
  const ports = input
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ports.length > 0 ? ports : [3000];
}

export function SandboxModal({
  isOpen,
  onClose,
  chatId,
  versionId,
  onUseInPreview,
}: SandboxModalProps) {
  const [sourceType, setSourceType] = useState<SourceType>('version');
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');

  const [timeout, setTimeout] = useState('5m');
  const [ports, setPorts] = useState('3000');
  const [runtime, setRuntime] = useState<SandboxRuntime>('node24');
  const [vcpus, setVcpus] = useState(2);
  const [installCommand, setInstallCommand] = useState('npm install');
  const [startCommand, setStartCommand] = useState('npm run dev');

  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<SandboxCreateResponse | null>(null);
  const [setupHint, setSetupHint] = useState<string | null>(null);

  const resolvedPorts = useMemo(() => parsePorts(ports), [ports]);
  const canUseVersion = !!chatId && !!versionId;

  if (!isOpen) return null;

  const handleCreate = async () => {
    setSetupHint(null);
    setResult(null);

    if (sourceType === 'git' && !gitUrl.trim()) {
      toast.error('Please enter a Git URL');
      return;
    }

    if (sourceType === 'version' && !canUseVersion) {
      toast.error('Select a chat + version first');
      return;
    }

    setIsCreating(true);
    try {
      let source: any;

      if (sourceType === 'git') {
        source = {
          type: 'git',
          url: gitUrl.trim(),
          ...(gitBranch.trim() ? { branch: gitBranch.trim() } : {}),
        };
      } else {
        const filesRes = await fetch(
          `/api/v0/chats/${chatId}/files?versionId=${encodeURIComponent(versionId!)}`,
          { method: 'GET' }
        );
        if (!filesRes.ok) {
          const err = await filesRes.json().catch(() => ({}));
          throw new Error(err.error || `Failed to fetch files (HTTP ${filesRes.status})`);
        }

        const filesData = await filesRes.json();
        const filesArr: Array<{ name: string; content: string }> = filesData.files || [];
        if (!Array.isArray(filesArr) || filesArr.length === 0) {
          throw new Error('No files found for this version');
        }

        const filesMap: Record<string, string> = {};
        for (const file of filesArr) {
          if (file?.name) filesMap[file.name] = file.content ?? '';
        }

        source = { type: 'files', files: filesMap };
      }

      const response = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          timeout,
          ports: resolvedPorts,
          runtime,
          vcpus,
          installCommand,
          startCommand,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.setup) setSetupHint(String(err.setup));
        throw new Error(err.error || `Failed to create sandbox (HTTP ${response.status})`);
      }

      const data = (await response.json()) as SandboxCreateResponse;
      setResult(data);
      toast.success('Sandbox created!');
    } catch (error) {
      console.error('Sandbox create error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create sandbox');
    } finally {
      setIsCreating(false);
    }
  };

  const openPrimary = () => {
    if (result?.primaryUrl) {
      window.open(result.primaryUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const useInPreview = () => {
    if (result?.primaryUrl && onUseInPreview) {
      onUseInPreview(result.primaryUrl);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-5 w-5 text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Run in Sandbox</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setSourceType('version')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === 'version'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <FileCode className="h-4 w-4" />
            Current Version
          </button>
          <button
            onClick={() => setSourceType('git')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === 'git'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Github className="h-4 w-4" />
            Git URL
          </button>
        </div>

        {sourceType === 'git' ? (
          <div className="mb-6 space-y-4">
            <div>
              <label htmlFor="sandbox-git-url" className="mb-1 block text-sm font-medium text-gray-700">
                Repository URL
              </label>
              <input
                id="sandbox-git-url"
                name="gitUrl"
                type="url"
                placeholder="https://github.com/username/repo"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue/50"
              />
            </div>
            <div>
              <label htmlFor="sandbox-git-branch" className="mb-1 block text-sm font-medium text-gray-700">
                Branch (optional)
              </label>
              <input
                id="sandbox-git-branch"
                name="gitBranch"
                type="text"
                placeholder="main"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue/50"
              />
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span>
                <span className="font-medium">Chat:</span> {chatId ? 'selected' : 'none'}
              </span>
              <span>
                <span className="font-medium">Version:</span> {versionId || 'none'}
              </span>
            </div>
            {!canUseVersion && (
              <p className="mt-2 text-xs text-gray-600">
                Select a chat and pick a version in the Version History first.
              </p>
            )}
          </div>
        )}

        <div className="mb-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Runtime</label>
            <select
              value={runtime}
              onChange={(e) => setRuntime(e.target.value as SandboxRuntime)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue/50"
            >
              <option value="node24">Node 24</option>
              <option value="node22">Node 22</option>
              <option value="python3.13">Python 3.13</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ports</label>
            <input
              type="text"
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue/50"
              placeholder="3000, 5173"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Timeout</label>
            <input
              type="text"
              value={timeout}
              onChange={(e) => setTimeout(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue/50"
              placeholder="5m"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">vCPU</label>
            <input
              type="number"
              min={1}
              max={8}
              value={vcpus}
              onChange={(e) => setVcpus(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Install command</label>
            <input
              type="text"
              value={installCommand}
              onChange={(e) => setInstallCommand(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Start command</label>
            <input
              type="text"
              value={startCommand}
              onChange={(e) => setStartCommand(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue/50"
            />
          </div>
        </div>

        {setupHint && (
          <div className="mb-6 rounded-lg border border-brand-amber/30 bg-brand-amber/10 p-3 text-xs text-brand-amber">
            {setupHint}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 text-white font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {isCreating ? <Loader2 className="h-5 w-5 animate-spin" /> : <TerminalSquare className="h-5 w-5" />}
          {isCreating ? 'Creating sandbox...' : 'Create sandbox'}
        </button>

        {result && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <div className="font-medium mb-2">Sandbox ready!</div>
            <div className="space-y-2">
              {result.primaryUrl && (
                <button
                  onClick={openPrimary}
                  className="flex items-center gap-2 text-green-700 hover:text-green-900"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open primary URL
                </button>
              )}
              {result.primaryUrl && onUseInPreview && (
                <button
                  onClick={useInPreview}
                  className="flex items-center gap-2 text-green-700 hover:text-green-900"
                >
                  <ExternalLink className="h-4 w-4" />
                  Use in preview
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

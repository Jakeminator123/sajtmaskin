'use client';

import { ChatInterface } from '@/components/builder/ChatInterface';
import { ErrorBoundary } from '@/components/builder/ErrorBoundary';
import { FileExplorer } from '@/components/builder/FileExplorer';
import { FileViewer } from '@/components/builder/FileViewer';
import { InitFromRepoModal } from '@/components/builder/InitFromRepoModal';
import { DeploymentHistory } from '@/components/builder/DeploymentHistory';
import { MessageList } from '@/components/builder/MessageList';
import { PreviewPanel } from '@/components/builder/PreviewPanel';
import { SandboxModal } from '@/components/builder/SandboxModal';
import { VersionHistory } from '@/components/builder/VersionHistory';
import { BuilderHeader } from '@/components/builder/BuilderHeader';
import { Button } from '@/components/ui/button';
import { buildFileTree } from '@/lib/builder/fileTree';
import { clearPersistedMessages } from '@/lib/builder/messagesStorage';
import type { ChatMessage, FileNode, RightPanelTab } from '@/lib/builder/types';
import { useChat } from '@/lib/hooks/useChat';
import { usePersistedChatMessages } from '@/lib/hooks/usePersistedChatMessages';
import { usePromptAssist } from '@/lib/hooks/usePromptAssist';
import { useV0ChatMessaging } from '@/lib/hooks/useV0ChatMessaging';
import { useVersions } from '@/lib/hooks/useVersions';
import type { PromptAssistProvider } from '@/lib/builder/promptAssist';
import type { ModelTier } from '@/lib/validations/chatSchemas';
import { cn } from '@/lib/utils';
import { FolderTree, History, Loader2, Monitor, Rocket } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

function BuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const chatIdParam = searchParams.get('chatId');
  const promptParam = searchParams.get('prompt');
  const templateId = searchParams.get('templateId');
  const source = searchParams.get('source');
  const auditId = searchParams.get('auditId');
  const hasEntryParams = Boolean(promptParam || templateId || source === 'audit');

  const [chatId, setChatId] = useState<string | null>(chatIdParam);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [currentDemoUrl, setCurrentDemoUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('versions');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedModelTier, setSelectedModelTier] = useState<ModelTier>('v0-pro');
  const [promptAssistProvider, setPromptAssistProvider] =
    useState<PromptAssistProvider>('off');
  const [promptAssistModel, setPromptAssistModel] = useState('openai/gpt-5');
  const [promptAssistDeep, setPromptAssistDeep] = useState(false);
  const [isSandboxModalOpen, setIsSandboxModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [enableImageGenerations, setEnableImageGenerations] = useState(true);
  const [deployImageStrategy, setDeployImageStrategy] = useState<'external' | 'blob'>('external');
  const [isIntentionalReset, setIsIntentionalReset] = useState(false);

  const [auditPromptLoaded, setAuditPromptLoaded] = useState(source !== 'audit');
  const [resolvedPrompt, setResolvedPrompt] = useState<string | null>(promptParam);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);

  useEffect(() => {
    if (source !== 'audit' || typeof window === 'undefined') return;

    const storageKey = auditId
      ? `sajtmaskin_audit_prompt:${auditId}`
      : 'sajtmaskin_audit_prompt';
    const storedPrompt =
      sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey);

    if (storedPrompt) {
      setResolvedPrompt(storedPrompt);
    }

    setAuditPromptLoaded(true);
  }, [source, auditId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (source !== 'audit') return;
    if (!auditId || !currentDemoUrl) return;

    const key = `sajtmaskin_audit_prompt:${auditId}`;
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
    sessionStorage.removeItem('sajtmaskin_audit_prompt_id');
  }, [source, auditId, currentDemoUrl]);

  const { chat } = useChat(chatId);
  const { versions, mutate: mutateVersions } = useVersions(chatId);

  useEffect(() => {
    if (isIntentionalReset) {
      if (!chatIdParam) {
        setIsIntentionalReset(false);
      }
      return;
    }

    if (chatIdParam && chatIdParam !== chatId) {
      setChatId(chatIdParam);
      return;
    }

    if (!chatIdParam && !chatId && !hasEntryParams) {
      try {
        const last = localStorage.getItem('sajtmaskin:lastChatId');
        if (last) {
          setChatId(last);
          router.replace(`/builder?chatId=${encodeURIComponent(last)}`);
        }
      } catch {
        // ignore storage errors
      }
    }
  }, [chatIdParam, chatId, router, isIntentionalReset, hasEntryParams]);

  useEffect(() => {
    if (!chatId) return;
    try {
      localStorage.setItem('sajtmaskin:lastChatId', chatId);
    } catch {
      // ignore storage errors
    }
  }, [chatId]);

  useEffect(() => {
    if (chat?.demoUrl && !currentDemoUrl) {
      setCurrentDemoUrl(chat.demoUrl);
    }
  }, [chat, currentDemoUrl]);

  const activeVersionId = useMemo(() => {
    const latestFromVersions = versions?.[0]?.versionId || versions?.[0]?.id || null;
    const latestFromChat = (() => {
      if (!chat || typeof chat !== 'object') return null;
      const latest = (chat as { latestVersion?: { versionId?: string | null; id?: string | null } })
        .latestVersion;
      return latest?.versionId || latest?.id || null;
    })();
    return selectedVersionId || latestFromVersions || latestFromChat;
  }, [selectedVersionId, versions, chat]);

  const isAnyStreaming = useMemo(() => messages.some((m) => Boolean(m.isStreaming)), [messages]);

  const deployActiveVersionToVercel = useCallback(
    async (target: 'production' | 'preview' = 'production') => {
      if (!chatId) {
        toast.error('No chat selected');
        return;
      }
      if (!activeVersionId) {
        toast.error('No version selected');
        return;
      }
      if (isDeploying) return;

      setIsDeploying(true);
      try {
        const response = await fetch('/api/v0/deployments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            versionId: activeVersionId,
            target,
            imageStrategy: deployImageStrategy,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || data?.message || `Deploy failed (HTTP ${response.status})`);
        }

        const rawUrl = typeof data?.url === 'string' ? data.url : null;
        const url = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`) : null;

        toast.success(url ? 'Deployment started (Vercel building...)' : 'Deployment started');
        if (url) {
          toast(
            <span className="text-sm">
              Vercel URL:{' '}
              <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
                {url}
              </a>
            </span>,
            { duration: 15000 }
          );
        }
      } catch (error) {
        console.error('Deploy error:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to deploy');
      } finally {
        setIsDeploying(false);
      }
    },
    [chatId, activeVersionId, isDeploying, deployImageStrategy]
  );

  const { maybeEnhanceInitialPrompt } = usePromptAssist({
    provider: promptAssistProvider,
    model: promptAssistModel,
    deep: promptAssistDeep,
    imageGenerations: enableImageGenerations,
  });

  const resetBeforeCreateChat = useCallback(() => {
    setSelectedFile(null);
    setFiles([]);
    setFilesError(null);
    setSelectedVersionId(null);
    setCurrentDemoUrl(null);
  }, []);

  const { isCreatingChat, createNewChat, sendMessage } = useV0ChatMessaging({
    chatId,
    setChatId,
    chatIdParam,
    router,
    selectedModelTier,
    enableImageGenerations,
    maybeEnhanceInitialPrompt,
    mutateVersions,
    setCurrentDemoUrl,
    setMessages,
    resetBeforeCreateChat,
  });

  usePersistedChatMessages({
    chatId,
    isCreatingChat,
    isAnyStreaming,
    messages,
    setMessages,
  });

  const loadFiles = useCallback(
    async (versionId: string | null) => {
      if (!chatId) return;

      setIsFilesLoading(true);
      setFilesError(null);
      try {
        const url = versionId
          ? `/api/v0/chats/${chatId}/files?versionId=${encodeURIComponent(versionId)}`
          : `/api/v0/chats/${chatId}/files`;

        const response = await fetch(url);
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `Failed to fetch files (HTTP ${response.status})`);
        }

        const data = await response.json();
        const flatFiles = Array.isArray(data.files) ? data.files : [];
        setFiles(buildFileTree(flatFiles));
      } catch (error) {
        console.error('Error fetching files:', error);
        setFiles([]);
        setFilesError(error instanceof Error ? error.message : 'Failed to fetch files');
      } finally {
        setIsFilesLoading(false);
      }
    },
    [chatId]
  );

  useEffect(() => {
    if (!chatId) {
      setFiles([]);
      setFilesError(null);
      return;
    }
    if (rightPanelTab !== 'files') return;
    loadFiles(activeVersionId);
  }, [chatId, rightPanelTab, activeVersionId, loadFiles]);

  const resetToNewChat = useCallback(() => {
    setIsIntentionalReset(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sajtmaskin:lastChatId');
    }
    if (chatId) {
      clearPersistedMessages(chatId);
    }
    router.replace('/builder');
    setChatId(null);
    setSelectedFile(null);
    setFiles([]);
    setFilesError(null);
    setSelectedVersionId(null);
    setCurrentDemoUrl(null);
    setMessages([]);
    setIsImportModalOpen(false);
    setIsSandboxModalOpen(false);
  }, [router, chatId]);

  const handleVersionSelect = async (versionId: string) => {
    setSelectedVersionId(versionId);

    if (!chatId) {
      console.warn('handleVersionSelect called without valid chatId');
      return;
    }

    try {
      const response = await fetch(`/api/v0/chats/${chatId}/versions`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const versionsList = Array.isArray(data.versions)
        ? (data.versions as Array<{ versionId?: string; id?: string; demoUrl?: string | null }>)
        : [];
      const version = versionsList.find((v) => v.versionId === versionId || v.id === versionId);
      if (version?.demoUrl) {
        setCurrentDemoUrl(version.demoUrl);
      }
    } catch (error) {
      console.error('Error fetching version:', error);
    }
  };

  const handleFileSelect = (file: FileNode) => {
    setSelectedFile(file);
  };

  const tabs = [
    { id: 'versions' as const, label: 'Versions', icon: History },
    { id: 'files' as const, label: 'Files', icon: FolderTree },
    { id: 'deployments' as const, label: 'Deployments', icon: Rocket },
  ];

  const initialPrompt = templateId ? null : resolvedPrompt?.trim() || null;
  const autoCreateRef = useRef(false);
  useEffect(() => {
    if (!auditPromptLoaded) return;
    if (!initialPrompt || chatId || autoCreateRef.current) return;

    autoCreateRef.current = true;
    void createNewChat(initialPrompt);
  }, [auditPromptLoaded, initialPrompt, chatId, createNewChat]);

  useEffect(() => {
    if (!auditPromptLoaded) return;
    if (!templateId || chatId || isTemplateLoading) return;

    const initTemplate = async () => {
      setIsTemplateLoading(true);
      try {
        const response = await fetch('/api/template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, quality: 'standard' }),
        });
        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || 'Template init failed');
        }

        if (data?.chatId) {
          setChatId(data.chatId);
          router.replace(`/builder?chatId=${encodeURIComponent(data.chatId)}`);
        }
        if (data?.demoUrl) {
          setCurrentDemoUrl(data.demoUrl);
        }
      } catch (error) {
        console.error('[Builder] Template init failed:', error);
      } finally {
        setIsTemplateLoading(false);
      }
    };

    void initTemplate();
  }, [auditPromptLoaded, templateId, chatId, isTemplateLoading, router]);

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-muted/30">
        <Toaster position="top-right" />

        <BuilderHeader
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={() => setIsMobileMenuOpen((v) => !v)}
          selectedModelTier={selectedModelTier}
          onSelectedModelTierChange={setSelectedModelTier}
          promptAssistProvider={promptAssistProvider}
          onPromptAssistProviderChange={setPromptAssistProvider}
          promptAssistModel={promptAssistModel}
          onPromptAssistModelChange={setPromptAssistModel}
          promptAssistDeep={promptAssistDeep}
          onPromptAssistDeepChange={setPromptAssistDeep}
          enableImageGenerations={enableImageGenerations}
          onEnableImageGenerationsChange={setEnableImageGenerations}
          deployImageStrategy={deployImageStrategy}
          onDeployImageStrategyChange={setDeployImageStrategy}
          onOpenImport={() => {
            setIsSandboxModalOpen(false);
            setIsImportModalOpen(true);
          }}
          onOpenSandbox={() => {
            setIsImportModalOpen(false);
            setIsSandboxModalOpen(true);
          }}
          onDeployProduction={() => deployActiveVersionToVercel('production')}
          onNewChat={resetToNewChat}
          isDeploying={isDeploying}
          isCreatingChat={isCreatingChat || isTemplateLoading}
          isAnyStreaming={isAnyStreaming}
          canDeploy={Boolean(
            chatId && activeVersionId && !isCreatingChat && !isAnyStreaming && !isDeploying
          )}
        />

        <div className="flex flex-1 overflow-hidden">
          <div
            className={cn(
              'flex w-full flex-col border-r border-border bg-background lg:w-96',
              isMobileMenuOpen ? 'hidden' : '',
              'lg:flex'
            )}
          >
            <div className="flex-1 overflow-hidden">
              <MessageList chatId={chatId} messages={messages} />
            </div>
            <ChatInterface
              chatId={chatId}
              onCreateChat={createNewChat}
              onSendMessage={sendMessage}
              isBusy={isCreatingChat || isAnyStreaming || isTemplateLoading}
            />
          </div>

          <div className="hidden flex-1 flex-col overflow-hidden lg:flex">
            <PreviewPanel demoUrl={currentDemoUrl} isLoading={isAnyStreaming || isCreatingChat} />
          </div>

          <div
            className={cn(
              'flex w-full flex-col border-l border-border bg-background lg:w-80',
              isMobileMenuOpen ? '' : 'hidden',
              'lg:flex'
            )}
          >
            <div className="flex border-b border-border">
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant="ghost"
                  onClick={() => setRightPanelTab(tab.id)}
                  className={cn(
                    'flex-1 rounded-none border-b-2 border-transparent h-12',
                    rightPanelTab === tab.id
                      ? 'border-b-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <tab.icon className="h-4 w-4 mr-2" />
                  {tab.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                onClick={() => setRightPanelTab('preview')}
                className={cn(
                  'flex-1 rounded-none border-b-2 border-transparent h-12 lg:hidden',
                  rightPanelTab === 'preview'
                    ? 'border-b-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Monitor className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </div>

            <div className="flex-1 overflow-hidden">
              {rightPanelTab === 'versions' ? (
                <VersionHistory
                  chatId={chatId}
                  selectedVersionId={selectedVersionId}
                  onVersionSelect={handleVersionSelect}
                />
              ) : rightPanelTab === 'files' ? (
                <FileExplorer
                  files={files}
                  onFileSelect={handleFileSelect}
                  selectedPath={selectedFile?.path || null}
                  isLoading={isFilesLoading}
                  error={filesError}
                />
              ) : rightPanelTab === 'deployments' ? (
                <DeploymentHistory chatId={chatId} />
              ) : (
                <PreviewPanel demoUrl={currentDemoUrl} isLoading={isAnyStreaming || isCreatingChat} />
              )}
            </div>
          </div>
        </div>

        {selectedFile && selectedFile.type === 'file' && selectedFile.content != null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="h-[80vh] w-[80vw] max-w-4xl overflow-hidden rounded-lg shadow-xl">
              <FileViewer
                fileName={selectedFile.name}
                content={selectedFile.content}
                onClose={() => setSelectedFile(null)}
                chatId={chatId || undefined}
                versionId={activeVersionId || undefined}
                locked={selectedFile.locked}
                onFileSaved={(newContent, newDemoUrl) => {
                  setSelectedFile({ ...selectedFile, content: newContent });
                  if (newDemoUrl) {
                    setCurrentDemoUrl(newDemoUrl);
                  }
                  mutateVersions();
                  if (rightPanelTab === 'files') {
                    loadFiles(activeVersionId);
                  }
                }}
              />
            </div>
          </div>
        )}

        <SandboxModal
          isOpen={isSandboxModalOpen}
          onClose={() => setIsSandboxModalOpen(false)}
          chatId={chatId}
          versionId={activeVersionId}
          onUseInPreview={(url) => setCurrentDemoUrl(url)}
        />

        <InitFromRepoModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={(newChatId) => {
            setChatId(newChatId);
            router.replace(`/builder?chatId=${newChatId}`);
            setMessages([]);
            setCurrentDemoUrl(null);
            setSelectedVersionId(null);
          }}
        />
      </div>
    </ErrorBoundary>
  );
}

export default function BuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-muted/30">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Loading builder...</p>
          </div>
        </div>
      }
    >
      <BuilderContent />
    </Suspense>
  );
}

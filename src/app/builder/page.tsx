'use client';

import { ChatInterface } from '@/components/builder/ChatInterface';
import { ErrorBoundary } from '@/components/builder/ErrorBoundary';
import { InitFromRepoModal } from '@/components/builder/InitFromRepoModal';
import { MessageList } from '@/components/builder/MessageList';
import { PreviewPanel } from '@/components/builder/PreviewPanel';
import { SandboxModal } from '@/components/builder/SandboxModal';
import { BuilderHeader } from '@/components/builder/BuilderHeader';
import type { V0UserFileAttachment } from '@/components/media';
import { Button } from '@/components/ui/button';
import { clearPersistedMessages } from '@/lib/builder/messagesStorage';
import type { ChatMessage } from '@/lib/builder/types';
import { useChat } from '@/lib/hooks/useChat';
import { usePersistedChatMessages } from '@/lib/hooks/usePersistedChatMessages';
import { usePromptAssist } from '@/lib/hooks/usePromptAssist';
import { useV0ChatMessaging } from '@/lib/hooks/useV0ChatMessaging';
import { useVersions } from '@/lib/hooks/useVersions';
import { useAuth } from '@/lib/auth/auth-store';
import type { PromptAssistProvider } from '@/lib/builder/promptAssist';
import type { ModelTier } from '@/lib/validations/chatSchemas';
import { cn } from '@/lib/utils';
import {
  Check,
  Loader2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

type CreateChatOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
  skipPromptAssist?: boolean;
};

type ModelOption = {
  value: ModelTier;
  label: string;
  description: string;
  hint?: string;
};

const MODEL_TIER_OPTIONS: ModelOption[] = [
  {
    value: 'v0-mini',
    label: 'Mini',
    description: 'Snabbast och billigast. Bra för snabb prototyp.',
  },
  {
    value: 'v0-pro',
    label: 'Pro',
    description: 'Balanserad kvalitet och hastighet.',
    hint: 'Rekommenderad',
  },
  {
    value: 'v0-max',
    label: 'Max',
    description: 'Bäst kvalitet, långsammare. Djupare resonemang.',
  },
];

function BuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fetchUser } = useAuth();

  const chatIdParam = searchParams.get('chatId');
  const promptParam = searchParams.get('prompt');
  const templateId = searchParams.get('templateId');
  const source = searchParams.get('source');
  const auditId = searchParams.get('auditId');
  const hasEntryParams = Boolean(promptParam || templateId || source === 'audit');

  const [chatId, setChatId] = useState<string | null>(chatIdParam);
  const [currentDemoUrl, setCurrentDemoUrl] = useState<string | null>(null);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedModelTier, setSelectedModelTier] = useState<ModelTier>('v0-pro');
  const [promptAssistProvider, setPromptAssistProvider] =
    useState<PromptAssistProvider>('off');
  const [promptAssistModel, setPromptAssistModel] = useState('openai/gpt-5');
  const [promptAssistDeep, setPromptAssistDeep] = useState(false);
  const [isSandboxModalOpen, setIsSandboxModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [enableImageGenerations, setEnableImageGenerations] = useState(true);
  const [designSystemMode, setDesignSystemMode] = useState(false);
  const [deployImageStrategy, setDeployImageStrategy] = useState<'external' | 'blob'>('external');
  const [isIntentionalReset, setIsIntentionalReset] = useState(false);

  const [auditPromptLoaded, setAuditPromptLoaded] = useState(source !== 'audit');
  const [resolvedPrompt, setResolvedPrompt] = useState<string | null>(promptParam);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<{
    message: string;
    options?: CreateChatOptions;
  } | null>(null);
  const [hasSelectedModelTier, setHasSelectedModelTier] = useState(false);

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
    fetchUser().catch(() => {});
    // fetchUser is stable via zustand
  }, [fetchUser]);

  useEffect(() => {
    if (!searchParams) return;
    const connected = searchParams.get('github_connected');
    const username = searchParams.get('github_username');
    const error = searchParams.get('github_error');
    const errorReason = searchParams.get('github_error_reason');

    if (!connected && !error) return;

    if (connected) {
      toast.success(
        username ? `GitHub kopplat: @${username}` : 'GitHub kopplat'
      );
    } else if (error) {
      const message =
        error === 'not_authenticated'
          ? 'Logga in för att koppla GitHub'
          : error === 'not_configured'
            ? 'GitHub OAuth är inte konfigurerat'
            : error === 'user_fetch_failed'
              ? 'Kunde inte hämta GitHub-användare'
              : error === 'no_code'
                ? 'GitHub gav ingen kod'
                : 'GitHub-anslutning misslyckades';
      toast.error(message);
      if (errorReason === 'unsafe_return') {
        console.warn('[GitHub OAuth] Unsafe return URL sanitized');
      }
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('github_connected');
    nextParams.delete('github_username');
    nextParams.delete('github_error');
    nextParams.delete('github_error_reason');
    const query = nextParams.toString();
    router.replace(query ? `/builder?${query}` : '/builder');
  }, [searchParams, router]);

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
    return latestFromVersions || latestFromChat;
  }, [versions, chat]);

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

  const promptAssistStatus = useMemo(() => {
    if (promptAssistProvider === 'off') return null;
    const providerLabel =
      promptAssistProvider === 'gateway'
        ? 'AI Gateway'
        : promptAssistProvider === 'openai'
          ? 'OpenAI'
          : 'Claude';
    return `${providerLabel}${promptAssistDeep ? ' • Djup' : ''}`;
  }, [promptAssistProvider, promptAssistDeep]);

  const resetBeforeCreateChat = useCallback(() => {
    setCurrentDemoUrl(null);
    setPreviewRefreshToken(0);
  }, []);

  const bumpPreviewRefreshToken = useCallback(() => {
    setPreviewRefreshToken(Date.now());
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
    onPreviewRefresh: bumpPreviewRefreshToken,
    setMessages,
    resetBeforeCreateChat,
  });

  const confirmModelSelection = useCallback(async () => {
    const pending = pendingCreate;
    setIsModelSelectOpen(false);
    setPendingCreate(null);
    setHasSelectedModelTier(true);
    if (!pending) return;
    await createNewChat(pending.message, pending.options);
  }, [pendingCreate, createNewChat]);

  const requestCreateChat = useCallback(
    async (message: string, options?: CreateChatOptions) => {
      if (!chatId && !hasSelectedModelTier) {
        setPendingCreate({ message, options });
        setIsModelSelectOpen(true);
        return false;
      }
      await createNewChat(message, options);
      return true;
    },
    [chatId, hasSelectedModelTier, createNewChat]
  );

  usePersistedChatMessages({
    chatId,
    isCreatingChat,
    isAnyStreaming,
    messages,
    setMessages,
  });

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
    setCurrentDemoUrl(null);
    setPreviewRefreshToken(0);
    setMessages([]);
    setIsImportModalOpen(false);
    setIsSandboxModalOpen(false);
    setIsModelSelectOpen(false);
    setPendingCreate(null);
    setHasSelectedModelTier(false);
  }, [router, chatId]);

  const handleClearPreview = useCallback(() => {
    setCurrentDemoUrl(null);
  }, []);

  const initialPrompt = templateId ? null : resolvedPrompt?.trim() || null;
  const autoCreateRef = useRef(false);
  useEffect(() => {
    if (!auditPromptLoaded) return;
    if (!initialPrompt || chatId || autoCreateRef.current) return;

    autoCreateRef.current = true;
    void requestCreateChat(initialPrompt);
  }, [auditPromptLoaded, initialPrompt, chatId, requestCreateChat]);

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
          designSystemMode={designSystemMode}
          onDesignSystemModeChange={setDesignSystemMode}
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
          <div className="flex w-full flex-col border-r border-border bg-background lg:w-96">
            <div className="flex-1 overflow-hidden">
              <MessageList chatId={chatId} messages={messages} />
            </div>
            <ChatInterface
              chatId={chatId}
              onCreateChat={requestCreateChat}
              onSendMessage={sendMessage}
              onEnhancePrompt={maybeEnhanceInitialPrompt}
              promptAssistStatus={promptAssistStatus}
              isBusy={isCreatingChat || isAnyStreaming || isTemplateLoading}
              designSystemMode={designSystemMode}
            />
          </div>

          <div className="hidden flex-1 flex-col overflow-hidden lg:flex">
            <PreviewPanel
              demoUrl={currentDemoUrl}
              isLoading={isAnyStreaming || isCreatingChat}
              onClear={handleClearPreview}
              refreshToken={previewRefreshToken}
            />
          </div>
        </div>

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
            setHasSelectedModelTier(true);
          }}
        />

        {isModelSelectOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setIsModelSelectOpen(false);
                setPendingCreate(null);
              }}
            />
            <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-2xl">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Välj modell för första prompten
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Du kan ändra senare i toppmenyn. Detta påverkar bara första körningen.
                </p>
              </div>
              <div className="space-y-2">
                {MODEL_TIER_OPTIONS.map((option) => {
                  const isSelected = selectedModelTier === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedModelTier(option.value)}
                      className={cn(
                        'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                        isSelected
                          ? 'border-brand-blue/60 bg-brand-blue/10'
                          : 'border-border hover:border-brand-blue/40'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {option.label}
                          </span>
                          {option.hint ? (
                            <span className="rounded-full bg-brand-amber/20 px-2 py-0.5 text-[10px] text-brand-amber">
                              {option.hint}
                            </span>
                          ) : null}
                        </div>
                        {isSelected ? <Check className="h-4 w-4 text-brand-blue" /> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsModelSelectOpen(false);
                    setPendingCreate(null);
                  }}
                >
                  Avbryt
                </Button>
                <Button onClick={confirmModelSelection}>Fortsätt</Button>
              </div>
            </div>
          </div>
        )}
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

'use client';

import { useDeployments } from '@/lib/hooks/useDeployments';
import { AlertCircle, ExternalLink, Loader2, RefreshCw, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import toast from 'react-hot-toast';

function toHttpsUrl(raw: string): string {
  if (!raw) return raw;
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ready':
      return 'default';
    case 'error':
      return 'destructive';
    case 'cancelled':
      return 'secondary';
    case 'building':
      return 'outline';
    default:
      return 'secondary';
  }
}

function isTerminal(status: string): boolean {
  return status === 'ready' || status === 'error' || status === 'cancelled';
}

export function DeploymentHistory({ chatId }: { chatId: string | null }) {
  const { deployments, isLoading, mutate } = useDeployments(chatId);

  const handleRefresh = async () => {
    try {
      await mutate();
      toast.success('Deployments refreshed');
    } catch {
      toast.error('Failed to refresh deployments');
    }
  };

  if (!chatId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground p-4">
        <p className="text-sm text-center">Send a message to start a project</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading deployments...</div>
      </div>
    );
  }

  if (!deployments || deployments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-4">
        <Rocket className="h-10 w-10 mb-3" />
        <p className="text-sm text-center">No deployments yet. Click Deploy to publish this site.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="font-semibold">Deployments</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {deployments.length} deployment{deployments.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleRefresh} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {deployments.map((d: any) => {
            const status = String(d.status || 'pending');
            const url = typeof d.url === 'string' ? toHttpsUrl(d.url) : null;
            const inspectorUrl = typeof d.inspectorUrl === 'string' ? d.inspectorUrl : null;

            return (
              <Card key={d.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusVariant(status)} className="text-xs">
                          {status}
                          {!isTerminal(status) && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {d.createdAt ? new Date(d.createdAt).toLocaleString() : ''}
                        </span>
                      </div>
                      {url ? (
                        <p className="mt-2 text-xs text-muted-foreground truncate" title={url}>
                          {url}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                          <AlertCircle className="h-3 w-3" />
                          URL not available yet
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {url && (
                        <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                          <a href={url} target="_blank" rel="noopener noreferrer" title="Open deployment">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Open
                          </a>
                        </Button>
                      )}
                      {inspectorUrl && (
                        <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                          <a
                            href={inspectorUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Vercel dashboard"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Inspect
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

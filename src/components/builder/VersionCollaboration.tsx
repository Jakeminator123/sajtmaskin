"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, CheckCircle, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type VersionCollaborationProps = {
  chatId: string;
  versionId: string;
  className?: string;
};

type Comment = {
  id: string;
  authorName: string | null;
  content: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
};

type Approval = {
  id: string;
  status: string;
  comment: string | null;
  approverName: string | null;
  createdAt: string;
} | null;

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  changes_requested: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export function VersionCollaboration({
  chatId,
  versionId,
  className,
}: VersionCollaborationProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [approval, setApproval] = useState<Approval>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [approvalOpen, setApprovalOpen] = useState(true);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/v0/chats/${chatId}/versions/${versionId}/comments`);
      if (!res.ok) return;
      const data = (await res.json()) as { comments?: Comment[] };
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch {
      // ignore
    }
  }, [chatId, versionId]);

  const fetchApproval = useCallback(async () => {
    try {
      const res = await fetch(`/api/v0/chats/${chatId}/versions/${versionId}/approval`);
      if (!res.ok) return;
      const data = (await res.json()) as { approval?: Approval };
      setApproval(data.approval ?? null);
    } catch {
      // ignore
    }
  }, [chatId, versionId]);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchComments(), fetchApproval()]);
    setLoading(false);
  }, [fetchComments, fetchApproval]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddComment = async () => {
    const content = newComment.trim();
    if (!content || submittingComment) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/v0/chats/${chatId}/versions/${versionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await res.json()) as { comment?: Comment; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to add comment");
      setNewComment("");
      toast.success("Kommentar tillagd");
      fetchComments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte lägga till kommentar");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleResolveComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/v0/chats/${chatId}/versions/${versionId}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (!res.ok) throw new Error("Failed to resolve");
      toast.success("Markerad som löst");
      fetchComments();
    } catch {
      toast.error("Kunde inte markera som löst");
    }
  };

  const handleApprovalAction = async (action: "request" | "approve" | "reject" | "changes_requested") => {
    if (submittingApproval) return;
    setSubmittingApproval(action);
    try {
      const res = await fetch(`/api/v0/chats/${chatId}/versions/${versionId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          comment: approvalComment.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { approval?: Approval; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      const labels = {
        request: "Godkännandebegäran skickad",
        approve: "Godkänt",
        reject: "Avslaget",
        changes_requested: "Ändringar begärda",
      };
      toast.success(labels[action]);
      setApprovalComment("");
      fetchApproval();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte utföra åtgärd");
    } finally {
      setSubmittingApproval(null);
    }
  };

  const formatTime = (val: string) => {
    try {
      const d = new Date(val);
      return d.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/50 p-3 text-sm dark:bg-card/30",
        className,
      )}
    >
      <Collapsible open={commentsOpen} onOpenChange={setCommentsOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-2 py-1 text-left font-medium">
            {commentsOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <MessageSquare className="h-4 w-4" />
            Kommentarer ({comments.length})
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-2">
            {comments.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "rounded border p-2",
                  c.resolved ? "border-border/50 bg-muted/30 opacity-80" : "border-border bg-muted/20",
                )}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {c.authorName || "Anonym"} · {formatTime(c.createdAt)}
                  </span>
                  {c.resolved && (
                    <Badge variant="secondary" className="text-[10px]">
                      Löst
                    </Badge>
                  )}
                  {!c.resolved && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs"
                      onClick={() => handleResolveComment(c.id)}
                    >
                      Markera som löst
                    </Button>
                  )}
                </div>
                <p className="text-foreground whitespace-pre-wrap text-xs">{c.content}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <Textarea
                placeholder="Lägg till kommentar..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="min-h-[60px] resize-none text-xs"
                disabled={submittingComment}
              />
              <Button
                size="sm"
                disabled={!newComment.trim() || submittingComment}
                onClick={handleAddComment}
              >
                {submittingComment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Skicka"
                )}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={approvalOpen} onOpenChange={setApprovalOpen}>
        <CollapsibleTrigger asChild>
          <button className="mt-3 flex w-full items-center gap-2 py-1 text-left font-medium">
            {approvalOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <CheckCircle className="h-4 w-4" />
            Godkännande
            {approval && (
              <Badge
                variant="outline"
                className={cn("text-[10px]", STATUS_BADGE_CLASS[approval.status] ?? "")}
              >
                {approval.status === "pending"
                  ? "Väntar"
                  : approval.status === "approved"
                    ? "Godkänd"
                    : approval.status === "rejected"
                      ? "Avslagen"
                      : "Ändringar begärda"}
              </Badge>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-2">
            {approval?.comment && (
              <p className="text-muted-foreground text-xs">{approval.comment}</p>
            )}
            <Textarea
              placeholder="Kommentar (valfritt)..."
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              className="min-h-[40px] resize-none text-xs"
              disabled={!!submittingApproval}
            />
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={!!submittingApproval}
                onClick={() => handleApprovalAction("request")}
              >
                {submittingApproval === "request" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                Begär godkännande
              </Button>
              <Button
                size="sm"
                className="border-emerald-600 bg-emerald-600/20 text-emerald-700 hover:bg-emerald-600/30 dark:text-emerald-300"
                disabled={!!submittingApproval || !approval}
                onClick={() => handleApprovalAction("approve")}
              >
                {submittingApproval === "approve" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                Godkänn
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!!submittingApproval || !approval}
                onClick={() => handleApprovalAction("reject")}
              >
                {submittingApproval === "reject" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                Avslå
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500/50 text-amber-700 dark:text-amber-300"
                disabled={!!submittingApproval || !approval}
                onClick={() => handleApprovalAction("changes_requested")}
              >
                {submittingApproval === "changes_requested" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                Begär ändringar
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

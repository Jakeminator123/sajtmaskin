import {
  MessageSquarePlus,
  MessageSquare,
  Archive,
  BookOpen,
  FolderPlus,
  ImageIcon,
  Presentation,
  FileText,
  Crown,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export function Sidebar() {
  return (
    <aside className="w-80 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-primary-foreground" />
          </div>
          <span className="text-lg text-sidebar-foreground font-(--font-heading) tracking-tight">
            Zyricon
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3H7V7H3V3Z" fill="currentColor" opacity="0.5" />
            <path d="M9 3H13V7H9V3Z" fill="currentColor" opacity="0.5" />
            <path d="M3 9H7V13H3V9Z" fill="currentColor" opacity="0.5" />
            <path d="M9 9H13V13H9V9Z" fill="currentColor" opacity="0.5" />
          </svg>
        </Button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <Button
          variant="secondary"
          className="btn-3d btn-glow w-full justify-start gap-2 bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 font-medium"
        >
          <MessageSquarePlus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      {/* Features Section */}
      <div className="px-3 flex-1 overflow-y-auto">
        <div className="mb-4">
          <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Features</h3>
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="btn-3d w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent font-medium"
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </Button>
            <Button
              variant="ghost"
              className="btn-3d w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent font-medium"
            >
              <Archive className="w-4 h-4" />
              Archived
            </Button>
            <Button
              variant="ghost"
              className="btn-3d w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent font-medium"
            >
              <BookOpen className="w-4 h-4" />
              Library
            </Button>
          </div>
        </div>

        {/* Workspaces Section */}
        <div>
          <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Workspaces</h3>
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="btn-3d w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent font-medium"
            >
              <FolderPlus className="w-4 h-4" />
              New Project
            </Button>
            <Button
              variant="ghost"
              className="btn-3d w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent font-medium"
            >
              <ImageIcon className="w-4 h-4" />
              Image
            </Button>
            <Button
              variant="ghost"
              className="btn-3d w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent font-medium"
            >
              <Presentation className="w-4 h-4" />
              Presentation
            </Button>
            <Button
              variant="ghost"
              className="btn-3d w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent font-medium"
            >
              <FileText className="w-4 h-4" />
              Riset
            </Button>
            <Button
              variant="ghost"
              className="btn-3d w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent font-medium"
            >
              <ImageIcon className="w-4 h-4" />
              Image
            </Button>
          </div>
        </div>
      </div>

      {/* Upgrade Card */}
      <div className="p-3">
        <div className="card-3d bg-sidebar-accent rounded-xl p-4 space-y-3">
          <div className="w-10 h-10 rounded-lg bg-sidebar-accent/50 flex items-center justify-center mx-auto">
            <Crown className="w-5 h-5 text-primary" />
          </div>
          <div className="text-center space-y-1">
            <h4 className="text-sm text-sidebar-foreground font-(--font-heading)">
              Upgrade to premium
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Boost productivity with seamless automation and responsive AI, built to adapt to your needs.
            </p>
          </div>
          <Button className="btn-3d btn-glow w-full bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground border border-sidebar-border font-medium">
            Upgrade
          </Button>
        </div>
      </div>
    </aside>
  )
}

# apps/bundle-analyzer/components/sidebar.tsx

Reason: Layout and navigation reference

```text
'use client'

import type React from 'react'
import { CircleHelp } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'
import { ImportChain } from '@/components/import-chain'
import { Skeleton } from '@/components/ui/skeleton'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import { SpecialModule } from '@/lib/types'
import { getSpecialModuleType } from '@/lib/utils'
import { Badge } from './ui/badge'

interface SidebarProps {
  sidebarWidth: number
  analyzeData: AnalyzeData | null
  modulesData: ModulesData | null
  selectedSourceIndex: number | null
  moduleDepthMap: Map<number, number>
  environmentFilter: 'client' | 'server'
  filterSource?: (sourceIndex: number) => boolean
  isLoading?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function Sidebar({
  sidebarWidth,
  analyzeData,
  modulesData,
  selectedSourceIndex,
  moduleDepthMap,
  environmentFilter,
  filterSource,
  isLoading = false,
}: SidebarProps) {
  filterSource = filterSource ?? (() => true)

  if (isLoading || !analyzeData) {
    return (
      <div
        className="flex-none bg-muted border-l border-border overflow-y-auto"
        style={{ width: `${sidebarWidth}%` }}
      >
        <div className="flex-1 p-3 space-y-4 overflow-y-auto">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex-none bg-muted border-l border-border overflow-y-auto"
      style={{ width: `${sidebarWidth}%` }}
    >
      {selectedSourceIndex != null ? (
        <SelectionDetails
          analyzeData={analyzeData}
          modulesData={modulesData}
          selectedSourceIndex={selectedSourceIndex}
          filterSource={filterSource}
          moduleDepthMap={modu

// ... truncated
```

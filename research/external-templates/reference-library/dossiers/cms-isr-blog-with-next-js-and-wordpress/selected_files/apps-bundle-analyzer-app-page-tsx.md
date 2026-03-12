# apps/bundle-analyzer/app/page.tsx

Reason: Useful structural reference

```text
'use client'

import type React from 'react'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { ErrorState } from '@/components/error-state'
import { FileSearch } from '@/components/file-search'
import { RouteTypeahead } from '@/components/route-typeahead'
import { Sidebar } from '@/components/sidebar'
import { TreemapVisualizer } from '@/components/treemap-visualizer'

import { Badge } from '@/components/ui/badge'
import { TreemapSkeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import { computeActiveEntries, computeModuleDepthMap } from '@/lib/module-graph'
import { fetchStrict } from '@/lib/utils'
import { formatBytes } from '@/lib/utils'
import { SizeMode } from '@/lib/treemap-layout'
import {
  Monitor,
  Server,
  FileCode,
  FileJson,
  Palette,
  Package,
} from 'lucide-react'

enum Environment {
  Client = 'client',
  Server = 'server',
}

export default function Home() {
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [environmentFilter, setEnvironmentFilter] = useState<Environment>(
    Environment.Client
  )
  const [typeFilter, setTypeFilter] = useState(['js', 'css', 'json'])
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(
    null
  )
  const [focusedSourceIndex, setFocusedSourceIndex] = useState<number | null>(
    null
  )

  const {
    data: modulesData,
    isLoading: isModulesLoading,
    error: modulesError,
  } = useSWR<ModulesData>('data/modules.data', fetchModulesData)

  let analyzeDataPath
  if (selectedRoute && selectedRoute === '/') {
    analyzeDataPath = 'data/analyze.data'
  } else if (selectedRoute) {
    analyzeDataPath = `data/${selectedRoute.replace(/^\//, '')}/analyze.data`
  } else {
    analyzeDataPath = null
  }

  const {
    data: analyzeData,
    isLoading: isAnalyzeLoading,
    error: analyzeError,
  } = useSWR<AnalyzeData>(analyzeDataPath, fetchAnalyzeData, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    onSuccess: (newData) => {
      const newRootSourceIndex = getRootSourceIndex(newData)
      setSelectedSourceIndex(newRootSourceIndex)
      setFocusedSourceIndex(ne

// ... truncated
```

'use client'

import { PropsWithChildren, useEffect } from 'react'
import { getAblyClient, closeAblyClient } from '@/lib/ably/client'

export default function AblyClientProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    getAblyClient()

    return () => {
      // closeAblyClient (not client.close()) so the singleton is reset and a
      // remount gets a fresh connection instead of a closed cached instance.
      closeAblyClient()
    }
  }, [])

  return children
}

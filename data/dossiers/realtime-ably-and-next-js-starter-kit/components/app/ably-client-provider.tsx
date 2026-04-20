'use client'

import { PropsWithChildren, useEffect } from 'react'
import { getAblyClient } from './ably-client'

export default function AblyClientProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const client = getAblyClient()

    return () => {
      client.close()
    }
  }, [])

  return children
}

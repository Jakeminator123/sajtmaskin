import type {ReactNode} from 'react'
import {draftMode} from 'next/headers'
import {VisualEditing} from 'next-sanity/visual-editing'

export default async function RootLayout({children}: {children: ReactNode}) {
  const {isEnabled} = await draftMode()

  return (
    <html lang="en">
      <body>
        {children}
        {isEnabled ? <VisualEditing /> : null}
      </body>
    </html>
  )
}

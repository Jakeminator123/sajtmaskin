import type { ReactNode } from 'react';
import { StackProvider, StackTheme } from '@stackframe/stack';
import { stackServerApp } from '@/stack';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StackProvider app={stackServerApp}>
          <StackTheme>{children}</StackTheme>
        </StackProvider>
      </body>
    </html>
  );
}

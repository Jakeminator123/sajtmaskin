# docs/src/components/layout/sidebar.tsx

Reason: Layout and navigation reference

```text
'use client';
import type {
  CollapsibleContentProps,
  CollapsibleTriggerProps,
} from '@radix-ui/react-collapsible';
import { Presence } from '@radix-ui/react-presence';
import { type ScrollAreaProps } from '@radix-ui/react-scroll-area';
import { cva } from 'class-variance-authority';
import { usePathname } from 'fumadocs-core/framework';
import Link, { type LinkProps } from 'fumadocs-core/link';
import type { PageTree } from 'fumadocs-core/server';
import { useMediaQuery } from 'fumadocs-core/utils/use-media-query';
import { useOnChange } from 'fumadocs-core/utils/use-on-change';
import { useSidebar } from 'fumadocs-ui/contexts/sidebar';
import { useTreeContext, useTreePath } from 'fumadocs-ui/contexts/tree';
import {
  type ComponentProps,
  createContext,
  type FC,
  Fragment,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RemoveScroll } from 'react-remove-scroll';
import { cn } from '../../lib/cn';
import { isActive } from '../../lib/is-active';
import { ChevronDown, ExternalLink } from '../icons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { ScrollArea, ScrollViewport } from '../ui/scroll-area';

export type SidebarProps = {
  /**
   * Open folders by default if their level is lower or equal to a specific level
   * (Starting from 1)
   *
   * @defaultValue 0
   */
  defaultOpenLevel?: number,

  /**
   * Prefetch links
   *
   * @defaultValue true
   */
  prefetch?: boolean,

  /**
   * Support collapsing the sidebar on desktop mode
   *
   * @defaultValue true
   */
  collapsible?: boolean,
} & ComponentProps<'aside'>

type InternalContext = {
  defaultOpenLevel: number,
  prefetch: boolean,
  level: number,
}

const itemVariants = cva(
  'relative flex flex-row items-center gap-2 text-start py-2.5 px-3 rounded-lg [overflow-wrap:anywhere] [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      active: {
        true: 'bg-fd-primary/10 text-fd-primary font-medium shadow-sm',
        false:
          'text-fd-muted-foreground hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80',
      },
    },
  },
);

const Context = createContext<InternalContext | null>(null);
const FolderContext = createContext<{
  open: boolean,
  setOpen: React.

// ... truncated
```

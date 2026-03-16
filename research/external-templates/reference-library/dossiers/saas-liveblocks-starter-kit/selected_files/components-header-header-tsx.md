# components/Header/Header.tsx

Reason: Useful structural reference

```text
"use client";

import {
  ClientSideSuspense,
  useIsInsideRoom,
  useOthers,
  useSelf,
} from "@liveblocks/react/suspense";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import { ComponentProps, useMemo } from "react";
import { InboxPopover } from "@/components/Inbox";
import { OrganizationPopover } from "@/components/OrganizationPopover";
import { ShareIcon, SignInIcon } from "@/icons";
import { renameDocument, signIn } from "@/lib/actions";
import { AvatarStack } from "@/primitives/AvatarStack";
import { Button } from "@/primitives/Button";
import { Skeleton } from "@/primitives/Skeleton";
import { Document } from "@/types";
import { ShareDialog } from "../ShareDialog";
import { HeaderName } from "./HeaderName";
import styles from "./Header.module.css";

interface Props extends ComponentProps<"header"> {
  documentId: Document["id"] | null;
  showTitle?: boolean;
}

export function Header({
  documentId,
  showTitle = true,
  className,
  ...props
}: Props) {
  const isInsideRoom = useIsInsideRoom();
  const { status } = useSession();

  return (
    <header className={clsx(className, styles.header)} {...props}>
      <div className={styles.logo}>
        {status === "authenticated" ? (
          <OrganizationPopover />
        ) : (
          <Button
            icon={<SignInIcon />}
            variant="secondary"
            onClick={() => signIn()}
          >
            Sign in
          </Button>
        )}
      </div>
      <div className={styles.document}>
        {showTitle ? (
          <ClientSideSuspense fallback={null}>
            {isInsideRoom && documentId ? (
              <HeaderName
                onDocumentRename={(name) =>
                  renameDocument({ documentId, name })
                }
              />
            ) : null}
          </ClientSideSuspense>
        ) : null}
      </div>
      <div className={styles.collaboration}>
        <div className={styles.presence}>
          <ClientSideSuspense fallback={null}>
            {isInsideRoom ? <HeaderAvatars /> : null}
          </ClientSideSuspense>
        </div>
        <ClientSideSuspense fallback={null}>
          {isInsideRoom ? (
            <ClientSideSuspense
              fallback={
                <Button icon={<ShareIcon />} disabled={true}>

// ... truncated
```

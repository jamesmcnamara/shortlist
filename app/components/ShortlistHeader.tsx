"use client";

import { authClient } from "@/lib/auth/client";
import { isUserTheatresPath, userPath } from "@/lib/user-path";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppMenu, type AppMenuProps } from "./AppMenu";
import styles from "./ShortlistHeader.module.css";

export interface ShortlistHeaderProps extends AppMenuProps {
  children?: ReactNode;
}

export function ShortlistHeader({
  children,
  ...menuProps
}: ShortlistHeaderProps) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const href =
    !isUserTheatresPath(pathname) && session?.user.username
      ? userPath(session.user.username)
      : "/";

  return (
    <header className={styles.header}>
      <Link className={styles.brand} href={href}>
        Shortlist
      </Link>
      <div>{children}</div>
      <div className={styles.menu}>
        <AppMenu {...menuProps} />
      </div>
    </header>
  );
}

import Link from "next/link";
import { AppMenu, type AppMenuProps } from "./AppMenu";
import styles from "./ShortlistHeader.module.css";

export function ShortlistHeader(menuProps: AppMenuProps) {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/">
        Shortlist
      </Link>
      <AppMenu {...menuProps} />
    </header>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { AppMenu } from "@/app/components/AppMenu";
import { requireUserId } from "@/lib/auth/require-user";
import { MovieCompare } from "./MovieCompare";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const userId = await requireUserId();
  if (!userId) redirect("/auth/sign-in?next=/compare");

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          Shortlist
        </Link>
        <AppMenu />
      </header>

      <MovieCompare />
    </main>
  );
}

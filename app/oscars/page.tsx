import type { Metadata } from "next";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { OscarsArchive } from "./OscarsArchive";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Oscars · Shortlist",
};

export default function OscarsPage() {
  return (
    <main className={styles.shell}>
      <ShortlistHeader />
      <h1 className={styles.heading}>Oscars</h1>
      <p className={styles.intro}>
        Ah the Oscars. Not only the best, but the only, objective and infallible
        measure of a film&apos;s worth. Explore winners and nominees, one decade
        at a time. Years refer to the films&apos; award year, not the ceremony
        date.
      </p>
      <OscarsArchive />
    </main>
  );
}

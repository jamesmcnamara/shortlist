"use client";

import { useLongPress } from "@/app/lib/useLongPress";
import { motion } from "motion/react";
import { Dispatch, SetStateAction } from "react";
import styles from "./PickerBar.module.css";

interface PickerBarProps {
  picked: number[];
  theatreId?: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  canParticipate: boolean;
  isMenuOpen: boolean;
  isSubmitting: boolean;
  setIsMenuOpen: Dispatch<SetStateAction<boolean>>;
  onClickSelectAll(): void;
  onClickCancel(): void;
  onClickCompare(): void;
  onClickCrossPost(): void;
  onClickMarkWatched(): void;
}

export function PickerBar({
  picked,
  theatreId,
  menuRef,
  canParticipate,
  isMenuOpen,
  isSubmitting,
  setIsMenuOpen,
  onClickCancel,
  onClickSelectAll,
  onClickCompare,
  onClickCrossPost,
  onClickMarkWatched,
}: PickerBarProps) {
  const openMenu = useLongPress(() => {
    if (canParticipate) setIsMenuOpen(true);
  });

  return (
    <motion.div
      className={styles.compareBar}
      role="region"
      aria-label="Compare movies"
      initial={{ y: "120%" }}
      animate={{ y: 0 }}
      exit={{ y: "120%" }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <span aria-live="polite">{picked.length} picked</span>
      <button
        type="button"
        className={styles.compareAll}
        onClick={onClickSelectAll}
      >
        Select All
      </button>
      <button
        type="button"
        className={styles.compareCancel}
        onClick={onClickCancel}
      >
        Cancel
      </button>
      <div className={styles.compareSplit} ref={menuRef}>
        <button
          type="button"
          className={styles.compareGo}
          aria-disabled={picked.length < 2}
          {...openMenu}
          onClick={onClickCompare}
        >
          Compare
        </button>
        {canParticipate && (
          <button
            type="button"
            className={styles.compareMore}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            disabled={picked.length === 0}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 7.5 6 4l3.5 3.5" />
            </svg>
          </button>
        )}
        {canParticipate && isMenuOpen && picked.length > 0 && (
          <div className={styles.compareMenu} role="menu">
            {theatreId && (
              <button type="button" role="menuitem" onClick={onClickCrossPost}>
                Post to other lists…
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={isSubmitting}
              onClick={onClickMarkWatched}
            >
              Mark watched
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

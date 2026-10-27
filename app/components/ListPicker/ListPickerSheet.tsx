"use client";

import { useEffect, type ReactNode } from "react";
import { motion } from "motion/react";
import type { TheatreSummary } from "@/app/lib/api";
import { EmptyState } from "./EmptyState";
import { NewListForm } from "./NewListForm";
import { SheetFooter } from "./SheetFooter";
import { TheatreSkeleton } from "./TheatreSkeleton";
import styles from "./ListPicker.module.css";
import { stopPropagation } from "@/app/lib/utils";

interface ListPickerSheetProps<T extends TheatreSummary> {
  label: string;
  title: string;
  subtitle: string;
  /** Omit to leave out the poster slot entirely. */
  posterUrl?: string | null;
  theatres: T[] | undefined;
  loadError?: string;
  onRetry: () => void;
  renderTheatre: (theatre: T) => ReactNode;
  onCreated: (theatreId: string) => void;
  /** Shown above the lists. */
  children?: ReactNode;
  selectedCount: number;
  isSubmitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

/** Bottom sheet for picking some of the user's lists and posting to them. */
export function ListPickerSheet<T extends TheatreSummary>({
  label,
  title,
  subtitle,
  posterUrl,
  theatres,
  loadError,
  onRetry,
  renderTheatre,
  onCreated,
  children,
  selectedCount,
  isSubmitting,
  onSubmit,
  onClose,
}: ListPickerSheetProps<T>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.scrim} onClick={onClose}>
      <motion.div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={stopPropagation()}
      >
        <div className={styles.header}>
          {posterUrl !== undefined &&
            (posterUrl ? (
              <img src={posterUrl} alt="" className={styles.poster} />
            ) : (
              <div className={styles.posterPlaceholder} aria-hidden="true" />
            ))}
          <div className={styles.headerCopy}>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className={styles.close}
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className={styles.theatres}>
            {children}
            {!theatres && !loadError && <TheatreSkeleton />}
            {loadError && (
              <p className={styles.status} role="alert">
                {loadError}{" "}
                <button type="button" onClick={() => onRetry()}>
                  Try again
                </button>
              </p>
            )}
            {theatres?.length === 0 && <EmptyState />}
            {theatres?.map(renderTheatre)}
            {theatres && !loadError && <NewListForm onCreated={onCreated} />}
          </div>

          {(theatres ?? []).length > 0 && (
            <SheetFooter count={selectedCount} isSubmitting={isSubmitting} />
          )}
        </form>
      </motion.div>
    </div>
  );
}

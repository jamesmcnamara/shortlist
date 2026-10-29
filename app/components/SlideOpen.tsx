"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Key, ReactNode } from "react";

interface SlideOpenProps {
  open: boolean;
  children: ReactNode;
  className: string;
  mode?: "sync" | "wait" | "popLayout";
  contentKey?: Key;
}

export function SlideOpen({
  open,
  children,
  className,
  mode = "sync",
  contentKey = "content",
}: SlideOpenProps) {
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false} mode={mode}>
      {open && (
        <motion.div
          key={contentKey}
          className={className}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";
import type { Nomination } from "@/src/db/schema";
import {
  AnimatePresence,
  motion,
  useAnimate,
  useIsPresent,
  useReducedMotion,
  type Transition,
} from "motion/react";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { map } from "shades";
import styles from "./Room.module.css";

export type MovieAnimation = "glide" | "spring" | "fade" | "off";

interface MovieGridProps {
  nominees: Nomination[];
  animation?: MovieAnimation;
  children: (nomination: Nomination, index: number) => ReactNode;
}

export function MovieGrid({
  nominees,
  animation = "spring",
  children,
}: MovieGridProps) {
  const reducedMotion = useReducedMotion();
  const mode = reducedMotion ? "off" : animation;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const order = map("id")(nominees).join(",");
  const previousOrder = useRef(order);

  useEffect(() => {
    const changed = previousOrder.current !== order;
    previousOrder.current = order;
    if (mode !== "fade" || !changed) return;
    const element = scope.current;
    const playback = animate(
      element,
      { opacity: [0.55, 1] },
      {
        duration: 0.2,
        ease: "easeOut",
      },
    );
    return () => {
      playback.stop();
      element.style.removeProperty("opacity");
    };
  }, [order, mode, animate, scope]);

  return (
    <div ref={scope} className={styles.movieList}>
      <AnimatePresence initial={false} mode="popLayout">
        {nominees.map((nom, index) => (
          <MovieSlot key={nom.id} animation={mode}>
            {children(nom, index)}
          </MovieSlot>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface MovieSlotProps {
  animation: MovieAnimation;
  children: ReactNode;
}

const MovieSlot = forwardRef<HTMLDivElement, MovieSlotProps>(function MovieSlot(
  { animation, children },
  ref,
) {
  const present = useIsPresent();
  const moves = animation === "glide" || animation === "spring";
  const transition: Transition =
    animation === "spring"
      ? { type: "spring", stiffness: 380, damping: 38 }
      : { duration: 0.28, ease: [0.16, 1, 0.3, 1] };
  const duration = animation === "off" ? 0 : 0.16;

  return (
    <motion.div
      ref={ref}
      className={styles.movieSlot}
      inert={!present}
      layout={moves ? "position" : false}
      initial={
        animation === "off" ? false : { opacity: 0, scale: moves ? 0.96 : 1 }
      }
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: moves ? 0.96 : 1 }}
      transition={{
        layout: transition,
        opacity: { duration },
        scale: { duration },
      }}
    >
      {children}
    </motion.div>
  );
});

import { useEffect, useRef } from "react";

/**
 * Returns a ref to attach to an element; pointer events outside it fire `onOutside`.
 * Pass `enabled: false` to pause listening (e.g. while a menu is closed).
 */
export function useClickOutside<T extends HTMLElement>(
  onOutside: () => void,
  enabled = true,
) {
  const ref = useRef<T>(null);
  const callback = useRef(onOutside);
  callback.current = onOutside;

  useEffect(() => {
    if (!enabled) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) callback.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [enabled]);

  return ref;
}

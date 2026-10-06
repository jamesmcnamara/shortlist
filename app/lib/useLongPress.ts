import { useRef } from "react";
import type { PointerEvent, SyntheticEvent } from "react";

const DELAY_MS = 450;
const MOVE_TOLERANCE_PX = 10;

/**
 * Fires `onLongPress` after holding a pointer still, or on the native context
 * menu (right-click, Android long-press, the keyboard menu key). Swallows the
 * click that follows a long press so it doesn't also count as a tap.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const didFire = useRef(false);

  const cancel = () => {
    clearTimeout(timer.current);
    origin.current = null;
  };

  const fire = () => {
    cancel();
    didFire.current = true;
    navigator.vibrate?.(10);
    onLongPress();
  };

  return {
    onPointerDown: (event: PointerEvent) => {
      didFire.current = false;
      if (event.button !== 0) return;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(fire, DELAY_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      if (
        origin.current &&
        Math.hypot(
          event.clientX - origin.current.x,
          event.clientY - origin.current.y,
        ) > MOVE_TOLERANCE_PX
      ) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onKeyDown: () => {
      didFire.current = false;
    },
    onContextMenu: (event: SyntheticEvent) => {
      event.preventDefault();
      if (!didFire.current) fire();
    },
    onClickCapture: (event: SyntheticEvent) => {
      if (!didFire.current) return;
      didFire.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

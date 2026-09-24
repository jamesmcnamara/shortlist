import { useCallback, useEffect, useState } from "react";
import { set } from "shades";

const HISTORY_KEY = "__shortlistMovieDiscussionId";

const getDiscussionId = (state: unknown) => {
  if (!state || typeof state !== "object") return null;
  const id = (state as Record<string, unknown>)[HISTORY_KEY];
  return typeof id === "number" ? id : null;
};

const getHistoryState = () => {
  const state = window.history.state;
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : {};
};

export function useMovieDiscussionHistory() {
  const [focusedId, setFocusedId] = useState<number | null>(null);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      setFocusedId(getDiscussionId(event.state));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const closeDiscussion = useCallback(() => {
    if (getDiscussionId(window.history.state) !== null) {
      window.history.back();
      return;
    }

    setFocusedId(null);
  }, []);

  const openDiscussion = useCallback(
    (nominationId: number) => {
      const state = getHistoryState();
      const next = set(HISTORY_KEY)(nominationId)(state);

      if (getDiscussionId(state) === null) {
        window.history.pushState(next, "");
      } else {
        window.history.replaceState(next, "");
      }

      setFocusedId(nominationId);
    },
    [closeDiscussion, focusedId],
  );

  return { focusedId, closeDiscussion, openDiscussion };
}

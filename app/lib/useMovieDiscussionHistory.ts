import { useCallback, useEffect, useState } from "react";
import { set } from "shades";
import { z } from "zod";

const HISTORY_KEY = "__shortlistMovieDiscussionId";

const discussionState = z.object({ [HISTORY_KEY]: z.number() });

const historyState = z.record(z.string(), z.unknown()).catch({});

const getDiscussionId = (state: unknown) =>
  discussionState.safeParse(state).data?.[HISTORY_KEY] ?? null;

const getHistoryState = () => historyState.parse(window.history.state);

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

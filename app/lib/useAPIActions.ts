import { useMemo, useState } from "react";

export interface APICall<Args extends any[]> {
  api: (...args: Args) => Promise<void>;
  action: string;
  skip?: boolean;
  onStart?: () => void;
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
}

/**
 * Owns the shared `message`/`isSubmitting` state for a group of API-backed
 * actions and returns a `fromAPI` factory that wraps a raw API call with
 * that shared state. Call once per component; every action built from the
 * returned `fromAPI` shares the same state, so no merging across calls is
 * needed.
 */
export function useAPICall() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  function fromAPI<Args extends any[]>({
    api,
    action,
    skip,
    onStart,
    onSuccess,
    onError,
  }: APICall<Args>): (...args: Args) => Promise<boolean> {
    return async (...args) => {
      if (isSubmitting || skip) return false;
      setMessage("");
      setIsSubmitting(true);
      onStart?.();
      try {
        await api(...args);
        onSuccess?.();
        return true;
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : `Unable to ${action}.`,
        );
        onError?.(error);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    };
  }

  return { message, isSubmitting, fromAPI };
}

type APICallMap = Record<string, APICall<any[]>>;

type ActionsFromMap<Config extends APICallMap> = {
  [Key in keyof Config]: Config[Key] extends APICall<infer Args>
    ? (...args: Args) => Promise<boolean>
    : never;
};

/**
 * Declarative wrapper around `useAPICall`: pass a map of named `APICall`
 * configs and get back one bound action function per key, plus the shared
 * `message`/`isSubmitting` state.
 */
export function useAPIActions<Config extends APICallMap>(configMap: Config) {
  const { message, isSubmitting, fromAPI } = useAPICall();

  const actions = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(configMap).map(([key, config]) => [
          key,
          fromAPI(config),
        ]),
      ) as ActionsFromMap<Config>,
    [configMap],
  );

  return { actions, message, isSubmitting };
}

"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "./client";

export type AuthFormState = { error?: string; redirectTo?: string } | null;

type AuthAction = (
  prevState: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

/**
 * Auth server actions set the session cookie, but the client session store
 * doesn't know about it. Refetch it before navigating, or pages that check
 * the session will still see the old signed-out state.
 */
export function useAuthAction(action: AuthAction) {
  const router = useRouter();
  const { refetch } = authClient.useSession();

  return useActionState<AuthFormState, FormData>(
    async (prevState, formData) => {
      const result = await action(prevState, formData);
      if (result?.redirectTo) {
        await refetch();
        router.replace(result.redirectTo);
      }
      return result;
    },
    null,
  );
}

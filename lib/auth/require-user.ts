import { auth } from "@/lib/auth/server";

export async function requireUserId (): Promise<string | null> {
  const { data: session } = await auth.getSession();
  return session?.user?.id ?? null;
}

export function unauthorized () {
  return Response.json(
    { error: "You need to sign in first." },
    { status: 401 },
  );
}

interface WithUserConfig {
  error: string
}

export function withUser (config?: WithUserConfig) {
  return function (handler: (request: Request, userId: string) => Promise<Response>) {
    return async function (request: Request): Promise<Response> {
      const userId = await requireUserId();
      if (!userId) {
        return unauthorized();
      }
      try {
        return handler(request, userId);
      } catch (error) {
        console.error(error);
        return Response.json(
          { error: config?.error ?? "An unexpected error occurred." },
          { status: 500 },
        );
      }
    };
  };
}

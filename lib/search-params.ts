export const toQueryString = (
  params: Record<string, string | string[] | undefined>,
): string =>
  new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(
        (entry): [string, string] => [key, entry],
      ),
    ),
  ).toString();

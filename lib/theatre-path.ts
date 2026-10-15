const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const isUuid = (value: string): boolean =>
  new RegExp(`^${UUID}$`).test(value);

export const theatrePath = ({ id }: { id: string }): string => `/theatres/${id}`;

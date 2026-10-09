const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const isUuid = (value: string): boolean =>
  new RegExp(`^${UUID}$`).test(value);

export const roomPath = ({ id }: { id: string }): string => `/rooms/${id}`;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const isUuid = (value: string): boolean =>
  new RegExp(`^${UUID}$`).test(value);

export const theatrePath = ({ id }: { id: string }): string => `/theatres/${id}`;

export const isShareCode = (value: string): boolean =>
  /^[0-9a-f]{32}$/.test(value);

export const sharePath = (shareCode: string): string => `/share/${shareCode}`;

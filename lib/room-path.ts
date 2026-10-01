export interface RoomPathParts {
  ownerId: string;
  slug: string;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";

export const isUuid = (value: string): boolean =>
  new RegExp(`^${UUID}$`).test(value);

export const roomPath = ({ ownerId, slug }: RoomPathParts): string =>
  `/${ownerId}/${slug}`;

export const roomApiKey = ({ ownerId, slug }: RoomPathParts): string =>
  `${ownerId}:${slug}`;

export const parseRoomApiKey = (value: string): RoomPathParts | null => {
  const match = new RegExp(`^(${UUID}):(${SLUG})$`).exec(value);
  return match ? { ownerId: match[1], slug: match[2] } : null;
};

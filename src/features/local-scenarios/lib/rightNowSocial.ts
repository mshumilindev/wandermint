import type { Friend, RightNowParticipant } from "../../../entities/friend/model";

const normalize = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const normalizeCityName = (city: string): string => normalize(city);

export const areCitiesSame = (a?: string, b?: string): boolean => {
  if (!a || !b) {
    return false;
  }
  return normalizeCityName(a) === normalizeCityName(b);
};

export const getFriendsInSameCity = (userCity: string, friends: Friend[]): Friend[] =>
  friends.filter((friend) => areCitiesSame(friend.location.city, userCity));

export const createParticipantFromFriend = (friend: Friend): RightNowParticipant => ({
  id: friend.id,
  type: "friend",
  name: friend.name,
  location: {
    city: friend.location.city,
    country: friend.location.country,
    address: friend.location.address ?? friend.location.label,
    coordinates: friend.location.coordinates,
  },
});

export const createCurrentUserParticipant = (input: {
  userId?: string;
  userName?: string;
  city: string;
  country?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}): RightNowParticipant => ({
  id: input.userId?.trim() || "me",
  type: "user",
  name: input.userName?.trim() || "Me",
  location: {
    city: input.city,
    country: input.country,
    address: input.address,
    coordinates:
      input.latitude !== undefined && input.longitude !== undefined
        ? { lat: input.latitude, lng: input.longitude }
        : undefined,
  },
});

export const computeGroupMidpoint = (
  participants: RightNowParticipant[],
): { lat: number; lng: number } | undefined => {
  const coords = participants
    .map((item) => item.location.coordinates)
    .filter((item): item is { lat: number; lng: number } => Boolean(item));
  if (coords.length < 2) {
    return undefined;
  }
  const lat = coords.reduce((sum, point) => sum + point.lat, 0) / coords.length;
  const lng = coords.reduce((sum, point) => sum + point.lng, 0) / coords.length;
  return { lat, lng };
};

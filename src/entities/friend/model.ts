export type Friend = {
  id: string;
  name: string;
  location: {
    label?: string;
    city: string;
    country?: string;
    address?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  avatarUrl?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type LocationSearchResult = {
  id: string;
  label: string;
  city: string;
  country?: string;
  address?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  provider: "existing" | "nominatim" | "mapbox" | "google" | "mock";
};

export type SearchLocationsParams = {
  query: string;
  limit?: number;
};

export type RightNowParticipant = {
  id: string;
  type: "user" | "friend";
  name: string;
  location: {
    city: string;
    country?: string;
    address?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
};

export type RightNowSocialMode = "solo" | "duo" | "group";

export type RightNowSocialContext = {
  mode: RightNowSocialMode;
  participants: RightNowParticipant[];
  participantCount: number;
  locationStrategy: {
    preferred: "near_me" | "midpoint" | "citywide";
    allowCitywideInterestingDetours: boolean;
    midpoint?: {
      lat: number;
      lng: number;
    };
  };
};

export type AddFriendInput = {
  name: string;
  location: Friend["location"];
  avatarUrl?: string;
  notes?: string;
};

export type UpdateFriendPatch = Partial<Pick<Friend, "name" | "location" | "avatarUrl" | "notes">>;

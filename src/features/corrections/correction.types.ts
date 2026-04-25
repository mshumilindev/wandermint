/**
 * Fields the user may correct manually. Stored on {@link UserCorrection.field} as a string
 * for persistence flexibility; prefer {@link UserCorrectableField} when validating writes.
 */
export const USER_CORRECTABLE_FIELDS = [
  "location",
  "eventDate",
  "openingHours",
  "image",
  "price",
  "category",
] as const;

export type UserCorrectableField = (typeof USER_CORRECTABLE_FIELDS)[number];

export const isUserCorrectableField = (value: string): value is UserCorrectableField =>
  (USER_CORRECTABLE_FIELDS as readonly string[]).includes(value);

export type UserCorrection = {
  id: string;
  userId: string;
  entityId: string;
  field: string;
  oldValue?: unknown;
  newValue: unknown;
  createdAt: string;
};

export type ApplyUserCorrectionInput = {
  userId: string;
  entityId: string;
  field: UserCorrectableField;
  oldValue?: unknown;
  newValue: unknown;
};

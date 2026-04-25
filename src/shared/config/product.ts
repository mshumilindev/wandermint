export const productConfig = {
  appName: import.meta.env.VITE_APP_NAME ?? "WanderMint",
  wordmarkPrefix: "Wander",
  wordmarkAccent: "Mint",
  workingNameToken: "WanderMint",
  supportEmail: "hello@wandermint.app",
} as const;

export const brandAssets = {
  logo: "/brand/logo.png",
  banner: "/brand/banner.png",
} as const;

export const firestoreCollections = {
  users: "users",
  friends: "friends",
  trips: "trips",
  tripDays: "tripDays",
  tripWarnings: "tripWarnings",
  replanProposals: "replanProposals",
  tripChatThreads: "tripChatThreads",
  tripChatMessages: "tripChatMessages",
  savedLocalScenarios: "savedLocalScenarios",
  userPreferences: "userPreferences",
  privacySettings: "privacySettings",
  tripReviews: "tripReviews",
  validationSnapshots: "validationSnapshots",
  completionHistory: "completionHistory",
  travelMemories: "travelMemories",
  placeExperienceMemories: "placeExperienceMemories",
} as const;

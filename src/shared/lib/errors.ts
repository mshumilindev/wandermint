export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.includes("Authentication")) {
    return "Please sign in again to continue.";
  }

  return "We could not complete that just now. Please try again.";
};

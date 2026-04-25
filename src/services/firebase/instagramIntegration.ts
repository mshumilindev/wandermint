import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseApp";

export const saveInstagramAccessToken = async (accessToken: string): Promise<void> => {
  const callable = httpsCallable(firebaseFunctions, "instagramSaveToken");
  await callable({ accessToken });
};

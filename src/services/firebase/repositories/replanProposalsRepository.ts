import { collection, deleteDoc, getDocs, limit, orderBy, query, setDoc, doc, where } from "firebase/firestore";
import type { ReplanProposal } from "../../../entities/replan/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { replanConverter } from "../mappers/replanMapper";

export const replanProposalsRepository = {
  getTripReplanProposals: async (tripId: string): Promise<ReplanProposal[]> => {
    const proposalsQuery = query(
      collection(firestoreDb, firestoreCollections.replanProposals).withConverter(replanConverter),
      where("tripId", "==", tripId),
      orderBy("createdAt", "desc"),
      limit(8),
    );
    const snapshot = await getDocs(proposalsQuery);
    return snapshot.docs.map((proposalDoc) => proposalDoc.data());
  },

  saveReplanProposal: async (proposal: ReplanProposal): Promise<void> => {
    await setDoc(doc(firestoreDb, firestoreCollections.replanProposals, proposal.id).withConverter(replanConverter), proposal);
  },

  deleteReplanProposal: async (proposalId: string): Promise<void> => {
    await deleteDoc(doc(firestoreDb, firestoreCollections.replanProposals, proposalId));
  },

  deleteTripReplanProposals: async (tripId: string): Promise<void> => {
    if (!tripId.trim()) {
      return;
    }

    const proposals = await replanProposalsRepository.getTripReplanProposals(tripId);
    await Promise.all(proposals.map((proposal) => deleteDoc(doc(firestoreDb, firestoreCollections.replanProposals, proposal.id))));
  },
};

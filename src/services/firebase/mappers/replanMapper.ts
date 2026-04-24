import type { DocumentData, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import type { ReplanProposal } from "../../../entities/replan/model";
import { replanProposalSchema } from "../../../entities/replan/schemas";
import { timestampToIso } from "../timestampMapper";

export const replanFromFirestore = (id: string, data: DocumentData): ReplanProposal => {
  const normalized = {
    ...data,
    id,
    createdAt: timestampToIso(data.createdAt),
  };

  return replanProposalSchema.parse(normalized);
};

export const replanToFirestore = (proposal: ReplanProposal): DocumentData => ({
  ...proposal,
});

export const replanConverter = {
  toFirestore: replanToFirestore,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): ReplanProposal =>
    replanFromFirestore(snapshot.id, snapshot.data(options)),
};

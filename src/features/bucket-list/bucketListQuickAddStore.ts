import { create } from "zustand";

interface BucketListQuickAddState {
  open: boolean;
  /** Increment so list views refetch after adds from the global quick-add dialog. */
  listGeneration: number;
  openDialog: () => void;
  closeDialog: () => void;
  notifyListChanged: () => void;
}

export const useBucketListQuickAddStore = create<BucketListQuickAddState>((set) => ({
  open: false,
  listGeneration: 0,
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
  notifyListChanged: () => set((state) => ({ listGeneration: state.listGeneration + 1 })),
}));

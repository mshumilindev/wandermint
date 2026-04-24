import { create } from "zustand";

export type UiToastTone = "success" | "error" | "info" | "warning";

export interface UiToast {
  id: string;
  message: string;
  tone: UiToastTone;
}

interface UiState {
  tripSort: "soonest" | "recent";
  wizardStep: number;
  sidebarOpen: boolean;
  toasts: UiToast[];
  setTripSort: (sort: UiState["tripSort"]) => void;
  setWizardStep: (step: number) => void;
  setSidebarOpen: (open: boolean) => void;
  pushToast: (toast: Omit<UiToast, "id">) => void;
  dismissToast: (toastId: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  tripSort: "soonest",
  wizardStep: 0,
  sidebarOpen: false,
  toasts: [],
  setTripSort: (tripSort) => set({ tripSort }),
  setWizardStep: (wizardStep) => set({ wizardStep }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  pushToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }],
    })),
  dismissToast: (toastId) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== toastId),
    })),
}));

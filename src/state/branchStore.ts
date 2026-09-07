import { create } from 'zustand';

interface BranchState {
  branches: { id: string; name: string; address: string }[];
  selectedBranchId: string | null;
  setBranches: (branches: { id: string; name: string; address: string }[]) => void;
  setSelectedBranchId: (id: string | null) => void;
  reset: () => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  branches: [],
  selectedBranchId: null,
  setBranches: (branches) => set({ branches }),
  setSelectedBranchId: (id) => set({ selectedBranchId: id }),
  reset: () => set({ branches: [], selectedBranchId: null }),
}));
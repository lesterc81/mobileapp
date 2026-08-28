import { create } from 'zustand';

interface AppStoreState {
  dbRemountKey: number;
  bumpDbRemount: () => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  dbRemountKey: 0,
  bumpDbRemount: () => set((s) => ({ dbRemountKey: s.dbRemountKey + 1 })),
}));
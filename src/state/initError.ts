import { create } from 'zustand';

interface InitErrorState {
  error: string | null;
  setError: (message: string | null) => void;
}

export const useInitError = create<InitErrorState>((set) => ({
  error: null,
  setError: (message) => set({ error: message }),
}));
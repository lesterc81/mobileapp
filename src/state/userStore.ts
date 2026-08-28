import { create } from 'zustand';
import type { User } from '../db/types';

interface UserState {
  activeUser: User | null;
  users: User[];
  setActiveUser: (user: User | null) => void;
  setUsers: (users: User[]) => void;
}

export const useUserStore = create<UserState>((set) => ({
  activeUser: null,
  users: [],
  setActiveUser: (user) => set({ activeUser: user }),
  setUsers: (users) => set({ users }),
}));
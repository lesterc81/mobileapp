import { supabase } from '../lib/supabase';
import type { Profile, Role } from './types';
import { listBranches } from './branches';

export type { Profile } from './types';

export async function listStaff(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name');
  if (error) throw error;
  return (data ?? []).map((u) => ({ ...u, role: u.role as Profile['role'] }));
}

export async function updateStaffRole(
  userId: string,
  patch: { role?: Role; branch_id?: string | null; full_name?: string }
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

/** Create a brand-new account for a staff member (owner only). */
export async function createStaffAccount(input: {
  full_name: string;
  email: string;
  password: string;
  role: Role;
  branch_id: string | null;
}): Promise<void> {
  // If no branches yet, we still need a branch_id later; owner links them in Settings.
  const args = {
    p_user_id: null,
    p_email: input.email,
    p_password: input.password,
    p_full_name: input.full_name,
    p_role: input.role,
    p_branch_id: input.branch_id,
  };
  const { error } = await supabase.rpc('upsert_staff', args as never);
  if (error) throw error;
}

export async function isOwner(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_owner');
  if (error) return false;
  return !!data;
}

/** The branch list is public; helper for staff forms. */
export { listBranches };
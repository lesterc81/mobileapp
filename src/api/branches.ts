import { supabase } from '../lib/supabase';
import type { Branch } from './types';

export async function listBranches(): Promise<Branch[]> {
  const { data, error } = await supabase.from('branches').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createBranch(name: string, address: string): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .insert({ name: name.trim(), address: address.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateBranch(id: string, patch: { name?: string; address?: string }): Promise<void> {
  const { error } = await supabase.from('branches').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteBranch(id: string): Promise<void> {
  const { error } = await supabase.from('branches').delete().eq('id', id);
  if (error) throw error;
}
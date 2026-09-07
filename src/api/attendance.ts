import { supabase } from '../lib/supabase';
import { listBranches } from './branches';
import type { Attendance, Branch } from './types';

export async function getOpenAttendance(userId: string): Promise<Attendance | null> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_id', userId)
    .is('time_out', null)
    .order('time_in', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function clockIn(userId: string, branchId: string | null): Promise<void> {
  const { error } = await supabase.from('attendance').insert({
    user_id: userId,
    branch_id: branchId,
  });
  if (error) throw error;
}

export async function clockOut(attendanceId: string): Promise<void> {
  const { data: open, error: gErr } = await supabase
    .from('attendance')
    .select('time_in')
    .eq('id', attendanceId)
    .single();
  if (gErr || !open) throw gErr ?? new Error('Attendance record not found');

  const timeOut = new Date().toISOString();
  const hours = (new Date(timeOut).getTime() - new Date(open.time_in).getTime()) / 3600000;
  const rounded = Math.round(hours * 100) / 100;

  const { error } = await supabase
    .from('attendance')
    .update({ time_out: timeOut, total_hours: rounded })
    .eq('id', attendanceId);
  if (error) throw error;
}

export interface AttendanceWithUser extends Attendance {
  user_name: string | null;
}

export async function listAttendance(opts: {
  branchId?: string | null;
  from?: string;
  to?: string;
}): Promise<AttendanceWithUser[]> {
  let query = supabase
    .from('attendance')
    .select('*, profiles(full_name)')
    .order('time_in', { ascending: false })
    .limit(500);

  if (opts.branchId) query = query.eq('branch_id', opts.branchId);
  if (opts.from) query = query.gte('date', opts.from);
  if (opts.to) query = query.lte('date', opts.to);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((a) => ({
    id: a.id,
    user_id: a.user_id,
    branch_id: a.branch_id,
    date: a.date,
    time_in: a.time_in,
    time_out: a.time_out,
    total_hours: a.total_hours,
    user_name: (a.profiles as { full_name?: string } | null)?.full_name ?? null,
  }));
}

export { listBranches };
export type { Branch };
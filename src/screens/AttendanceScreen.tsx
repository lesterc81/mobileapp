import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { clockIn, clockOut, getOpenAttendance, listAttendance } from '../api/attendance';
import { listBranches } from '../api/branches';
import type { AttendanceWithUser } from '../api/attendance';
import { BigButton, PickerModal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useBranchStore } from '../state/branchStore';
import { colors, radius, spacing } from '../theme';
import { fmtDate, fmtDateTime } from '../utils';

export default function AttendanceScreen() {
  const { profile } = useAuth();
  const { branches, setBranches, selectedBranchId, setSelectedBranchId } = useBranchStore();
  const [open, setOpen] = useState<AttendanceWithUser | null>(null);
  const [records, setRecords] = useState<AttendanceWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let allBranches = branches;
      if (allBranches.length === 0) {
        allBranches = await listBranches();
        setBranches(allBranches);
      }
      const uid = profile.id;
      const [opened, rows] = await Promise.all([
        getOpenAttendance(uid),
        listAttendance({ from: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString() }),
      ]);
      setOpen(opened ? { ...opened, user_name: null } : null);
      setRecords(rows.filter((r) => r.user_id === uid));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profile, branches, setBranches]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const doClock = async () => {
    if (!profile) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (open) {
        await clockOut(open.id);
      } else {
        await clockIn(profile.id, selectedBranchId);
      }
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openBranch = branches.find((b) => b.id === selectedBranchId);
  const hoursThisMonth = records.reduce((sum, r) => sum + (r.total_hours ?? 0), 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Time clock</Text>
        <Pressable style={styles.filterBtn} onPress={() => setShowBranchPicker(true)}>
          <Ionicons name="business-outline" size={15} color={colors.primary} />
          <Text style={styles.filterBtnText} numberOfLines={1}>
            {openBranch?.name ?? 'Select branch'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </Pressable>
      </View>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              <View
                style={[
                  styles.clockCard,
                  open ? styles.clockCardIn : styles.clockCardOut,
                ]}
              >
                <Ionicons
                  name={open ? 'finger-print' : 'finger-print-outline'}
                  size={44}
                  color={open ? colors.success : colors.primary}
                />
                <Text style={styles.clockStatus}>
                  {open ? `Clocked in since ${fmtDateTime(open.time_in)}` : 'Not clocked in'}
                </Text>
                <Text style={styles.clockHint}>
                  {open ? 'Remember to clock out when you leave.' : 'Clock in to start your shift.'}
                </Text>
                <BigButton
                  title={open ? 'Clock out' : 'Clock in'}
                  onPress={doClock}
                  disabled={busy || (!open && !selectedBranchId)}
                  variant={open ? 'danger' : 'primary'}
                  icon={open ? 'log-out-outline' : 'log-in-outline'}
                />
                {!open && !selectedBranchId ? (
                  <Text style={styles.clockErr}>Select a branch before clocking in.</Text>
                ) : null}
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{hoursThisMonth.toFixed(1)}h</Text>
                  <Text style={styles.summaryLabel}>Last 30 days</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{records.length}</Text>
                  <Text style={styles.summaryLabel}>Shifts</Text>
                </View>
              </View>
              <Text style={styles.sectionHeader}>Recent shifts</Text>
            </>
          }
          data={records.slice(0, 30)}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardDate}>{fmtDate(item.date)}</Text>
                <Text style={styles.cardHours}>
                  {item.total_hours != null ? `${item.total_hours}h` : '—'}
                </Text>
              </View>
              <Text style={styles.cardMeta}>
                In {fmtDateTime(item.time_in)}
                {item.time_out ? ` · Out ${fmtDateTime(item.time_out)}` : ' · Shift in progress'}
              </Text>
            </View>
          )}
        />
      )}

      {showBranchPicker ? (
        <PickerModal
          visible
          title="Select branch"
          options={branches.map((b) => ({ label: b.name, value: b.id }))}
          emptyLabel="No branches yet. Create one in Settings (owner)."
          onClose={() => setShowBranchPicker(false)}
          onSelect={(id) => setSelectedBranchId(id)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    maxWidth: '55%',
  },
  filterBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  error: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: `${colors.danger}12`,
    color: colors.danger,
    padding: spacing.sm,
    borderRadius: radius.sm,
    fontSize: 13,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  clockCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: 8,
  },
  clockCardIn: { backgroundColor: colors.card, borderColor: colors.success },
  clockCardOut: { backgroundColor: colors.card, borderColor: colors.border },
  clockStatus: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 4 },
  clockHint: { fontSize: 13, color: colors.textMuted },
  clockErr: { fontSize: 12, color: colors.danger, marginTop: spacing.sm },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  summaryValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  summaryLabel: { fontSize: 12, color: colors.textMuted },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardDate: { fontSize: 14, fontWeight: '700', color: colors.text },
  cardHours: { fontSize: 14, fontWeight: '800', color: colors.primary },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
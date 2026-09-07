import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listBranches } from '../api/branches';
import { listStaff } from '../api/staff';
import { getSalesSummary } from '../api/sales';
import { listIngredientStock } from '../api/inventory';
import { listAttendance } from '../api/attendance';
import { Chip } from '../components/ui';
import { useBranchStore } from '../state/branchStore';
import { colors, radius, spacing } from '../theme';
import { dayPresetLabels, type DayPreset, dayRange, fmtMoney } from '../utils';

export default function DashboardScreen() {
  const { branches, setBranches, selectedBranchId, setSelectedBranchId } = useBranchStore();
  const [preset, setPreset] = useState<DayPreset>('today');
  const [summary, setSummary] = useState<{ total_revenue: number; sale_rows: number; units_sold: number } | null>(null);
  const [lowCount, setLowCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [onClock, setOnClock] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let allBranches = branches;
      if (allBranches.length === 0) {
        allBranches = await listBranches();
        setBranches(allBranches);
      }
      const { start, end } = dayRange(preset);
      const [s, staff, attendance, branchStock] = await Promise.all([
        getSalesSummary({ from: start, to: end, branchId: selectedBranchId }),
        listStaff(),
        listAttendance({}),
        selectedBranchId ? listIngredientStock(selectedBranchId) : Promise.resolve([]),
      ]);
      setSummary(s);
      setStaffCount(staff.length);
      setOnClock(attendance.filter((a) => a.time_out === null).length);
      setLowCount(
        branchStock.filter((b) => b.low_stock_threshold > 0 && b.quantity_on_hand < b.low_stock_threshold).length
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [preset, selectedBranchId, branches, setBranches]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={styles.chips}>
        {(Object.keys(dayPresetLabels) as DayPreset[]).map((k) => (
          <Chip key={k} label={dayPresetLabels[k]} selected={preset === k} onPress={() => setPreset(k)} />
        ))}
      </View>
      <Pressable style={styles.branchChip} onPress={() => {}}>
        <Ionicons name="business-outline" size={15} color={colors.primary} />
        <Text style={styles.branchChipText}>
          {branches.find((b) => b.id === selectedBranchId)?.name ?? 'Select branch'}
        </Text>
      </Pressable>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : summary ? (
        <View style={styles.statsRow}>
          <StatCard
            icon="trending-up-outline"
            label="Revenue"
            value={fmtMoney(summary.total_revenue)}
            color={colors.primary}
          />
          <StatCard
            icon="receipt-outline"
            label="Transactions"
            value={String(summary.sale_rows)}
            color={colors.success}
          />
          <StatCard
            icon="bag-check-outline"
            label="Units sold"
            value={String(summary.units_sold)}
            color={colors.warning}
          />
          <StatCard
            icon="cube-outline"
            label="Low stock"
            value={String(lowCount)}
            color={lowCount > 0 ? colors.danger : colors.success}
          />
          <StatCard
            icon="people-outline"
            label="Staff"
            value={String(staffCount)}
            color={colors.primary}
          />
          <StatCard
            icon="finger-print-outline"
            label="Clocked in"
            value={String(onClock)}
            color={colors.success}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.card}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginTop: spacing.sm,
  },
  branchChipText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  error: {
    marginTop: spacing.sm,
    backgroundColor: `${colors.danger}12`,
    color: colors.danger,
    padding: spacing.sm,
    borderRadius: radius.sm,
    fontSize: 13,
  },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  card: {
    flexBasis: '46%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: 4,
  },
  cardValue: { fontSize: 22, fontWeight: '800' },
  cardLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
});
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listBranches } from '../api/branches';
import { listSales, listSaleItems } from '../api/sales';
import type { SaleWithDetails } from '../api/types';
import { Badge, Chip, EmptyState, PickerModal } from '../components/ui';
import { useBranchStore } from '../state/branchStore';
import { colors, radius, spacing } from '../theme';
import { dayPresetLabels, type DayPreset, dayRange, fmtDateTime, fmtMoney } from '../utils';

export default function HistoryScreen() {
  const { branches, setBranches, selectedBranchId, setSelectedBranchId } = useBranchStore();
  const [sales, setSales] = useState<SaleWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<DayPreset>('today');
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
      const rows = await listSales({
        from: start,
        to: end,
        branchId: selectedBranchId,
        limit: 500,
      });
      setSales(rows);
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

  const total = sales.reduce((sum, s) => sum + s.total, 0);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    const sale = sales.find((s) => s.id === id);
    if (sale && !sale.items) {
      const items = await listSaleItems([id]);
      setSales((prev) => prev.map((s) => (s.id === id ? { ...s, items } : s)));
    }
    setExpandedId(id);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Sales history</Text>
        <Pressable style={styles.filterBtn} onPress={() => setShowBranchPicker(true)}>
          <Ionicons name="business-outline" size={15} color={colors.primary} />
          <Text style={styles.filterBtnText} numberOfLines={1}>
            {branches.find((b) => b.id === selectedBranchId)?.name ?? 'All branches'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.chips}>
        {(Object.keys(dayPresetLabels) as DayPreset[]).map((k) => (
          <Chip key={k} label={dayPresetLabels[k]} selected={preset === k} onPress={() => setPreset(k)} />
        ))}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Total for selected period</Text>
        <Text style={styles.summaryValue}>{fmtMoney(total)}</Text>
        <Text style={styles.summarySub}>{sales.length} transaction{sales.length === 1 ? '' : 's'}</Text>
      </View>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState text="No sales in this period." />}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => toggleExpand(item.id)}>
              <View style={styles.cardRow}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTime}>{fmtDateTime(item.created_at)}</Text>
                  <Text style={styles.cardMeta}>
                    {item.branch_name ?? '—'}
                    {item.user_name ? ` · ${item.user_name}` : ''} · {item.payment_method}
                  </Text>
                  <Badge label={item.id.slice(0, 8).toUpperCase()} color={colors.textMuted} />
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.cardTotal}>{fmtMoney(item.total)}</Text>
                  <Ionicons name={expandedId === item.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                </View>
              </View>
              {expandedId === item.id && item.items ? (
                <View style={styles.items}>
                  {item.items.map((it) => (
                    <View key={it.product_id} style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {it.product_name} × {it.quantity_sold}
                      </Text>
                      <Text style={styles.itemTotal}>{fmtMoney(it.total_price)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}

      {showBranchPicker ? (
        <PickerModal
          visible
          title="Filter by branch"
          options={[
            { label: 'All branches', value: 'all' },
            ...branches.map((b) => ({ label: b.name, value: b.id })),
          ]}
          onClose={() => setShowBranchPicker(false)}
          onSelect={(v) => {
            setSelectedBranchId(v === 'all' ? null : v);
            setShowBranchPicker(false);
          }}
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
  chips: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, flexWrap: 'wrap' },
  summary: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 12, color: colors.textMuted },
  summaryValue: { fontSize: 24, fontWeight: '800', color: colors.primary },
  summarySub: { fontSize: 12, color: colors.textMuted },
  error: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: `${colors.danger}12`,
    color: colors.danger,
    padding: spacing.sm,
    borderRadius: radius.sm,
    fontSize: 13,
  },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  cardInfo: { flex: 1, gap: 4 },
  cardTime: { fontSize: 14, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  cardRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  cardTotal: { fontSize: 16, fontWeight: '800', color: colors.text },
  items: { marginTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  itemName: { fontSize: 13, color: colors.text, flex: 1 },
  itemTotal: { fontSize: 13, fontWeight: '700', color: colors.text },
});
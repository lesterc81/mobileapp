import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { BigButton, Chip, EmptyState } from '../components/ui';
import { getSalesSummary, listSales, type SalesSummary, type SaleWithProduct } from '../db';
import { useDataVersion } from '../state/dataVersion';
import { colors, radius, spacing } from '../theme';
import { dayPresetLabels, dayRange, fmtDate, fmtDateTime, fmtMoney, fmtQty, type DayPreset } from '../utils';

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [preset, setPreset] = useState<DayPreset>('today');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [sales, setSales] = useState<SaleWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const dataVersion = useDataVersion((s) => s.version);

  const range = useMemo(() => dayRange(preset), [preset]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(
      (s) =>
        s.product_name.toLowerCase().includes(q) || (s.user_name?.toLowerCase().includes(q) ?? false)
    );
  }, [sales, query]);

  const load = useCallback(async () => {
    const [sum, rows] = await Promise.all([
      getSalesSummary(db, { from: range.start, to: range.end }),
      listSales(db, { from: range.start, to: range.end, limit: 500 }),
    ]);
    setSummary(sum);
    setSales(rows);
    setLoading(false);
  }, [db, range]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const presets: DayPreset[] = ['today', 'yesterday', 'week', 'month', 'all'];

  const shareReport = async () => {
    const rangeLabel = range.start ? `${fmtDate(range.start)} – ${fmtDate(range.end ?? range.start)}` : 'All time';
    const lines = sales.map(
      (s) => `- ${s.quantity_sold} × ${s.product_name} — ${fmtMoney(s.total_price)}`
    );
    const message = [
      `Sales report — ${dayPresetLabels[preset]}`,
      `Period: ${rangeLabel}`,
      `Revenue: ${fmtMoney(summary?.total_revenue ?? 0)}`,
      `Transactions: ${summary?.sale_rows ?? 0}`,
      `Units sold: ${fmtQty(summary?.units_sold ?? 0)}`,
      '',
      ...(lines.length ? lines : ['No sales recorded in this period.']),
    ].join('\n');
    await Share.share({ message });
  };

  return (
    <View style={styles.container}>
      <View style={styles.chipRow}>
        {presets.map((p) => (
          <Chip key={p} label={dayPresetLabels[p]} selected={preset === p} onPress={() => setPreset(p)} />
        ))}
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard label="Revenue" value={summary ? fmtMoney(summary.total_revenue) : '—'} />
        <SummaryCard label="Sales" value={summary ? String(summary.sale_rows) : '—'} />
        <SummaryCard label="Units" value={summary ? fmtQty(summary.units_sold) : '—'} />
      </View>

      <View style={styles.shareRow}>
        <BigButton title="Share report" variant="ghost" icon="share-outline" onPress={shareReport} disabled={!summary} />
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search product or user…"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState text={loading ? 'Loading…' : 'No sales in this period.'} />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text numberOfLines={1} style={styles.rowName}>
                {item.product_name}
              </Text>
              <Text style={styles.rowMeta}>
                {fmtDateTime(item.timestamp)} · {item.quantity_sold} × {fmtMoney(item.total_price / item.quantity_sold)}
                {item.user_name ? ` · ${item.user_name}` : ''}
              </Text>
            </View>
            <Text style={styles.rowTotal}>{fmtMoney(item.total_price)}</Text>
          </View>
        )}
      />
    </View>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  searchWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  shareRow: {
    paddingHorizontal: spacing.md,
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  rowTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    marginLeft: spacing.md,
  },
});
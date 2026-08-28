import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, BigButton, Chip, EmptyState, Field, ModalShell } from '../components/ui';
import {
  adjustIngredient,
  createIngredient,
  deleteIngredient,
  listIngredients,
  updateIngredient,
  type Ingredient,
} from '../db';
import { useDataVersion } from '../state/dataVersion';
import { useUserStore } from '../state/userStore';
import { colors, radius, spacing } from '../theme';
import { fmtQty } from '../utils';

const REASONS = ['Restock', 'Waste', 'Damage', 'Correction'];

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null);
  const [query, setQuery] = useState('');
  const dataVersion = useDataVersion((s) => s.version);
  const bump = useDataVersion((s) => s.bump);
  const userId = useUserStore((s) => s.activeUser?.id ?? null);

  const load = useCallback(async () => {
    const rows = await listIngredients(db);
    setIngredients(rows);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const lowCount = ingredients.filter((i) => i.quantity_on_hand <= i.low_stock_threshold).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter((i) => i.name.toLowerCase().includes(q));
  }, [ingredients, query]);

  const handleSaved = () => {
    setFormOpen(false);
    setEditing(null);
    bump();
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarText}>
          {ingredients.length} ingredient{ingredients.length === 1 ? '' : 's'}
          {lowCount > 0 ? ` · ${lowCount} low` : ''}
        </Text>
        <View style={styles.toolbarButtons}>
          <Pressable style={[styles.addBtn, styles.toolbarGhost]} onPress={() => setRestockOpen(true)}>
            <Text style={styles.toolbarGhostText}>Restock</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => { setEditing(null); setFormOpen(true); }}>
            <Text style={styles.addBtnText}>+ New</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search ingredients…"
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
        ListEmptyComponent={<EmptyState text={loading ? 'Loading…' : 'No ingredients yet. Add one to get started.'} />}
        renderItem={({ item }) => {
          const isLow = item.quantity_on_hand <= item.low_stock_threshold;
          return (
            <View style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => { setAdjusting(item); }}>
                <View style={styles.rowInfo}>
                  <View style={styles.rowTitleLine}>
                    <Text numberOfLines={1} style={styles.rowName}>
                      {item.name}
                    </Text>
                    {isLow ? <Badge label="Low" /> : null}
                  </View>
                  <Text style={styles.rowQty}>
                    {fmtQty(item.quantity_on_hand)} {item.unit}
                  </Text>
                  {item.units_per_pack ? (
                    <Text style={styles.rowPack}>
                      ≈ {fmtQty(item.quantity_on_hand / item.units_per_pack)} {item.pack_name || 'pack'} · {fmtQty(item.units_per_pack)} {item.unit}/{item.pack_name || 'pack'}
                    </Text>
                  ) : null}
                  <Text style={styles.rowThreshold}>Low at ≤ {fmtQty(item.low_stock_threshold)} {item.unit}</Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable style={styles.smallBtn} onPress={() => { setEditing(item); setFormOpen(true); }}>
                    <Text style={styles.smallBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable style={[styles.smallBtn, styles.smallBtnPrimary]} onPress={() => setAdjusting(item)}>
                    <Text style={styles.smallBtnTextPrimary}>Adjust</Text>
                  </Pressable>
                </View>
              </Pressable>
            </View>
          );
        }}
      />

      <IngredientFormModal
        visible={formOpen}
        ingredient={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={handleSaved}
      />

      <AdjustStockModal
        visible={adjusting !== null}
        ingredient={adjusting}
        onClose={() => setAdjusting(null)}
        onAdjusted={() => { setAdjusting(null); bump(); }}
      />

      <RestockModal
        visible={restockOpen}
        ingredients={ingredients}
        onClose={() => setRestockOpen(false)}
      />
    </View>
  );
}

function IngredientFormModal({
  visible,
  ingredient,
  onClose,
  onSaved,
}: {
  visible: boolean;
  ingredient: Ingredient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const db = useSQLiteContext();
  const userId = useUserStore((s) => s.activeUser?.id ?? null);
  const isNew = ingredient === null;
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [qty, setQty] = useState('0');
  const [threshold, setThreshold] = useState('0');
  const [unitsPerPack, setUnitsPerPack] = useState('');
  const [packName, setPackName] = useState('pack');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(ingredient?.name ?? '');
      setUnit(ingredient?.unit ?? 'pcs');
      setQty(ingredient ? String(ingredient.quantity_on_hand) : '0');
      setThreshold(ingredient ? String(ingredient.low_stock_threshold) : '0');
      setUnitsPerPack(ingredient?.units_per_pack != null ? String(ingredient.units_per_pack) : '');
      setPackName(ingredient?.pack_name || 'pack');
    }
  }, [visible, ingredient]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Missing name', 'Give the ingredient a name.');
      return;
    }
    const unitValue = unit.trim() || 'pcs';
    const qtyValue = parseFloat(qty);
    const thresholdValue = parseFloat(threshold);
    if (isNaN(qtyValue) || qtyValue < 0 || isNaN(thresholdValue) || thresholdValue < 0) {
      Alert.alert('Invalid number', 'Quantities must be 0 or greater.');
      return;
    }
    const trimmedPack = unitsPerPack.trim();
    let packValue: number | null = null;
    if (trimmedPack !== '') {
      packValue = parseFloat(trimmedPack);
      if (isNaN(packValue) || packValue <= 0) {
        Alert.alert('Invalid bulk size', 'Pieces per bulk unit must be greater than zero.');
        return;
      }
    }
    const packNameValue = packName.trim() || 'pack';
    setSaving(true);
    try {
      if (isNew) {
        const id = await createIngredient(db, {
          name: trimmed,
          unit: unitValue,
          quantity_on_hand: qtyValue,
          low_stock_threshold: thresholdValue,
          units_per_pack: packValue,
          pack_name: packNameValue,
        });
        if (qtyValue > 0) {
          await db.runAsync(
            'INSERT INTO stock_movements (ingredient_id, change_amount, reason, timestamp, related_sale_id, user_id) VALUES (?, ?, ?, ?, ?, ?)',
            id,
            qtyValue,
            'initial_stock',
            new Date().toISOString(),
            null,
            userId
          );
        }
      } else {
        await updateIngredient(db, ingredient.id, {
          name: trimmed,
          unit: unitValue,
          low_stock_threshold: thresholdValue,
          units_per_pack: packValue,
          pack_name: packNameValue,
        });
      }
      onSaved();
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!ingredient) return;
    Alert.alert(
      'Delete ingredient',
      `Delete "${ingredient.name}"? It will be removed from every product recipe.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIngredient(db, ingredient.id);
              onSaved();
            } catch (err) {
              Alert.alert('Delete failed', err instanceof Error ? err.message : 'Unknown error');
            }
          },
        },
      ]
    );
  };

  return (
    <ModalShell visible={visible} title={isNew ? 'New ingredient' : 'Edit ingredient'} onClose={onClose}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Bread" />
      <Field label="Unit" value={unit} onChangeText={setUnit} placeholder="pcs, g, ml, slices" />
      {isNew ? (
        <Field label="Starting quantity" value={qty} onChangeText={setQty} keyboardType="decimal-pad" suffix={unit || 'pcs'} />
      ) : null}
      <Field
        label="Low-stock alert threshold"
        value={threshold}
        onChangeText={setThreshold}
        keyboardType="decimal-pad"
        suffix={unit || 'pcs'}
      />
      <Field
        label="Pieces per bulk unit (optional)"
        value={unitsPerPack}
        onChangeText={setUnitsPerPack}
        keyboardType="decimal-pad"
        placeholder="e.g. 12"
        suffix={`${unit || 'pcs'}/bulk`}
      />
      {unitsPerPack.trim() !== '' ? (
        <>
          <Field
            label="Name of the bulk unit"
            value={packName}
            onChangeText={setPackName}
            placeholder="pack, kg, dozen, tray…"
          />
          <Text style={styles.packHint}>
            e.g. 1 kg = 1000 g — lets you add/remove stock in {packName.trim() || 'bulk units'}.
          </Text>
        </>
      ) : null}
      <BigButton title={isNew ? 'Create ingredient' : 'Save changes'} onPress={save} disabled={saving} />
      {!isNew ? <BigButton title="Delete ingredient" variant="danger" onPress={remove} /> : null}
    </ModalShell>
  );
}

function AdjustStockModal({
  visible,
  ingredient,
  onClose,
  onAdjusted,
}: {
  visible: boolean;
  ingredient: Ingredient | null;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const db = useSQLiteContext();
  const userId = useUserStore((s) => s.activeUser?.id ?? null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'units' | 'packs'>('units');
  const [reason, setReason] = useState('Restock');
  const [customReason, setCustomReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount('');
      setMode('units');
      setReason('Restock');
      setCustomReason('');
    }
  }, [visible]);

  const hasPacks = ingredient?.units_per_pack != null && ingredient.units_per_pack > 0;
  const packLabel = (ingredient?.pack_name || 'pack').toLowerCase();
  const factor = hasPacks && mode === 'packs' ? (ingredient.units_per_pack as number) : 1;

  const apply = async (sign: 1 | -1) => {
    if (!ingredient) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }
    const change = parsed * factor * sign;
    const finalReason = REASONS.includes(reason) ? reason.toLowerCase() : customReason.trim() || 'manual';
    setSaving(true);
    try {
      await adjustIngredient(db, ingredient.id, { change_amount: change, reason: finalReason }, { userId });
      onAdjusted();
    } catch (err) {
      Alert.alert('Adjustment failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell visible={visible} title={`Adjust ${ingredient?.name ?? ''}`} onClose={onClose}>
      <Text style={styles.currentQty}>
        On hand: {ingredient ? `${fmtQty(ingredient.quantity_on_hand)} ${ingredient.unit}` : ''}
        {hasPacks && ingredient ? ` ≈ ${fmtQty(ingredient.quantity_on_hand / (ingredient.units_per_pack as number))} ${packLabel}` : ''}
      </Text>
      {hasPacks ? (
        <>
          <Text style={styles.reasonLabel}>Adjust by</Text>
          <View style={styles.chipRow}>
            <Chip label={ingredient?.unit ?? 'pcs'} selected={mode === 'units'} onPress={() => setMode('units')} />
            <Chip label={packLabel} selected={mode === 'packs'} onPress={() => setMode('packs')} />
          </View>
        </>
      ) : null}
      <Field
        label={mode === 'packs' ? packLabel : 'Amount'}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="e.g. 12"
        suffix={mode === 'packs' ? packLabel : (ingredient?.unit ?? '')}
      />
      <Text style={styles.reasonLabel}>Reason</Text>
      <View style={styles.chipRow}>
        {REASONS.map((r) => (
          <Chip key={r} label={r} selected={reason === r} onPress={() => { setReason(r); setCustomReason(''); }} />
        ))}
        <Chip label="Custom…" selected={reason === 'Custom'} onPress={() => setReason('Custom')} />
      </View>
      {reason === 'Custom' ? (
        <Field label="Custom reason" value={customReason} onChangeText={setCustomReason} placeholder="e.g. spilled batch" />
      ) : null}
      <View style={styles.adjustRow}>
        <Pressable
          style={[styles.addRemoveBtn, styles.addStockBtn]}
          onPress={() => apply(1)}
          disabled={saving}
        >
          <Text style={styles.addRemoveBtnText}>+ Add</Text>
        </Pressable>
        <Pressable
          style={[styles.addRemoveBtn, styles.removeBtn]}
          onPress={() => apply(-1)}
          disabled={saving}
        >
          <Text style={styles.addRemoveBtnText}>− Remove</Text>
        </Pressable>
      </View>
    </ModalShell>
  );
}

function RestockModal({
  visible,
  ingredients,
  onClose,
}: {
  visible: boolean;
  ingredients: Ingredient[];
  onClose: () => void;
}) {
  const low = useMemo(
    () =>
      ingredients
        .filter((i) => i.quantity_on_hand <= i.low_stock_threshold)
        .sort((a, b) => {
          const aRatio = a.low_stock_threshold > 0 ? a.quantity_on_hand / a.low_stock_threshold : 1;
          const bRatio = b.low_stock_threshold > 0 ? b.quantity_on_hand / b.low_stock_threshold : 1;
          return aRatio - bRatio;
        }),
    [ingredients]
  );

  const share = async () => {
    if (low.length === 0) return;
    const lines = low.map((item) => {
      const need = Math.max(0, Math.ceil(item.low_stock_threshold - item.quantity_on_hand));
      let suggestion = `${need} ${item.unit}`;
      if (item.units_per_pack && item.units_per_pack > 0) {
        const packs = Math.max(1, Math.ceil(need / item.units_per_pack));
        suggestion += ` (≈ ${packs} ${item.pack_name || 'pack'})`;
      }
      return `- ${item.name}: ${fmtQty(item.quantity_on_hand)} ${item.unit} on hand, buy ${suggestion}`;
    });
    await Share.share({
      message: `Restock list — ${new Date().toLocaleDateString()}\n${lines.join('\n')}`,
    });
  };

  return (
    <ModalShell visible={visible} title="Restock list" onClose={onClose}>
      {low.length === 0 ? (
        <EmptyState text="All good — nothing is below its low-stock threshold." />
      ) : (
        <>
          {low.map((item) => {
            const need = Math.max(0, Math.ceil(item.low_stock_threshold - item.quantity_on_hand));
            const hasPacks = item.units_per_pack != null && item.units_per_pack > 0;
            return (
              <View key={item.id} style={styles.restockRow}>
                <View style={styles.restockInfo}>
                  <Text style={styles.restockName}>{item.name}</Text>
                  <Text style={styles.restockMeta}>
                    On hand: {fmtQty(item.quantity_on_hand)} {item.unit} · low ≤ {fmtQty(item.low_stock_threshold)}{' '}
                    {item.unit}
                  </Text>
                </View>
                <Text style={styles.restockNeed}>
                  Buy {fmtQty(need)} {item.unit}
                  {hasPacks
                    ? ` (≈ ${Math.max(1, Math.ceil(need / (item.units_per_pack as number)))} ${item.pack_name || 'pack'})`
                    : ''}
                </Text>
              </View>
            );
          })}
          <BigButton title="Share list" icon="share-outline" onPress={share} />
        </>
      )}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  toolbarText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  toolbarButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
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
  toolbarGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  toolbarGhostText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  addStockBtn: {
    backgroundColor: colors.success,
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
    overflow: 'hidden',
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  rowQty: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 4,
  },
  rowPack: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowThreshold: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowActions: {
    gap: spacing.sm,
  },
  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  smallBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  smallBtnTextPrimary: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  currentQty: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  packHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  adjustRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  addRemoveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: radius.md,
  },
  removeBtn: {
    backgroundColor: colors.danger,
  },
  addRemoveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  restockRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  restockInfo: {
    gap: 2,
  },
  restockName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  restockMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  restockNeed: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    marginTop: spacing.xs,
  },
});
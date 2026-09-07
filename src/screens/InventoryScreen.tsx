import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  adjustIngredient,
  createIngredientWithPacks,
  createIngredient,
  listIngredientStock,
} from '../api/inventory';
import type { IngredientStock } from '../api/inventory';
import { listBranches } from '../api/branches';
import { BigButton, Field, ModalShell, PickerModal, QtyStepper, EmptyState } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useBranchStore } from '../state/branchStore';
import { colors, radius, spacing } from '../theme';
import { fmtQty } from '../utils';

export default function InventoryScreen() {
  const { profile } = useAuth();
  const { branches, setBranches, selectedBranchId, setSelectedBranchId } = useBranchStore();
  const [stock, setStock] = useState<IngredientStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<IngredientStock | null>(null);

  const canEdit = profile?.role === 'owner' || profile?.role === 'manager';

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let allBranches = branches;
      if (allBranches.length === 0) {
        allBranches = await listBranches();
        setBranches(allBranches);
      }
      if (!selectedBranchId) {
        const preferred = profile.branch_id ?? allBranches[0]?.id ?? null;
        if (preferred) setSelectedBranchId(preferred);
      }
      const s = await listIngredientStock(selectedBranchId ?? profile.branch_id);
      setStock(s);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profile, branches, selectedBranchId, setBranches, setSelectedBranchId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const branch = branches.find((b) => b.id === selectedBranchId);

  const anyLow = stock.some(
    (s) => s.low_stock_threshold > 0 && s.quantity_on_hand < s.low_stock_threshold
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Pressable style={styles.branchBtn} onPress={() => setShowBranchPicker(true)}>
          <Ionicons name="business-outline" size={15} color={colors.primary} />
          <Text style={styles.branchBtnText} numberOfLines={1}>
            {branch?.name ?? 'Select branch'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </Pressable>
        {canEdit ? (
          <Pressable style={styles.addBtn} onPress={() => setAddOpen(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={stock}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState text="No ingredients yet. Add the first one." />}
          renderItem={({ item }) => {
            const low =
              item.low_stock_threshold > 0 && item.quantity_on_hand < item.low_stock_threshold;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.cardQty, low && { color: colors.danger }]}>
                    {fmtQty(item.quantity_on_hand)} {item.unit}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>
                  {item.pack_name === 'pack' && item.units_per_pack
                    ? `${fmtQty(item.units_per_pack)} ${item.unit} per ${item.pack_name}`
                    : `Sold by the ${item.unit}`}
                  {item.low_stock_threshold > 0
                    ? ` · restock at ${fmtQty(item.low_stock_threshold)}`
                    : ''}
                </Text>
                {canEdit ? (
                  <Pressable style={styles.adjustLink} onPress={() => setAdjustTarget(item)}>
                    <Ionicons name="swap-vertical" size={14} color={colors.primary} />
                    <Text style={styles.adjustLinkText}>Adjust stock</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
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

      {addOpen && canEdit ? (
        <AddIngredientModal
          branchId={branch?.id ?? null}
          userId={profile?.id ?? ''}
          onDone={async () => {
            setAddOpen(false);
            await load();
          }}
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {adjustTarget && canEdit ? (
        <AdjustStockModal
          ingredient={adjustTarget}
          branchId={branch?.id ?? null}
          userId={profile?.id ?? ''}
          onDone={async () => {
            setAdjustTarget(null);
            await load();
          }}
          onClose={() => setAdjustTarget(null)}
        />
      ) : null}

      {anyLow ? (
        <View style={styles.lowBanner}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text style={styles.lowBannerText}>Some ingredients are below their restock level.</Text>
        </View>
      ) : null}
    </View>
  );
}

function AddIngredientModal({
  branchId,
  userId,
  onDone,
  onClose,
}: {
  branchId: string | null;
  userId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [isPack, setIsPack] = useState(false);
  const [packName, setPackName] = useState('pack');
  const [packCount, setPackCount] = useState('1');
  const [perPack, setPerPack] = useState('');
  const [looseQty, setLooseQty] = useState('0');
  const [threshold, setThreshold] = useState('0');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const piecesPerPack = useMemo(() => {
    const n = parseFloat(perPack);
    return isPack && Number.isFinite(n) && n > 0 ? n : 0;
  }, [perPack, isPack]);

  const totalQty = useMemo(() => {
    if (isPack) {
      const packs = parseInt(packCount, 10) || 0;
      return Math.round((packs * piecesPerPack) * 100) / 100;
    }
    const q = parseFloat(looseQty) || 0;
    return Math.round(q * 100) / 100;
  }, [isPack, packCount, piecesPerPack, looseQty]);

  const submit = async () => {
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg('Name is required.');
      return;
    }
    if (isPack && piecesPerPack <= 0) {
      setErrorMsg('Set how many pieces are in one pack.');
      return;
    }
    setBusy(true);
    try {
      if (isPack) {
        await createIngredientWithPacks({
          name,
          unit,
          units_per_pack: piecesPerPack,
          pack_name: packName.trim() || 'pack',
          totalQuantity: totalQty,
          low_stock_threshold: parseFloat(threshold) || 0,
          branchId,
          userId,
        });
      } else {
        await createIngredient({
          name,
          unit,
          units_per_pack: null,
          pack_name: 'pack',
          quantity_on_hand: totalQty,
          low_stock_threshold: parseFloat(threshold) || 0,
          branchId,
          userId,
        });
      }
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell visible title="Add ingredient" onClose={busy ? () => {} : onClose}>
      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Chicken 1/4" />
      <Field label="Unit" value={unit} onChangeText={setUnit} placeholder="pcs / kg / g / ml" />

      <Pressable style={styles.toggleRow} onPress={() => setIsPack(!isPack)}>
        <Ionicons
          name={isPack ? 'checkbox' : 'square-outline'}
          size={20}
          color={isPack ? colors.primary : colors.textMuted}
        />
        <Text style={styles.toggleText}>This is a pack-based ingredient</Text>
      </Pressable>

      {isPack ? (
        <>
          <Field
            label="Packs received"
            value={packCount}
            onChangeText={setPackCount}
            keyboardType="number-pad"
            suffix="packs"
          />
          <Field
            label="Units per pack"
            value={perPack}
            onChangeText={setPerPack}
            keyboardType="decimal-pad"
          />
          <Field
            label="What to call each pack"
            value={packName}
            onChangeText={setPackName}
            placeholder="pack / box / dozen"
          />
        </>
      ) : (
        <Field
          label="Starting quantity"
          value={looseQty}
          onChangeText={setLooseQty}
          keyboardType="decimal-pad"
          suffix={unit || 'units'}
        />
      )}

      <Field
        label="Restock warning when at or below"
        value={threshold}
        onChangeText={setThreshold}
        keyboardType="decimal-pad"
        suffix={unit || 'units'}
      />

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Total stock on hand</Text>
        <Text style={styles.totalValue}>
          {fmtQty(totalQty)} {unit}
        </Text>
      </View>

      <BigButton
        title={busy ? 'Saving…' : 'Save ingredient'}
        onPress={submit}
        disabled={busy}
        icon="checkmark-circle-outline"
      />
    </ModalShell>
  );
}

function AdjustStockModal({
  ingredient,
  branchId,
  userId,
  onDone,
  onClose,
}: {
  ingredient: IngredientStock;
  branchId: string | null;
  userId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [packs, setPacks] = useState('0');
  const [loose, setLoose] = useState('0');
  const [reason, setReason] = useState('restock');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const unitsPerPack = ingredient.units_per_pack ?? 0;
  const perLoose = useMemo(() => parseFloat(loose) || 0, [loose]);
  const packsNum = useMemo(() => parseInt(packs, 10) || 0, [packs]);
  const addQty = useMemo(
    () => Math.round((packsNum * unitsPerPack + (Number.isNaN(perLoose) ? 0 : perLoose)) * 100) / 100,
    [packsNum, unitsPerPack, perLoose]
  );

  const applyAdjustment = async (direction: 'add' | 'remove') => {
    if (!branchId) {
      setErrorMsg('Select a branch first.');
      return;
    }
    if (addQty <= 0) {
      setErrorMsg('Enter a quantity greater than zero.');
      return;
    }
    const change = direction === 'add' ? addQty : -addQty;
    setErrorMsg(null);
    setBusy(true);
    try {
      await adjustIngredient(ingredient.id, branchId, { change_amount: change, reason }, { userId });
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell visible title={`Restock ${ingredient.name}`} onClose={busy ? () => {} : onClose}>
      <Text style={styles.currentStock}>
        Currently on hand: {fmtQty(ingredient.quantity_on_hand)} {ingredient.unit}
      </Text>

      {ingredient.units_per_pack ? (
        <Field
          label={`Number of ${ingredient.pack_name}s`}
          value={packs}
          onChangeText={setPacks}
          keyboardType="number-pad"
          suffix={`${ingredient.pack_name}s`}
        />
      ) : null}

      <Field
        label={`Loose ${ingredient.unit}s`}
        value={loose}
        onChangeText={setLoose}
        keyboardType="decimal-pad"
        suffix={ingredient.unit}
      />
      <Field
        label="Reason"
        value={reason}
        onChangeText={setReason}
        placeholder="restock / spoilage / count"
      />

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Will add to stock</Text>
        <Text style={styles.totalValue}>
          +{fmtQty(addQty)} {ingredient.unit}
        </Text>
      </View>

      <BigButton
        title={busy ? 'Saving…' : `Add ${fmtQty(addQty)} ${ingredient.unit}`}
        onPress={() => applyAdjustment('add')}
        disabled={busy}
        icon="add-circle-outline"
      />
      {addQty > 0 ? (
        <BigButton
          title={`Remove ${fmtQty(addQty)} ${ingredient.unit}`}
          onPress={() => applyAdjustment('remove')}
          disabled={busy}
          variant="danger"
          icon="remove-circle-outline"
        />
      ) : null}
    </ModalShell>
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
  branchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    maxWidth: '70%',
  },
  branchBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  cardQty: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  adjustLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  adjustLinkText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.md,
  },
  toggleText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  totalBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.primary },
  currentStock: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
  lowBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 16,
    backgroundColor: `${colors.warning}18`,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lowBannerText: { color: colors.warning, fontSize: 13, fontWeight: '600', flex: 1 },
});
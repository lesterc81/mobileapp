import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listBranches } from '../api/branches';
import { listProductsWithStock } from '../api/products';
import { getReceipt, sellProducts } from '../api/sales';
import type { Receipt as ReceiptData } from '../api/types';
import { Badge, BigButton, ModalShell, PickerModal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { cartCount, cartTotal, useCart } from '../state/cartStore';
import { useBranchStore } from '../state/branchStore';
import { colors, radius, spacing } from '../theme';
import { fmtDateTime, fmtMoney, fmtQty } from '../utils';

export default function SalesScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { lines, add, clear } = useCart();
  const { branches, setBranches, selectedBranchId, setSelectedBranchId } = useBranchStore();
  const [products, setProducts] = useState<Awaited<ReturnType<typeof listProductsWithStock>>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
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
      if (!selectedBranchId) {
        const preferred =
          profile.branch_id && allBranches.some((b) => b.id === profile.branch_id)
            ? profile.branch_id
            : (allBranches[0]?.id ?? null);
        if (preferred !== selectedBranchId) setSelectedBranchId(preferred);
      }
      const stock = await listProductsWithStock(selectedBranchId ?? profile.branch_id);
      setProducts(stock);
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
  const total = cartTotal(lines);
  const count = cartCount(lines);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const checkout = async (paymentMethod: string) => {
    if (!branch) {
      setErrorMsg('Select a branch first.');
      return;
    }
    setErrorMsg(null);
    setCheckoutBusy(true);
    try {
      const { saleId } = await sellProducts(
        branch.id,
        paymentMethod,
        lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
      );
      clear();
      const r = await getReceipt(saleId);
      setReceipt(r);
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const clean = msg.replace(/\n/g, ' ');
      setErrorMsg(clean.length > 140 ? clean.slice(0, 140) + '…' : clean);
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      <View style={styles.topBar}>
        <Pressable style={styles.branchBtn} onPress={() => setShowBranchPicker(true)}>
          <Ionicons name="business-outline" size={15} color={colors.primary} />
          <Text style={styles.branchBtnText} numberOfLines={1}>
            {branch?.name ?? 'Select branch'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </Pressable>
        <Text style={styles.cashier}>{profile?.full_name}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="storefront-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            {products.length === 0
              ? 'No products yet. Ask a manager to add products first.'
              : 'No products match your search.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.productList}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                onChangeText={setSearch}
                placeholder="Search products…"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          }
          renderItem={({ item }) => {
            const inCart = lines.find((l) => l.productId === item.id)?.quantity ?? 0;
            const soldOut = !!item.first_short;
            return (
              <Pressable
                style={styles.product}
                onPress={() => add({ id: item.id, name: item.name, price: item.price })}
                disabled={soldOut}
              >
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.productMeta}>
                    {fmtMoney(item.price)}
                    {item.category ? ` · ${item.category}` : ''}
                  </Text>
                  {soldOut ? <Badge label={`Short on ${item.first_short}`} /> : null}
                </View>
                {inCart > 0 ? (
                  <View style={styles.inCart}>
                    <Text style={styles.inCartText}>{fmtQty(inCart)}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      <View style={[styles.cartFooter, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.cartSummary}>
          <Text style={styles.cartLabel}>Items</Text>
          <Text style={styles.cartCount}>{count}</Text>
        </View>
        <BigButton
          title={checkoutBusy ? 'Processing…' : `Charge ${fmtMoney(total)}`}
          onPress={() => setShowCheckout(true)}
          disabled={checkoutBusy || count === 0 || !branch}
          icon="card-outline"
        />
      </View>

      {showBranchPicker ? (
        <PickerModal
          visible
          title="Select branch"
          options={branches.map((b) => ({ label: b.name, value: b.id }))}
          emptyLabel="No branches yet. Create one in Settings (owner)."
          onClose={() => setShowBranchPicker(false)}
          onSelect={(id) => {
            setSelectedBranchId(id);
            setShowBranchPicker(false);
          }}
        />
      ) : null}

      <CheckoutModal
        visible={showCheckout}
        total={total}
        count={count}
        busy={checkoutBusy}
        onCash={() => checkout('cash')}
        onCard={() => checkout('card')}
        onClose={() => setShowCheckout(false)}
      />

      {receipt ? (
        <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
      ) : null}
    </View>
  );
}

function CheckoutModal({
  visible,
  total,
  count,
  busy,
  onCash,
  onCard,
  onClose,
}: {
  visible: boolean;
  total: number;
  count: number;
  busy: boolean;
  onCash: () => void;
  onCard: () => void;
  onClose: () => void;
}) {
  return (
    <ModalShell visible={visible} title="Take payment" onClose={busy ? () => {} : onClose}>
      <Text style={styles.checkoutTotal}>{fmtMoney(total)}</Text>
      <Text style={styles.checkoutSub}>{count} item{count === 1 ? '' : 's'} · no tax</Text>
      <BigButton title="Cash" onPress={onCash} disabled={busy} icon="cash-outline" />
      <BigButton title="Card" onPress={onCard} disabled={busy} icon="card-outline" />
    </ModalShell>
  );
}

function ReceiptModal({ receipt, onClose }: { receipt: ReceiptData; onClose: () => void }) {
  return (
    <ModalShell visible title="Receipt" onClose={onClose}>
      <View style={styles.receiptHeader}>
        <Text style={styles.receiptBranch}>{receipt.branch_name || 'POS Cloud'}</Text>
        {receipt.branch_address ? (
          <Text style={styles.receiptMuted}>{receipt.branch_address}</Text>
        ) : null}
        <Text style={styles.receiptMuted}>Receipt #{receipt.sale_id.slice(0, 8).toUpperCase()}</Text>
        <Text style={styles.receiptMuted}>
          {fmtDateTime(receipt.created_at)} · {receipt.payment_method}
        </Text>
        {receipt.cashier_name ? (
          <Text style={styles.receiptMuted}>Served by {receipt.cashier_name}</Text>
        ) : null}
      </View>
      <View style={styles.receiptDivider} />
      {receipt.items.map((item, i) => (
        <View key={i} style={styles.receiptRow}>
          <View style={styles.receiptRowLeft}>
            <Text style={styles.receiptItemName} numberOfLines={1}>
              {item.product_name}
            </Text>
            <Text style={styles.receiptMuted}>
              {fmtQty(item.quantity_sold)} × {fmtMoney(item.unit_price)}
            </Text>
          </View>
          <Text style={styles.receiptItemTotal}>{fmtMoney(item.total_price)}</Text>
        </View>
      ))}
      <View style={styles.receiptDivider} />
      <View style={styles.receiptRow}>
        <Text style={styles.receiptTotalLabel}>TOTAL</Text>
        <Text style={styles.receiptTotal}>{fmtMoney(receipt.total)}</Text>
      </View>
      <Text style={styles.receiptThanks}>Thank you!</Text>
      <BigButton title="Done" onPress={onClose} icon="checkmark-circle-outline" />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  error: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: `${colors.danger}12`,
    color: colors.danger,
    padding: spacing.sm,
    borderRadius: radius.sm,
    fontSize: 13,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  cashier: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.text },
  productList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  productInfo: { flex: 1, gap: 2 },
  productName: { fontSize: 15, fontWeight: '700', color: colors.text },
  productMeta: { fontSize: 13, color: colors.textMuted },
  inCart: {
    minWidth: 30,
    height: 30,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  inCartText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  cartSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  cartLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  cartCount: { fontSize: 18, fontWeight: '800', color: colors.text },
  checkoutTotal: { fontSize: 34, fontWeight: '800', color: colors.text, textAlign: 'center' },
  checkoutSub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  receiptHeader: { alignItems: 'center', gap: 2 },
  receiptBranch: { fontSize: 18, fontWeight: '800', color: colors.text },
  receiptMuted: { fontSize: 12, color: colors.textMuted },
  receiptDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
    borderStyle: 'dashed',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  receiptRowLeft: { flex: 1, paddingRight: spacing.md },
  receiptItemName: { fontSize: 14, fontWeight: '600', color: colors.text },
  receiptItemTotal: { fontSize: 14, fontWeight: '700', color: colors.text },
  receiptTotalLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  receiptTotal: { fontSize: 18, fontWeight: '800', color: colors.primary },
  receiptThanks: {
    textAlign: 'center',
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
});
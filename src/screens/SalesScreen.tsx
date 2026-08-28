import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BigButton, EmptyState, ModalShell, QtyStepper } from '../components/ui';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import {
  getProductByBarcode,
  InsufficientStockError,
  listProductsWithStock,
  sellProducts,
  type ProductWithStock,
} from '../db';
import { useCart, cartCount, cartTotal } from '../state/cartStore';
import { useDataVersion } from '../state/dataVersion';
import { useUserStore } from '../state/userStore';
import { colors, radius, spacing } from '../theme';
import { fmtMoney } from '../utils';

export default function SalesScreen() {
  const db = useSQLiteContext();
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const dataVersion = useDataVersion((s) => s.version);
  const bump = useDataVersion((s) => s.bump);
  const userId = useUserStore((s) => s.activeUser?.id ?? null);

  const lines = useCart((s) => s.lines);
  const addToCart = useCart((s) => s.add);
  const increment = useCart((s) => s.increment);
  const decrement = useCart((s) => s.decrement);
  const clearCart = useCart((s) => s.clear);

  const qtyByProduct = new Map(lines.map((l) => [l.productId, l.quantity]));
  const count = cartCount(lines);
  const total = cartTotal(lines);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  const load = useCallback(async () => {
    const rows = await listProductsWithStock(db);
    setProducts(rows);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const handleScan = async (data: string) => {
    setScannerOpen(false);
    try {
      const product = await getProductByBarcode(db, data);
      if (product) {
        addToCart(product);
      } else {
        Alert.alert('No match', `${data} isn't linked to an active product. Add it on the Products tab.`);
      }
    } catch (err) {
      Alert.alert('Scan failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const completeSale = async () => {
    setSubmitting(true);
    try {
      const cart = lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
      const result = await sellProducts(db, cart, { userId });
      clearCart();
      setCartOpen(false);
      bump();
      const units = lines.reduce((n, l) => n + l.quantity, 0);
      Alert.alert('Sale completed', `${units} item(s) — ${fmtMoney(result.grandTotal)}`);
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        Alert.alert('Not enough stock', err.message);
      } else {
        Alert.alert('Sale failed', err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search products…"
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
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState text={loading ? 'Loading…' : 'No active products. Add some on the Products tab.'} />
        }
        renderItem={({ item }) => {
          const inCart = qtyByProduct.get(item.id) ?? 0;
          const short = item.first_short;
          return (
            <Pressable
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={() => addToCart(item)}
            >
              <Text numberOfLines={2} style={styles.tileName}>
                {item.name}
              </Text>
              {short ? <Text style={styles.tileShort}>Low: {short}</Text> : null}
              <View style={styles.tileBottom}>
                <Text style={styles.tilePrice}>{fmtMoney(item.price)}</Text>
                {inCart > 0 ? (
                  <View style={styles.tileBadge}>
                    <Text style={styles.tileBadgeText}>{inCart}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />

      <View style={styles.cartBar}>
        <Pressable
          style={({ pressed }) => [styles.scanBtn, pressed && styles.scanBtnPressed]}
          onPress={() => setScannerOpen(true)}
          accessibilityLabel="Scan barcode"
        >
          <Ionicons name="scan-outline" size={22} color={colors.primary} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.cartBarBtn, pressed && styles.cartBarBtnPressed]}
          onPress={() => setCartOpen(true)}
        >
          <Text style={styles.cartBarCount}>Cart · {count}</Text>
          <Text style={styles.cartBarTotal}>{fmtMoney(total)}</Text>
          <Text style={styles.cartBarChevron}>›</Text>
        </Pressable>
      </View>

      <BarcodeScannerModal visible={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleScan} />

      <ModalShell visible={cartOpen} title="Cart" onClose={() => setCartOpen(false)}>
        {lines.length === 0 ? (
          <EmptyState text="Cart is empty. Tap products to add them." />
        ) : (
          <>
            {lines.map((line) => (
              <View key={line.productId} style={styles.cartLine}>
                <View style={styles.cartLineInfo}>
                  <Text numberOfLines={1} style={styles.cartLineName}>
                    {line.name}
                  </Text>
                  <Text style={styles.cartLinePrice}>{fmtMoney(line.price)} each</Text>
                </View>
                <QtyStepper
                  value={line.quantity}
                  onDecrease={() => decrement(line.productId)}
                  onIncrease={() => increment(line.productId)}
                />
                <Text style={styles.cartLineSub}>{fmtMoney(line.price * line.quantity)}</Text>
              </View>
            ))}

            <View style={styles.cartTotalRow}>
              <Text style={styles.cartTotalLabel}>Total</Text>
              <Text style={styles.cartTotalValue}>{fmtMoney(total)}</Text>
            </View>

            <BigButton
              title={`Charge ${fmtMoney(total)}`}
              onPress={completeSale}
              disabled={submitting}
              icon="card-outline"
            />
            <BigButton title="Clear cart" variant="ghost" onPress={clearCart} disabled={submitting} />
          </>
        )}
      </ModalShell>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
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
  gridContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  gridRow: {
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    minHeight: 92,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tilePressed: {
    backgroundColor: colors.bg,
    transform: [{ scale: 0.98 }],
  },
  tileName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  tileShort: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
    marginTop: 2,
  },
  tileBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tilePrice: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  tileBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tileBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scanBtn: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtnPressed: {
    backgroundColor: colors.card,
  },
  cartBarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  cartBarBtnPressed: {
    backgroundColor: colors.primaryDark,
  },
  cartBarCount: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cartBarTotal: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  cartBarChevron: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },
  cartLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cartLineInfo: {
    flex: 1,
    minWidth: 0,
  },
  cartLineName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  cartLinePrice: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  cartLineSub: {
    minWidth: 64,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  cartTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  cartTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cartTotalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
});
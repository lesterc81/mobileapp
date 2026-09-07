import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createProduct,
  getProductWithRecipes,
  listProductsWithStats,
  updateProduct,
} from '../api/products';
import { listIngredients as inventoryListIngredients } from '../api/inventory';
import type { Ingredient, RecipeLine } from '../api/types';
import { BigButton, Field, ModalShell, EmptyState } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import { fmtMoney } from '../utils';

export default function ProductsScreen() {
  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof listProductsWithStats>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listProductsWithStats({ includeInactive: true });
      setProducts(rows);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Menu & recipes</Text>
        <Pressable style={styles.addBtn} onPress={() => setAddOpen(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState text="No products yet. Add the first menu item." />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {fmtMoney(item.price)}
                    {item.category ? ` · ${item.category}` : ''}
                    {item.barcode ? ` · ${item.barcode}` : ''}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {item.recipe_count === 0
                      ? 'No recipe (stock is not tracked)'
                      : `${item.recipe_count} ingredient${item.recipe_count === 1 ? '' : 's'} per unit`}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  {!item.is_active ? <Ionicons name="eye-off-outline" size={18} color={colors.textMuted} /> : null}
                  <Pressable
                    onPress={() => {
                      setEditingId(item.id);
                      setAddOpen(true);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="pencil-outline" size={20} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {addOpen ? (
        <ProductFormModal
          productId={editingId}
          onDone={() => {
            setAddOpen(false);
            setEditingId(null);
            load();
          }}
          onClose={() => {
            setAddOpen(false);
            setEditingId(null);
          }}
        />
      ) : null}
    </View>
  );
}

function ProductFormModal({
  productId,
  onDone,
  onClose,
}: {
  productId: string | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [recipes, setRecipes] = useState<(RecipeLine & { ingredient_name: string; unit: string })[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const editing = productId != null;

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const ings = await inventoryListIngredients();
          setIngredients(ings);
        } catch {
          setIngredients([]);
        }
      })();
    }, [editing])
  );

  useFocusEffect(
    useCallback(() => {
      if (!productId) return;
      (async () => {
        try {
          const full = await getProductWithRecipes(productId);
          if (!full) return;
          setName(full.name);
          setPrice(String(full.price));
          setCategory(full.category);
          setBarcode(full.barcode ?? '');
          setIsActive(full.is_active);
          setRecipes(full.recipes ?? []);
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
        }
      })();
    }, [productId])
  );

  const pickable = ingredients.filter(
    (i) => !recipes.some((r) => r.ingredient_id === i.id)
  );

  const addIngredient = (ingId: string) => {
    const ing = ingredients.find((i) => i.id === ingId);
    if (!ing) return;
    setRecipes((prev) => [...prev, { ingredient_id: ing.id, quantity_required: 1, ingredient_name: ing.name, unit: ing.unit }]);
    setPickOpen(false);
  };

  const submit = async () => {
    setErrorMsg(null);
    if (!name.trim() || !price) {
      setErrorMsg('Name and price are required.');
      return;
    }
    const input = {
      name: name.trim(),
      price: parseFloat(price) || 0,
      category: category.trim(),
      is_active: isActive,
      barcode: barcode.trim() || null,
      recipes: recipes.map((r) => ({ ingredient_id: r.ingredient_id, quantity_required: r.quantity_required })),
    };

    setBusy(true);
    try {
      if (editing && productId) await updateProduct(productId, input);
      else await createProduct(input);
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell visible title={editing ? 'Edit product' : 'Add product'} onClose={busy ? () => {} : onClose}>
      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Chicken Bowl" />
      <Field
        label="Price (₱)"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        suffix="₱"
      />
      <Field label="Category" value={category} onChangeText={setCategory} placeholder="e.g. Meals" />
      <Field
        label="Barcode (optional)"
        value={barcode}
        onChangeText={setBarcode}
        placeholder="Scan or type barcode"
        autoCapitalize="none"
      />

      <Pressable style={styles.toggleRow} onPress={() => setIsActive(!isActive)}>
        <Ionicons
          name={isActive ? 'checkbox' : 'square-outline'}
          size={20}
          color={isActive ? colors.primary : colors.textMuted}
        />
        <Text style={styles.toggleText}>Active (can be sold)</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Recipe (ingredients used per 1 unit)</Text>
      {recipes.length === 0 ? (
        <Text style={styles.hint}>No ingredients — selling this won't deduct stock.</Text>
      ) : (
        recipes.map((r) => (
          <View key={r.ingredient_id} style={styles.recipeRow}>
            <View style={styles.recipeInfo}>
              <Text style={styles.recipeName} numberOfLines={1}>
                {r.ingredient_name}
              </Text>
              <Text style={styles.recipeUnit}>{r.unit}</Text>
            </View>
            <Field
              label=""
              value={String(r.quantity_required)}
              onChangeText={(v) =>
                setRecipes((prev) =>
                  prev.map((x) =>
                    x.ingredient_id === r.ingredient_id
                      ? { ...x, quantity_required: parseFloat(v) || 0 }
                      : x
                  )
                )
              }
              keyboardType="decimal-pad"
              suffix={r.unit}
            />
            <Pressable
              onPress={() =>
                setRecipes((prev) => prev.filter((x) => x.ingredient_id !== r.ingredient_id))
              }
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
        ))
      )}

      {pickable.length > 0 ? (
        <BigButton
          title="Add ingredient to recipe"
          onPress={() => setPickOpen(true)}
          variant="ghost"
          icon="add"
        />
      ) : null}

      <BigButton
        title={busy ? 'Saving…' : 'Save product'}
        onPress={submit}
        disabled={busy}
        icon="checkmark-circle-outline"
      />

      {pickOpen ? (
        <PickerModalContent
          options={pickable.map((i) => ({ label: `${i.name} (${i.unit})`, value: i.id }))}
          onSelect={addIngredient}
          onClose={() => setPickOpen(false)}
        />
      ) : null}
    </ModalShell>
  );
}

function PickerModalContent({
  options,
  onSelect,
  onClose,
}: {
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <ModalShell visible title="Choose ingredient" onClose={onClose}>
      {options.map((o) => (
        <Pressable key={o.value} style={styles.pickerRow} onPress={() => onSelect(o.value)}>
          <Text style={styles.pickerRowText}>{o.label}</Text>
        </Pressable>
      ))}
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
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
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
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm },
  toggleText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: spacing.md },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  recipeInfo: { flex: 1 },
  recipeName: { fontSize: 14, fontWeight: '600', color: colors.text },
  recipeUnit: { fontSize: 12, color: colors.textMuted },
  pickerRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pickerRowText: { fontSize: 15, color: colors.text },
});
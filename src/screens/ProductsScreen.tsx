import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, BigButton, EmptyState, Field, ModalShell, PickerModal } from '../components/ui';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import {
  countProductSales,
  createProduct,
  deleteProduct,
  getProductWithRecipes,
  listIngredients,
  listProductsWithStats,
  updateProduct,
  type Ingredient,
  type ProductWithStats,
  type RecipeLine,
} from '../db';
import { useDataVersion } from '../state/dataVersion';
import { colors, radius, spacing } from '../theme';
import { fmtMoney, fmtQty } from '../utils';

interface RecipeDraft {
  ingredient_id: number | null;
  ingredient_name: string;
  quantity_required: string;
}

export default function ProductsScreen() {
  const db = useSQLiteContext();
  const [products, setProducts] = useState<ProductWithStats[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithStats | null>(null);
  const [query, setQuery] = useState('');
  const dataVersion = useDataVersion((s) => s.version);
  const bump = useDataVersion((s) => s.bump);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  const load = useCallback(async () => {
    const [rows, ingRows] = await Promise.all([listProductsWithStats(db, { includeInactive: true }), listIngredients(db)]);
    setProducts(rows);
    setIngredients(ingRows);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const handleSaved = () => {
    setFormOpen(false);
    setEditing(null);
    bump();
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarText}>{products.length} product{products.length === 1 ? '' : 's'}</Text>
        <Pressable style={styles.addBtn} onPress={() => { setEditing(null); setFormOpen(true); }}>
          <Text style={styles.addBtnText}>+ New</Text>
        </Pressable>
      </View>

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
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState text={loading ? 'Loading…' : 'No products yet. Create your first product.'} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => { setEditing(item); setFormOpen(true); }}
          >
            <View style={styles.rowInfo}>
              <View style={styles.rowTitleLine}>
                <Text numberOfLines={1} style={styles.rowName}>
                  {item.name}
                </Text>
                {!item.is_active ? <Badge label="Inactive" color={colors.textMuted} /> : null}
              </View>
              <Text style={styles.rowMeta}>
                {fmtMoney(item.price)} · {item.recipe_count} recipe item{item.recipe_count === 1 ? '' : 's'}
                {item.barcode ? ` · #${item.barcode}` : ''}
              </Text>
            </View>
            <Text style={styles.rowEdit}>Edit ›</Text>
          </Pressable>
        )}
      />

      <ProductFormModal
        visible={formOpen}
        product={editing}
        ingredients={ingredients}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={handleSaved}
      />
    </View>
  );
}

function ProductFormModal({
  visible,
  product,
  ingredients,
  onClose,
  onSaved,
}: {
  visible: boolean;
  product: ProductWithStats | null;
  ingredients: Ingredient[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const db = useSQLiteContext();
  const isNew = product === null;
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [recipes, setRecipes] = useState<RecipeDraft[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(product?.name ?? '');
      setPrice(product ? String(product.price) : '');
      setBarcode(product?.barcode ?? '');
      setIsActive(product?.is_active ?? true);
      setRecipes([]);
      if (product) {
        getProductWithRecipes(db, product.id).then((full) => {
          if (full) {
            setRecipes(
              full.recipes.map((r) => ({
                ingredient_id: r.ingredient_id,
                ingredient_name: r.ingredient_name,
                quantity_required: String(r.quantity_required),
              }))
            );
          }
        });
      }
    }
  }, [visible, product, db]);

  const usedIngredientIds = new Set(
    recipes.filter((r) => r.ingredient_id !== null).map((r) => r.ingredient_id as number)
  );
  const pickable = ingredients
    .filter((i) => !usedIngredientIds.has(i.id))
    .map((i) => ({ label: `${i.name} (${i.unit})`, value: i.id }));

  const addIngredient = (id: number) => {
    const ing = ingredients.find((i) => i.id === id);
    if (!ing) return;
    setRecipes((prev) => [...prev, { ingredient_id: id, ingredient_name: ing.name, quantity_required: '' }]);
    setPickerOpen(false);
  };

  const updateRecipeQty = (index: number, value: string) => {
    setRecipes((prev) => prev.map((r, i) => (i === index ? { ...r, quantity_required: value } : r)));
  };

  const removeRecipe = (index: number) => {
    setRecipes((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Missing name', 'Give the product a name.');
      return;
    }
    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue < 0) {
      Alert.alert('Invalid price', 'Price must be 0 or greater.');
      return;
    }
    const recipeLines: RecipeLine[] = [];
    for (const r of recipes) {
      if (r.ingredient_id === null) {
        Alert.alert('Incomplete recipe', 'Every recipe row needs an ingredient.');
        return;
      }
      const qty = parseFloat(r.quantity_required);
      if (isNaN(qty) || qty <= 0) {
        Alert.alert('Invalid quantity', `Quantity for "${r.ingredient_name}" must be greater than zero.`);
        return;
      }
      recipeLines.push({ ingredient_id: r.ingredient_id, quantity_required: qty });
    }
    setSaving(true);
    try {
      if (isNew) {
        await createProduct(db, { name: trimmedName, price: priceValue, is_active: isActive, barcode, recipes: recipeLines });
      } else {
        await updateProduct(db, product.id, { name: trimmedName, price: priceValue, is_active: isActive, barcode, recipes: recipeLines });
      }
      onSaved();
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    const saleCount = await countProductSales(db, product.id);
    if (saleCount > 0) {
      Alert.alert('Cannot delete', `"${product.name}" has ${saleCount} sale(s) on record. Deactivate it instead to hide it from the register.`);
      return;
    }
    Alert.alert('Delete product', `Delete "${product.name}"? Its recipe will also be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProduct(db, product.id);
            onSaved();
          } catch (err) {
            Alert.alert('Delete failed', err instanceof Error ? err.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  return (
    <ModalShell visible={visible} title={isNew ? 'New product' : 'Edit product'} onClose={onClose}>
      <Field label="Product name" value={name} onChangeText={setName} placeholder="e.g. Peanut Butter Bread" />
      <Field label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" suffix="$" />
      <Field
        label="Barcode (optional)"
        value={barcode}
        onChangeText={setBarcode}
        placeholder="Scan or type"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <BigButton title="Scan barcode" variant="ghost" icon="scan-outline" onPress={() => setScannerOpen(true)} />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Active (shown in register)</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>

      <Text style={styles.recipeHeader}>Recipe — what each unit consumes</Text>
      {recipes.length === 0 ? (
        <Text style={styles.recipeEmpty}>
          No ingredients yet. A product without a recipe sells without touching stock.
        </Text>
      ) : (
        recipes.map((r, index) => (
          <View key={index} style={styles.recipeRow}>
            <Text style={styles.recipeName} numberOfLines={1}>
              {r.ingredient_name || 'Pick an ingredient'}
            </Text>
            <View style={styles.recipeQtyWrap}>
              <Field
                label=""
                value={r.quantity_required}
                onChangeText={(v) => updateRecipeQty(index, v)}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>
            <Pressable style={styles.removeRecipeBtn} onPress={() => removeRecipe(index)} hitSlop={8}>
              <Text style={styles.removeRecipeText}>✕</Text>
            </Pressable>
          </View>
        ))
      )}

      <BigButton
        title="Add ingredient"
        variant="ghost"
        icon="add-circle-outline"
        onPress={() => setPickerOpen(true)}
      />

      <BigButton title={isNew ? 'Create product' : 'Save changes'} onPress={save} disabled={saving} />
      {!isNew ? <BigButton title="Delete product" variant="danger" onPress={remove} /> : null}

      <PickerModal
        visible={pickerOpen}
        title="Choose ingredient"
        options={pickable}
        emptyLabel={ingredients.length === 0 ? 'No ingredients exist yet — add them on the Inventory tab first.' : 'Every ingredient is already in this recipe.'}
        onSelect={addIngredient}
        onClose={() => setPickerOpen(false)}
      />

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(data) => {
          setBarcode(data);
          setScannerOpen(false);
        }}
      />
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
  rowPressed: {
    backgroundColor: colors.bg,
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
  rowMeta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  rowEdit: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  recipeHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  recipeEmpty: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  recipeName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  recipeQtyWrap: {
    width: 110,
  },
  removeRecipeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.round,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeRecipeText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '700',
  },
});
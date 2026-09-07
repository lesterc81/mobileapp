import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { createBranch, deleteBranch, listBranches, updateBranch } from '../api/branches';
import type { Branch } from '../api/types';
import { BigButton, Field, ModalShell, EmptyState } from '../components/ui';
import { useBranchStore } from '../state/branchStore';
import { colors, radius, spacing } from '../theme';

export default function BranchesScreen() {
  const { setBranches } = useBranchStore();
  const [branches, setLocalBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listBranches();
      setLocalBranches(rows);
      setBranches(rows);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [setBranches]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Branches</Text>
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
          data={branches}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState text="No branches yet. Add your first location." />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  {item.address ? <Text style={styles.cardMeta}>{item.address}</Text> : null}
                </View>
                <Pressable onPress={() => setEditing(item)} hitSlop={8}>
                  <Ionicons name="pencil-outline" size={20} color={colors.primary} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {addOpen ? (
        <BranchModal
          onDone={() => {
            setAddOpen(false);
            load();
          }}
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {editing ? (
        <BranchModal
          branch={editing}
          onDone={() => {
            setEditing(null);
            load();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

function BranchModal({
  branch,
  onDone,
  onClose,
}: {
  branch?: Branch;
  onDone: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(branch?.name ?? '');
  const [address, setAddress] = useState(branch?.address ?? '');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async () => {
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg('Name is required.');
      return;
    }
    setBusy(true);
    try {
      if (branch) await updateBranch(branch.id, { name: name.trim(), address: address.trim() });
      else await createBranch(name.trim(), address.trim());
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!branch) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await deleteBranch(branch.id);
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell visible title={branch ? 'Edit branch' : 'Add branch'} onClose={busy ? () => {} : onClose}>
      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
      <Field label="Branch name" value={name} onChangeText={setName} placeholder="e.g. Main Store" />
      <Field label="Address" value={address} onChangeText={setAddress} placeholder="e.g. 123 Rizal Ave" />
      <BigButton title={busy ? 'Saving…' : 'Save'} onPress={submit} disabled={busy} icon="checkmark-circle-outline" />
      {branch ? (
        <BigButton title="Delete branch" onPress={remove} disabled={busy} variant="danger" icon="trash-outline" />
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
});
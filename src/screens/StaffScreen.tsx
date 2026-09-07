import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listBranches } from '../api/branches';
import { createStaffAccount, listStaff, updateStaffRole } from '../api/staff';
import type { Profile, Role } from '../api/types';
import { Badge, BigButton, Chip, Field, ModalShell, PickerModal, EmptyState } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useBranchStore } from '../state/branchStore';
import { colors, radius, spacing } from '../theme';

const ROLE_COLORS: Record<Role, string> = {
  owner: colors.warning,
  manager: colors.primary,
  cashier: colors.success,
};

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
};

export default function StaffScreen() {
  const { branches, setBranches } = useBranchStore();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let allBranches = branches;
      if (allBranches.length === 0) {
        allBranches = await listBranches();
        setBranches(allBranches);
      }
      const rows = await listStaff();
      setStaff(rows);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [branches, setBranches]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const roleLabel = (role: Role): string => ROLE_LABELS[role];

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Staff</Text>
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
          data={staff}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState text="No staff yet. Add the first account." />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.full_name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{item.full_name}</Text>
                  <Text style={styles.cardMeta}>{item.email}</Text>
                  <Text style={styles.cardMeta}>
                    {branches.find((b) => b.id === item.branch_id)?.name ?? 'No branch assigned'}
                  </Text>
                </View>
                <View style={styles.cardRight}>
                  <Badge label={roleLabel(item.role)} color={ROLE_COLORS[item.role]} />
                  <Pressable onPress={() => setEditing(item)} hitSlop={8}>
                    <Ionicons name="pencil-outline" size={20} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {addOpen ? (
        <StaffFormModal
          branches={branches}
          onDone={() => {
            setAddOpen(false);
            load();
          }}
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {editing ? (
        <EditStaffModal
          profile={editing}
          branches={branches}
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

function StaffFormModal({
  branches,
  onDone,
  onClose,
}: {
  branches: { id: string; name: string }[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [branchId, setBranchId] = useState<string | null>(branches[0]?.id ?? null);
  const [branchPick, setBranchPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async () => {
    setErrorMsg(null);
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setErrorMsg('Name, email, and a password of at least 6 characters are required.');
      return;
    }
    setBusy(true);
    try {
      await createStaffAccount({ full_name: fullName.trim(), email: email.trim(), password, role, branch_id: branchId });
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell visible title="Add staff account" onClose={busy ? () => {} : onClose}>
      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
      <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="e.g. Juan Dela Cruz" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="staff@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters" />

      <Text style={styles.sectionLabel}>Role</Text>
      <View style={styles.roleRow}>
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <Chip key={r} label={ROLE_LABELS[r]} selected={role === r} onPress={() => setRole(r)} />
        ))}
      </View>

      <Pressable style={styles.branchSelect} onPress={() => setBranchPick(true)}>
        <Ionicons name="business-outline" size={16} color={colors.primary} />
        <Text style={styles.branchSelectText}>
          {branches.find((b) => b.id === branchId)?.name ?? 'No branch'}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.primary} />
      </Pressable>

      <BigButton title={busy ? 'Saving…' : 'Create account'} onPress={submit} disabled={busy} icon="person-add-outline" />

      {branchPick ? (
        <PickerModal
          visible
          title="Assign branch"
          options={branches.map((b) => ({ label: b.name, value: b.id }))}
          emptyLabel="Create a branch first (Settings)."
          onClose={() => setBranchPick(false)}
          onSelect={(id) => {
            setBranchId(id);
            setBranchPick(false);
          }}
        />
      ) : null}
    </ModalShell>
  );
}

function EditStaffModal({
  profile,
  branches,
  onDone,
  onClose,
}: {
  profile: Profile;
  branches: { id: string; name: string }[];
  onDone: () => void;
  onClose: () => void;
}) {
  const { profile: me } = useAuth();
  const [fullName, setFullName] = useState(profile.full_name);
  const [role, setRole] = useState<Role>(profile.role);
  const [branchId, setBranchId] = useState<string | null>(profile.branch_id);
  const [branchPick, setBranchPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSelf = me?.id === profile.id;
  const keepOwner = isSelf && profile.role === 'owner';

  const submit = async () => {
    setErrorMsg(null);
    if (keepOwner && role !== 'owner') {
      setErrorMsg('You cannot change your own role while there is only one owner.');
      return;
    }
    setBusy(true);
    try {
      await updateStaffRole(profile.id, {
        full_name: fullName.trim(),
        role,
        branch_id: branchId,
      });
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell visible title={`Edit ${profile.full_name}`} onClose={busy ? () => {} : onClose}>
      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
      <Field label="Full name" value={fullName} onChangeText={setFullName} />

      <Text style={styles.sectionLabel}>Role</Text>
      <View style={styles.roleRow}>
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <Chip key={r} label={ROLE_LABELS[r]} selected={role === r} onPress={() => setRole(r)} />
        ))}
      </View>

      <Pressable style={styles.branchSelect} onPress={() => setBranchPick(true)}>
        <Ionicons name="business-outline" size={16} color={colors.primary} />
        <Text style={styles.branchSelectText}>
          {branches.find((b) => b.id === branchId)?.name ?? 'No branch'}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.primary} />
      </Pressable>

      <BigButton title={busy ? 'Saving…' : 'Save'} onPress={submit} disabled={busy} icon="checkmark-circle-outline" />

      {branchPick ? (
        <PickerModal
          visible
          title="Assign branch"
          options={branches.map((b) => ({ label: b.name, value: b.id }))}
          onClose={() => setBranchPick(false)}
          onSelect={(id) => {
            setBranchId(id);
            setBranchPick(false);
          }}
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
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  cardRight: { alignItems: 'flex-end', gap: spacing.md },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: spacing.md },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  branchSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  branchSelectText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 15 },
});
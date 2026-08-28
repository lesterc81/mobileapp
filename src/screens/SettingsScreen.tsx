import { useSQLiteContext } from 'expo-sqlite';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BigButton, Field, ModalShell } from '../components/ui';
import {
  createUser,
  deleteUser,
  listUsers,
  resetDatabase,
  setActiveUserId,
} from '../db';
import { useCart } from '../state/cartStore';
import { useDataVersion } from '../state/dataVersion';
import { useUserStore } from '../state/userStore';
import { useAppStore } from '../state/appStore';
import { exportBackup, pickBackupFile, restoreBackup } from '../services/backup';
import { colors, radius, spacing } from '../theme';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const activeUser = useUserStore((s) => s.activeUser);
  const users = useUserStore((s) => s.users);
  const setUsers = useUserStore((s) => s.setUsers);
  const setActiveUser = useUserStore((s) => s.setActiveUser);
  const clearCart = useCart((s) => s.clear);
  const bump = useDataVersion((s) => s.bump);
  const bumpDbRemount = useAppStore((s) => s.bumpDbRemount);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      await exportBackup(db);
    } catch (err) {
      Alert.alert('Backup failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    const uri = await pickBackupFile();
    if (!uri) return;
    setBusy(true);
    try {
      await restoreBackup(db, uri);
      clearCart();
      setUsers([]);
      setActiveUser(null);
      bumpDbRemount();
    } catch (err) {
      Alert.alert('Restore failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const refreshUsers = async () => {
    setUsers(await listUsers(db));
  };

  const switchUser = async () => {
    await setActiveUserId(db, null);
    clearCart();
    setActiveUser(null);
  };

  const removeUser = (id: number, name: string) => {
    if (activeUser?.id === id) {
      Alert.alert('Cannot delete', 'You cannot delete the user who is signed in. Switch users first.');
      return;
    }
    Alert.alert('Delete user', `Delete "${name}"? Their sales history stays, it just loses the name.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteUser(db, id);
          await refreshUsers();
        },
      },
    ]);
  };

  const resetAll = () => {
    Alert.alert(
      'Reset all data',
      'This deletes EVERYTHING — ingredients, products, sales, users, history. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetDatabase(db);
              clearCart();
              setUsers([]);
              setActiveUser(null);
              bump();
            } catch (err) {
              Alert.alert('Reset failed', err instanceof Error ? err.message : 'Unknown error');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Signed in</Text>
      <View style={styles.card}>
        {activeUser ? (
          <Text style={styles.activeName}>{activeUser.name}</Text>
        ) : (
          <Text style={styles.activeName}>No user</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Users</Text>
      {users.map((user) => (
        <View key={user.id} style={styles.userRow}>
          <View style={styles.userRowInfo}>
            <Text style={styles.userRowName}>{user.name}</Text>
            {user.id === activeUser?.id ? (
              <Text style={styles.activeBadge}>Active</Text>
            ) : null}
          </View>
          <Pressable style={styles.deleteBtn} onPress={() => removeUser(user.id, user.name)} hitSlop={8}>
            <Text style={styles.deleteBtnText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <BigButton title="Add user" variant="ghost" icon="person-add-outline" onPress={() => setAddOpen(true)} />

      <Text style={styles.sectionTitle}>Session</Text>
      <BigButton title="Switch user / sign out" icon="swap-horizontal-outline" onPress={switchUser} />

      <Text style={styles.sectionTitle}>Backup</Text>
      <BigButton
        title="Back up data (share a file)"
        icon="cloud-upload-outline"
        onPress={doExport}
        disabled={busy}
      />
      <BigButton
        title="Restore from backup file"
        variant="ghost"
        icon="cloud-download-outline"
        onPress={doImport}
        disabled={busy}
      />
      <Text style={styles.dangerHint}>
        Backups are a single .db file you can save or send to another phone. Restore replaces all current
        data with the backup.
      </Text>

      <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger zone</Text>
      <BigButton title="Reset all data" variant="danger" icon="trash-outline" onPress={resetAll} />
      <Text style={styles.dangerHint}>
        Wipes the database and re-seeds demo data. Use this if the app misbehaves (for example after a bad
        update) — you start fresh.
      </Text>

      <AddUserModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={async () => {
          setAddOpen(false);
          await refreshUsers();
        }}
      />
    </ScrollView>
  );
}

function AddUserModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await createUser(db, trimmed);
      setName('');
      await onCreated();
    } catch (err) {
      Alert.alert('Could not add user', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell visible={visible} title="Add user" onClose={onClose}>
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Ana, cashier 1"
        autoCapitalize="words"
        autoCorrect={false}
      />
      <BigButton title="Add user" onPress={create} disabled={saving || !name.trim()} />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  activeName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  userRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  userRowName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  activeBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  deleteBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger,
  },
  dangerTitle: {
    color: colors.danger,
    marginTop: spacing.xl,
  },
  dangerHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
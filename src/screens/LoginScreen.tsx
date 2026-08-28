import { useSQLiteContext } from 'expo-sqlite';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createUser, getActiveUser, listUsers, setActiveUserId } from '../db';
import { useUserStore } from '../state/userStore';
import { colors, radius, spacing } from '../theme';

export default function LoginScreen() {
  const db = useSQLiteContext();
  const users = useUserStore((s) => s.users);
  const setUsers = useUserStore((s) => s.setUsers);
  const setActiveUser = useUserStore((s) => s.setActiveUser);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async (userId: number) => {
    setBusy(true);
    try {
      await setActiveUserId(db, userId);
      const user = await getActiveUser(db);
      if (user) setActiveUser(user);
    } catch (err) {
      Alert.alert('Sign in failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const createAndSignIn = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const id = await createUser(db, trimmed);
      setUsers(await listUsers(db));
      await signIn(id);
    } catch (err) {
      Alert.alert('Could not create user', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Inventory POS</Text>
        <Text style={styles.subtitle}>Who's using the register?</Text>

        {users.map((user) => (
          <Pressable
            key={user.id}
            style={({ pressed }) => [styles.userBtn, pressed && styles.userBtnPressed]}
            onPress={() => signIn(user.id)}
            disabled={busy}
          >
            <Text style={styles.userBtnText}>{user.name}</Text>
            <Text style={styles.userBtnChevron}>›</Text>
          </Pressable>
        ))}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>New user</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.newRow}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter a name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={createAndSignIn}
          />
          <Pressable
            style={[styles.addBtn, (!name.trim() || busy) && styles.addBtnDisabled]}
            onPress={createAndSignIn}
            disabled={!name.trim() || busy}
          >
            <Text style={styles.addBtnText}>Add & sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  logo: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  userBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 18,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  userBtnPressed: {
    backgroundColor: colors.bg,
  },
  userBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  userBtnChevron: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  newRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
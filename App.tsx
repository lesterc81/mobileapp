import { NavigationContainer } from '@react-navigation/native';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DB_NAME, getActiveUser, listUsers, migrateDbIfNeeded, resetDatabase, seedIfEmpty } from './src/db';
import { RootNavigator } from './src/navigation/RootNavigator';
import LoginScreen from './src/screens/LoginScreen';
import { useInitError } from './src/state/initError';
import { useUserStore } from './src/state/userStore';
import { useAppStore } from './src/state/appStore';
import { colors, radius, spacing } from './src/theme';

async function onInit(db: SQLiteDatabase) {
  try {
    await migrateDbIfNeeded(db);
    await seedIfEmpty(db);
    useInitError.getState().setError(null);
  } catch (err) {
    useInitError.getState().setError(err instanceof Error ? err.message : String(err));
  }
}

export default function App() {
  const dbRemountKey = useAppStore((s) => s.dbRemountKey);
  return (
    <SafeAreaProvider>
      <SQLiteProvider key={dbRemountKey} databaseName={DB_NAME} onInit={onInit}>
        <AppGate />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function AppGate() {
  const db = useSQLiteContext();
  const initError = useInitError((s) => s.error);
  const activeUser = useUserStore((s) => s.activeUser);
  const setActiveUser = useUserStore((s) => s.setActiveUser);
  const setUsers = useUserStore((s) => s.setUsers);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [users, active] = await Promise.all([listUsers(db), getActiveUser(db)]);
        if (!mounted) return;
        setUsers(users);
        setActiveUser(active);
      } catch {
        // DB may be mid-migration; the init error screen handles the real failure.
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [db, setActiveUser, setUsers]);

  if (!ready) return null;

  if (initError) {
    return <InitErrorScreen message={initError} />;
  }

  if (!activeUser) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <RootNavigator />
    </NavigationContainer>
  );
}

function InitErrorScreen({ message }: { message: string }) {
  const db = useSQLiteContext();
  const setError = useInitError((s) => s.setError);
  const setActiveUser = useUserStore((s) => s.setActiveUser);
  const setUsers = useUserStore((s) => s.setUsers);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      await resetDatabase(db);
      setActiveUser(null);
      setUsers(await listUsers(db));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.errorWrap}>
      <ScrollView contentContainerStyle={styles.errorContent}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{message}</Text>
        <Text style={styles.errorHint}>
          If this keeps happening, reset the app data below to start fresh. Your current data will be
          erased.
        </Text>
        <Pressable
          style={[styles.errorBtn, busy && styles.errorBtnDisabled]}
          onPress={reset}
          disabled={busy}
        >
          <Text style={styles.errorBtnText}>{busy ? 'Resetting…' : 'Reset app data'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  errorWrap: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  errorContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  errorBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  errorBtnDisabled: {
    opacity: 0.4,
  },
  errorBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing } from '../theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setErrorMsg(null);
    setNotice(null);

    if (mode === 'forgot') {
      if (!email.trim()) {
        setErrorMsg('Enter your account email.');
        return;
      }
      setBusy(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        setNotice('Password reset link sent. Check your inbox, then reopen this app to set a new password.');
        setMode('login');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setErrorMsg('Enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = msg.toLowerCase();
      if (friendly.includes('invalid login credentials')) {
        setErrorMsg('Wrong email or password.');
      } else if (friendly.includes('network')) {
        setErrorMsg('Network error. Check your connection and try again.');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Ionicons name="storefront" size={34} color="#fff" />
        </View>
        <Text style={styles.brand}>POS Cloud</Text>
        <Text style={styles.tagline}>Multi-branch point of sale</Text>

        <View style={styles.card}>
          {mode === 'forgot' ? (
            <>
              <Text style={styles.formTitle}>Reset password</Text>
              <Text style={styles.hint}>
                We'll email you a link to set a new password.
              </Text>
            </>
          ) : (
            <Text style={styles.formTitle}>Sign in</Text>
          )}

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!busy}
              />
            </View>
          </View>

          {mode === 'login' ? (
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!busy}
                  onSubmitEditing={submit}
                />
              </View>
            </View>
          ) : null}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{mode === 'forgot' ? 'Send reset link' : 'Sign in'}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.linkBtn}
            onPress={() => {
              setMode(mode === 'login' ? 'forgot' : 'login');
              setErrorMsg(null);
              setNotice(null);
            }}
            disabled={busy}
          >
            <Text style={styles.linkText}>
              {mode === 'login' ? 'Forgot password?' : 'Back to sign in'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>Your data syncs across branches in real time.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  logo: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    marginTop: spacing.md,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.text,
  },
  tagline: {
    marginTop: 2,
    fontSize: 14,
    textAlign: 'center',
    color: colors.textMuted,
  },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  notice: {
    fontSize: 13,
    color: colors.success,
    marginTop: spacing.md,
    backgroundColor: `${colors.success}18`,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.md,
    backgroundColor: `${colors.danger}12`,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  field: { marginTop: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: { marginTop: spacing.md, alignItems: 'center', paddingVertical: 6 },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  footer: {
    marginTop: spacing.xl,
    fontSize: 12,
    textAlign: 'center',
    color: colors.textMuted,
  },
});
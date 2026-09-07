import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { importLegacyData } from '../services/importLegacy';
import type { ImportReport } from '../services/importLegacy';
import { Badge, BigButton, ModalShell } from '../components/ui';
import { useAuth } from '../lib/auth';
import { colors, radius, spacing } from '../theme';

type Nav = NativeStackNavigationProp<SettingsStackParamList>;

export default function SettingsScreen() {
  const { profile, signOut } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const role = profile?.role ?? 'cashier';
  const isOwner = role === 'owner';
  const isManager = role === 'manager' || isOwner;

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile?.full_name ?? '?').slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile?.full_name ?? '—'}</Text>
          <Text style={styles.profileEmail}>{profile?.email ?? ''}</Text>
          <Badge label={role} color={role === 'owner' ? colors.warning : role === 'manager' ? colors.primary : colors.success} />
        </View>
      </View>

      <Text style={styles.sectionHeader}>Business</Text>
      {isManager ? (
        <MenuRow icon="stats-chart-outline" label="Dashboard" onPress={() => navigation.navigate('Dashboard')} />
      ) : null}
      <MenuRow icon="finger-print-outline" label="Time clock" onPress={() => navigation.navigate('Attendance')} />

      {isOwner ? (
        <>
          <Text style={styles.sectionHeader}>Administration</Text>
          <MenuRow icon="people-outline" label="Staff" onPress={() => navigation.navigate('Staff')} />
          <MenuRow icon="business-outline" label="Branches" onPress={() => navigation.navigate('Branches')} />
          <ImportRow />
        </>
      ) : null}

      <Text style={styles.sectionHeader}>Account</Text>
      <MenuRow
        icon="log-out-outline"
        label="Sign out"
        color={colors.danger}
        onPress={() => signOut()}
        last
      />
    </ScrollView>
  );
}

function ImportRow() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const runImport = async () => {
    if (!profile?.id) return;
    setBusy(true);
    setErrorMsg(null);
    setReport(null);
    try {
      const r = await importLegacyData(profile.id);
      setReport(r);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <MenuRow
        icon="move-outline"
        label="Import old app data"
        hint="1-time migration from SQLite"
        onPress={() => setOpen(true)}
      />
      <ModalShell visible={open} title="Import old app data" onClose={() => setOpen(false)}>
        <Text style={styles.importHint}>
          This reads the previous offline database on this device and copies products, recipes,
          ingredients, stock, sales, and stock movements into the cloud. Run it once.
        </Text>
        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        {report ? (
          <View style={styles.reportBox}>
            <Text style={styles.reportTitle}>Import complete</Text>
            <Text style={styles.reportLine}>Branches: {report.branches}</Text>
            <Text style={styles.reportLine}>Ingredients: {report.ingredients}</Text>
            <Text style={styles.reportLine}>Products: {report.products}</Text>
            <Text style={styles.reportLine}>Recipes: {report.recipes}</Text>
            <Text style={styles.reportLine}>Sales: {report.sales}</Text>
            <Text style={styles.reportLine}>Stock movements: {report.movements}</Text>
          </View>
        ) : null}
        <BigButton
          title={busy ? 'Importing…' : 'Start import'}
          onPress={runImport}
          disabled={busy}
          icon="cloud-upload-outline"
        />
        {report ? <BigButton title="Done" onPress={() => setOpen(false)} variant="ghost" icon="checkmark-circle-outline" /> : null}
      </ModalShell>
    </>
  );
}

function MenuRow({
  icon,
  label,
  hint,
  color = colors.text,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  color?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable style={[styles.row, last && { borderBottomWidth: 0 }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={styles.rowInfo}>
        <Text style={[styles.rowLabel, { color }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: 17, fontWeight: '800', color: colors.text },
  profileEmail: { fontSize: 13, color: colors.textMuted },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowInfo: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowHint: { fontSize: 12, color: colors.textMuted },
  importHint: { fontSize: 14, color: colors.text, lineHeight: 21, marginBottom: spacing.md },
  error: {
    backgroundColor: `${colors.danger}12`,
    color: colors.danger,
    padding: spacing.sm,
    borderRadius: radius.sm,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  reportBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
    marginBottom: spacing.sm,
  },
  reportTitle: { fontSize: 15, fontWeight: '800', color: colors.success, marginBottom: 2 },
  reportLine: { fontSize: 13, color: colors.text },
});
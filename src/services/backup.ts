import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

export async function exportBackup(db: SQLiteDatabase): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }

  const data = await db.serializeAsync();
  const backup = new File(Paths.cache, `inventory-pos-backup-${Date.now()}.db`);
  if (backup.exists) backup.delete();
  backup.write(new Uint8Array(data));

  await Sharing.shareAsync(backup.uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Save inventory backup',
  });
}

export interface PickResult {
  picked: boolean;
  canceled: boolean;
}

export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: ['application/octet-stream', 'application/x-sqlite3', '*/*'],
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

/**
 * Copies a picked backup file into a staging area the app can find on next
 * launch. The live database is closed first, then the staged file replaces it.
 */
export async function restoreBackup(db: SQLiteDatabase, pickedUri: string): Promise<void> {
  const src = new File(pickedUri);
  const livePath = db.databasePath;

  const staged = new File(Paths.cache, 'restore-pending.db');
  if (staged.exists) staged.delete();
  await src.copy(staged);

  await db.closeAsync();

  const live = new File(livePath);
  const wal = new File(`${livePath}-wal`);
  const shm = new File(`${livePath}-shm`);
  if (wal.exists) wal.delete();
  if (shm.exists) shm.delete();
  if (live.exists) live.delete();
  await staged.copy(live);

  if (staged.exists) staged.delete();
}
import type { DBLike, User } from './types';

export async function listUsers(db: DBLike): Promise<User[]> {
  return db.getAllAsync<User>('SELECT id, name, created_at FROM users ORDER BY name COLLATE NOCASE');
}

export async function getUser(db: DBLike, id: number): Promise<User | null> {
  return db.getFirstAsync<User>('SELECT id, name, created_at FROM users WHERE id = ?', id);
}

export async function createUser(db: DBLike, name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name cannot be empty');
  const result = await db.runAsync(
    'INSERT INTO users (name, created_at) VALUES (?, ?)',
    trimmed,
    new Date().toISOString()
  );
  return result.lastInsertRowId;
}

export async function deleteUser(db: DBLike, id: number): Promise<void> {
  await db.runAsync('DELETE FROM users WHERE id = ?', id);
}

export async function getActiveUserId(db: DBLike): Promise<number | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    'active_user_id'
  );
  if (!row?.value) return null;
  const n = parseInt(row.value, 10);
  return Number.isNaN(n) ? null : n;
}

export async function setActiveUserId(db: DBLike, id: number | null): Promise<void> {
  if (id == null) {
    await db.runAsync('DELETE FROM app_settings WHERE key = ?', 'active_user_id');
    return;
  }
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'active_user_id',
    String(id)
  );
}

export async function getActiveUser(db: DBLike): Promise<User | null> {
  const id = await getActiveUserId(db);
  if (id == null) return null;
  return getUser(db, id);
}
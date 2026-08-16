import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { resolveProjectPath } from '../config/projectPaths';

const LOCK_PATH = resolveProjectPath('output/.json-store.lock');
const LOCK_TIMEOUT_MS = 30_000;
const STALE_LOCK_MS = 60_000;
let transactionDepth = 0;

export class JsonDataCorruptionError extends Error {
  constructor(public readonly filePath: string, public readonly quarantinedPath: string | null, message?: string) {
    super(message || `JSON data is corrupted: ${filePath}`);
    this.name = 'JsonDataCorruptionError';
  }
}

function waitBriefly(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function removeStaleLock(): boolean {
  try {
    const stat = fs.statSync(LOCK_PATH);
    if (Date.now() - stat.mtimeMs <= STALE_LOCK_MS) return false;
    fs.unlinkSync(LOCK_PATH);
    return true;
  } catch (error: any) {
    return error?.code === 'ENOENT';
  }
}

function acquireStoreLock(): { descriptor: number; token: string } {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (true) {
    try {
      const descriptor = fs.openSync(LOCK_PATH, 'wx');
      const token = crypto.randomBytes(16).toString('hex');
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, acquired_at: new Date().toISOString() }), 'utf-8');
      return { descriptor, token };
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
      if (removeStaleLock()) continue;
      if (Date.now() >= deadline) throw new Error('JSON store is busy; timed out waiting for the file lock');
      waitBriefly(15);
    }
  }
}

/** Serializes complete read-modify-write workflows across Node processes. */
export function withJsonTransaction<T>(action: () => T): T {
  if (transactionDepth > 0) return action();
  const { descriptor, token } = acquireStoreLock();
  transactionDepth++;
  try {
    return action();
  } finally {
    transactionDepth--;
    try { fs.closeSync(descriptor); } catch { /* best effort */ }
    try {
      const owner = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8')) as { token?: string };
      if (owner.token === token) fs.unlinkSync(LOCK_PATH);
    } catch { /* best effort */ }
  }
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  const fullPath = resolveProjectPath(filePath);
  if (!fs.existsSync(fullPath)) return fallback;
  try {
    const content = fs.readFileSync(fullPath, 'utf-8').replace(/^\uFEFF/, '').trim();
    if (!content) throw new SyntaxError('JSON file is empty');
    return JSON.parse(content) as T;
  } catch (error: any) {
    if (!(error instanceof SyntaxError)) throw error;
    const recover = (): T => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const quarantinedPath = `${fullPath}.corrupt-${timestamp}.json`;
      try { fs.copyFileSync(fullPath, quarantinedPath, fs.constants.COPYFILE_EXCL); } catch { /* preserve original in place */ }
      const stableBackup = `${fullPath}.bak`;
      if (fs.existsSync(stableBackup)) {
        try {
          const backupText = fs.readFileSync(stableBackup, 'utf-8').replace(/^\uFEFF/, '').trim();
          const recovered = JSON.parse(backupText) as T;
          fs.copyFileSync(stableBackup, fullPath);
          console.error(`[JsonStore] Recovered ${filePath} from its validated backup; corrupt copy: ${quarantinedPath}`);
          return recovered;
        } catch { /* invalid backup must not be used */ }
      }
      throw new JsonDataCorruptionError(filePath, quarantinedPath, `JSON file is corrupted and no valid backup is available: ${filePath}`);
    };
    return transactionDepth > 0 ? recover() : withJsonTransaction(recover);
  }
}

export function writeJsonFile(filePath: string, data: unknown): boolean {
  try {
    requireJsonWrites([[filePath, data]]);
    return true;
  } catch (error) {
    console.error(`[JsonStore] Error writing ${filePath}:`, error);
    return false;
  }
}

export function requireJsonWrites(entries: Array<[string, unknown]>): void {
  if (transactionDepth === 0) return withJsonTransaction(() => requireJsonWrites(entries));
  const transactionId = `${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  const staged = entries.map(([filePath, data]) => {
    const fullPath = resolveProjectPath(filePath);
    return {
      filePath,
      fullPath,
      tempPath: `${fullPath}.${transactionId}.tmp`,
      backupPath: `${fullPath}.${transactionId}.bak`,
      stableBackupPath: `${fullPath}.bak`,
      existed: fs.existsSync(fullPath),
      content: JSON.stringify(data, null, 2),
    };
  });
  try {
    for (const item of staged) {
      fs.mkdirSync(path.dirname(item.fullPath), { recursive: true });
      JSON.parse(item.content);
      if (item.existed) {
        const existing = fs.readFileSync(item.fullPath, 'utf-8').replace(/^\uFEFF/, '').trim();
        if (!existing) throw new JsonDataCorruptionError(item.filePath, null, `Refusing to overwrite empty JSON file: ${item.filePath}`);
        try { JSON.parse(existing); }
        catch { throw new JsonDataCorruptionError(item.filePath, null, `Refusing to overwrite corrupted JSON file: ${item.filePath}`); }
      }
      fs.writeFileSync(item.tempPath, item.content, 'utf-8');
      if (item.existed) fs.copyFileSync(item.fullPath, item.backupPath);
    }
    for (const item of staged) fs.renameSync(item.tempPath, item.fullPath);
    for (const item of staged) if (item.existed && fs.existsSync(item.backupPath)) fs.copyFileSync(item.backupPath, item.stableBackupPath);
  } catch (error) {
    for (const item of staged) {
      try {
        if (fs.existsSync(item.backupPath)) fs.copyFileSync(item.backupPath, item.fullPath);
        else if (!item.existed && fs.existsSync(item.fullPath)) fs.unlinkSync(item.fullPath);
      } catch { /* best effort rollback */ }
    }
    throw new Error(`JSON transaction failed for ${entries.map(([filePath]) => filePath).join(', ')}: ${String(error)}`);
  } finally {
    for (const item of staged) {
      for (const cleanupPath of [item.tempPath, item.backupPath]) {
        try { if (fs.existsSync(cleanupPath)) fs.unlinkSync(cleanupPath); } catch { /* best effort */ }
      }
    }
  }
}

/** Atomic single-file update for safe read-modify-write workflows. */
export function updateJsonFile<T>(filePath: string, fallback: T, updater: (current: T) => T): T {
  return withJsonTransaction(() => {
    const next = updater(readJsonFile(filePath, fallback));
    requireJsonWrites([[filePath, next]]);
    return next;
  });
}

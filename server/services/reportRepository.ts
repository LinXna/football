import fs from 'fs';
import path from 'path';
import { resolveProjectPath } from '../../config/projectPaths';

/** Returns the most recently updated report matching a stable prefix. */
export function findLatestFile(prefix: string, extension: string, fallbackPath: string): string {
  const fallback = resolveProjectPath(fallbackPath);
  const directory = path.dirname(fallback);
  try {
    if (!fs.existsSync(directory)) {
      return fallback;
    }
    const candidates = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(extension))
      .map((entry) => {
        const filePath = path.join(directory, entry.name);
        return { filePath, modifiedAt: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
    return candidates[0]?.filePath || fallback;
  } catch (error) {
    console.warn('[Reports] Could not enumerate report directory:', error);
    return fallback;
  }
}

export function findLatestReport(prefix: string, fallbackPath: string): string {
  return findLatestFile(prefix, '.md', fallbackPath);
}

export function readTextIfPresent(filePath: string): string {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  } catch (error) {
    console.warn('[Reports] Could not read report:', error);
    return '';
  }
}

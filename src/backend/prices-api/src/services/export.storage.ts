import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

export interface StoredExport {
  storageKey: string;
  byteSize: number;
  checksum: string;
}

export class LocalExportStorage {
  private readonly root = path.resolve(env.exports.directory);

  private filePath(storageKey: string): string {
    const resolved = path.resolve(this.root, storageKey);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) throw new Error('Invalid export storage key');
    return resolved;
  }

  async put(storageKey: string, content: Buffer): Promise<StoredExport> {
    const filePath = this.filePath(storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, { flag: 'wx' });
    return {
      storageKey,
      byteSize: content.byteLength,
      checksum: createHash('sha256').update(content).digest('hex')
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.filePath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.filePath(storageKey), { force: true });
  }
}

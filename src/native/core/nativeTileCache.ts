import type { NativeTileCacheOptions } from "./nativeTiles";

export class NativeMemoryTileCache {
  private readonly maxEntries: number;
  private readonly entries = new Map<string, string>();

  constructor(options: NativeTileCacheOptions = {}) {
    this.maxEntries = Math.max(0, options.maxMemoryEntries ?? 256);
  }

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (!value) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, uri: string): void {
    if (this.maxEntries === 0) {
      return;
    }
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, uri);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) {
        break;
      }
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

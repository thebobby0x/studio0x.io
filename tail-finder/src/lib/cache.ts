/**
 * Simple in-memory cache with TTL support
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

export class InMemoryCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private maxSize: number;
    private ttlMs: number;

    constructor(options: { maxSize?: number; ttlMs?: number } = {}) {
        this.maxSize = options.maxSize || 1000;
        this.ttlMs = options.ttlMs || 24 * 60 * 60 * 1000; // 24 hours default
    }

    get(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    set(key: string, data: T): void {
        // LRU eviction - if cache is full, remove oldest entry
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, {
            data,
            expiresAt: Date.now() + this.ttlMs,
        });
    }

    has(key: string): boolean {
        return this.get(key) !== null;
    }

    clear(): void {
        this.cache.clear();
    }

    size(): number {
        return this.cache.size;
    }
}

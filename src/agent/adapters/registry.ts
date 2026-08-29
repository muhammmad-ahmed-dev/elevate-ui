/**
 * Phase 4C.5: Coding Agent Registry
 *
 * Central registry for managing and resolving CodingAgentAdapter instances.
 */

import type { CodingAgentAdapter } from "./types.js";
import { MockCodingAgentAdapter } from "./mock.js";
import { AntigravityCodingAgentAdapter } from "./antigravity.js";

export class CodingAgentRegistry {
  private static adapters: Map<string, CodingAgentAdapter> = new Map();
  private static defaultAdapterName: string = "mock";
  private static initialized: boolean = false;

  private static ensureInitialized(): void {
    if (!this.initialized) {
      this.initialized = true;
      if (!this.adapters.has("mock")) {
        this.adapters.set("mock", new MockCodingAgentAdapter());
      }
      if (!this.adapters.has("antigravity")) {
        this.adapters.set("antigravity", new AntigravityCodingAgentAdapter());
      }
    }
  }

  /**
   * Registers a coding agent adapter.
   */
  public static register(adapter: CodingAgentAdapter, isDefault = false): void {
    this.ensureInitialized();
    const key = adapter.name.toLowerCase();
    this.adapters.set(key, adapter);
    if (isDefault || !this.adapters.has(this.defaultAdapterName)) {
      this.defaultAdapterName = key;
    }
  }

  /**
   * Retrieves an adapter by name (case-insensitive).
   */
  public static get(name: string): CodingAgentAdapter | undefined {
    this.ensureInitialized();
    return this.adapters.get(name.toLowerCase());
  }

  /**
   * Checks if an adapter with the specified name exists.
   */
  public static has(name: string): boolean {
    this.ensureInitialized();
    return this.adapters.has(name.toLowerCase());
  }

  /**
   * Returns a list of all registered adapter names.
   */
  public static list(): string[] {
    this.ensureInitialized();
    return Array.from(this.adapters.keys());
  }

  /**
   * Returns all registered adapter instances.
   */
  public static getAll(): CodingAgentAdapter[] {
    this.ensureInitialized();
    return Array.from(this.adapters.values());
  }

  /**
   * Returns the default coding agent adapter.
   */
  public static getDefault(): CodingAgentAdapter {
    this.ensureInitialized();
    const adapter = this.adapters.get(this.defaultAdapterName);
    if (!adapter) {
      throw new Error(`No default coding agent adapter registered (expected '${this.defaultAdapterName}').`);
    }
    return adapter;
  }

  /**
   * Clears all registered adapters (primarily for test isolation).
   */
  public static clear(): void {
    this.adapters.clear();
    this.initialized = true; // prevent automatic re-population until explicitly requested or reset
  }
}

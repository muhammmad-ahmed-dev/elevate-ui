/**
 * Phase 4C.5: Coding Agent Adapter Architecture Entrypoint
 */

import { CodingAgentRegistry } from "./registry.js";
import { MockCodingAgentAdapter } from "./mock.js";
import { AntigravityCodingAgentAdapter } from "./antigravity.js";

// Register standard built-in adapters
CodingAgentRegistry.register(new MockCodingAgentAdapter(), true);
CodingAgentRegistry.register(new AntigravityCodingAgentAdapter());

export * from "./types.js";
export * from "./security.js";
export * from "./registry.js";
export * from "./mock.js";
export * from "./antigravity.js";

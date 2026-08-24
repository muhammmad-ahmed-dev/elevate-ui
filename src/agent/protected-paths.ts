/**
 * Phase 3: Protected Path Registry
 *
 * Defines the mandatory set of files and directories that Elevate must NEVER
 * mutate, plus the lookup function used by PatchPlanner and patch validation.
 *
 * The registry is intentionally conservative:  visual mutation is narrowly
 * scoped to JSX/Tailwind presentation layers; everything else is off-limits
 * by default.
 */

import { normalize, relative, isAbsolute } from "node:path";
import type { ProtectedPathConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Default protected-path configuration
// ---------------------------------------------------------------------------

/**
 * Default protected-path configuration.
 * Users MAY extend this via configuration but CANNOT remove these defaults.
 */
export const DEFAULT_PROTECTED_PATH_CONFIG: ProtectedPathConfig = {
  exactPaths: [
    // Package management
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    // TypeScript/build configuration
    "tsconfig.json",
    "tsconfig.node.json",
    "next.config.js",
    "next.config.ts",
    "next.config.mjs",
    "vite.config.ts",
    "vite.config.js",
    "tailwind.config.js",
    "tailwind.config.ts",
    "postcss.config.js",
    "postcss.config.mjs",
    // Linting / formatting
    "eslint.config.js",
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    ".prettierrc",
    ".prettierrc.json",
    // Deployment / CI
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".dockerignore",
    "vercel.json",
    "netlify.toml",
    "fly.toml",
    // Git
    ".gitignore",
    ".gitattributes",
  ],

  prefixPatterns: [
    // Environment files (any variant)
    ".env",
    // Next.js API routes / server actions
    "src/app/api/",
    "app/api/",
    "pages/api/",
    // Authentication modules
    "src/auth/",
    "src/lib/auth",
    "src/server/",
    "lib/auth",
    // Database
    "src/db/",
    "src/database/",
    "lib/db",
    "prisma/",
    "drizzle/",
    // CI / deployment
    ".github/",
    ".circleci/",
    ".gitlab/",
    "scripts/",
    // Elevate's own config / output
    "elevate-report/",
    ".elevate/",
  ],

  substringPatterns: [
    // Lock files (any extension)
    ".lock",
    // Secret / credential files
    "secret",
    "credential",
    "private-key",
    // Authentication patterns inside components
    "/auth/",
    "auth.ts",
    "auth.tsx",
    // Middleware (often security-critical in Next.js)
    "middleware.ts",
    "middleware.js",
    // Server actions
    "actions.ts",
    "actions.tsx",
    // Database migration files
    ".migration.",
    "/migrations/",
    "/schema.",
  ],
};

// ---------------------------------------------------------------------------
// Lookup function
// ---------------------------------------------------------------------------

/**
 * Merges the user-supplied override config over the defaults.
 * The defaults can never be reduced — overrides are additive only.
 */
export function mergeProtectedPathConfig(
  userConfig?: Partial<ProtectedPathConfig>
): ProtectedPathConfig {
  return {
    exactPaths: [
      ...DEFAULT_PROTECTED_PATH_CONFIG.exactPaths,
      ...(userConfig?.exactPaths ?? []),
    ],
    prefixPatterns: [
      ...DEFAULT_PROTECTED_PATH_CONFIG.prefixPatterns,
      ...(userConfig?.prefixPatterns ?? []),
    ],
    substringPatterns: [
      ...DEFAULT_PROTECTED_PATH_CONFIG.substringPatterns,
      ...(userConfig?.substringPatterns ?? []),
    ],
  };
}

/**
 * Returns true if the given absolute file path matches any protected-path rule.
 *
 * @param absoluteFilePath  Absolute path to the file being evaluated.
 * @param projectRoot       Absolute path to the project root directory.
 * @param config            Protected-path configuration (defaults applied automatically).
 * @returns                 `{ protected: true, reason }` or `{ protected: false }`.
 */
export function isProtectedPath(
  absoluteFilePath: string,
  projectRoot: string,
  config: ProtectedPathConfig = DEFAULT_PROTECTED_PATH_CONFIG
): { protected: boolean; reason?: string } {
  if (!isAbsolute(absoluteFilePath)) {
    return {
      protected: true,
      reason: `Path '${absoluteFilePath}' is not absolute — rejecting to prevent ambiguity.`,
    };
  }

  // Normalize both paths to avoid case/separator issues
  const normAbsolute = normalize(absoluteFilePath);
  const normRoot = normalize(projectRoot);

  // Compute a POSIX-style relative path for pattern matching
  const rel = relative(normRoot, normAbsolute).replace(/\\/g, "/");

  if (rel.startsWith("..")) {
    return {
      protected: true,
      reason: `Path '${rel}' escapes project root — rejecting to prevent out-of-scope mutation.`,
    };
  }

  // 1. Exact match
  for (const exact of config.exactPaths) {
    if (rel === exact || rel === exact.replace(/\\/g, "/")) {
      return { protected: true, reason: `Exact protected path match: '${exact}'` };
    }
  }

  // 2. Prefix match
  for (const prefix of config.prefixPatterns) {
    const normalizedPrefix = prefix.replace(/\\/g, "/");
    if (rel.startsWith(normalizedPrefix)) {
      return { protected: true, reason: `Protected prefix match: '${prefix}'` };
    }
    // Also match the file itself when the prefix equals the basename
    const basename = rel.split("/").pop() ?? "";
    if (basename === normalizedPrefix.replace(/\/$/, "")) {
      return { protected: true, reason: `Protected basename match: '${prefix}'` };
    }
  }

  // 3. Substring match
  for (const sub of config.substringPatterns) {
    if (rel.includes(sub)) {
      return { protected: true, reason: `Protected substring match: '${sub}'` };
    }
  }

  return { protected: false };
}

/**
 * Phase 3C Tests — Unified Diff Parser
 *
 * Tests A, B, C, D, I, J, K, U, V from the required test matrix.
 */

import { describe, it, expect } from "vitest";
import { parseDiff, DiffParseError, checkPathSafety } from "../../../src/agent/patch/validate/parser.js";
import {
  DIFF_TAILWIND_ONLY,
  DIFF_PATH_TRAVERSAL,
  DIFF_ABSOLUTE_PATH,
  DIFF_FILE_DELETION,
  DIFF_FILE_RENAME,
  DIFF_BINARY_FILE,
  DIFF_NEW_FILE,
} from "./fixtures.js";

// ---------------------------------------------------------------------------
// A. Valid unified diff parsing
// ---------------------------------------------------------------------------

describe("parseDiff — A: valid parsing", () => {
  it("parses a simple single-file modification", () => {
    const diff = `--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,7 +1,7 @@
 import React from "react";
 
 export function Button({ children }: { children: React.ReactNode }) {
   return (
-    <button className="bg-gray-400 text-black px-4 py-2 rounded">
+    <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700">
       {children}
     </button>
   );
 }`;

    const parsed = parseDiff(diff);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.canonicalPath).toBe("src/components/Button.tsx");
    expect(parsed.files[0]!.changeType).toBe("modified");
    expect(parsed.files[0]!.additions).toBe(1);
    expect(parsed.files[0]!.deletions).toBe(1);
    expect(parsed.totalAdditions).toBe(1);
    expect(parsed.totalDeletions).toBe(1);
    expect(parsed.totalChanged).toBe(2);
  });

  it("parses the Tailwind-only fixture correctly", () => {
    const parsed = parseDiff(DIFF_TAILWIND_ONLY);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.changeType).toBe("modified");
    expect(parsed.files[0]!.additions).toBeGreaterThan(0);
  });

  it("parses multi-hunk diffs", () => {
    const diff = `--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,4 +1,4 @@
-import React from "react";
+import React, { Fragment } from "react";
 
 export function App() {
   return (
@@ -8,5 +8,5 @@
     <div className="app">
-      <h1 className="text-2xl">Title</h1>
+      <h1 className="text-3xl font-bold">Title</h1>
       <p>Content</p>
     </div>
   );`;

    const parsed = parseDiff(diff);
    expect(parsed.files[0]!.hunks).toHaveLength(2);
    expect(parsed.totalAdditions).toBe(2);
    expect(parsed.totalDeletions).toBe(2);
  });

  it("strips git a/ b/ prefixes correctly", () => {
    const diff = `--- a/src/components/Hero.tsx
+++ b/src/components/Hero.tsx
@@ -1,2 +1,2 @@
 import React from "react";
-export function Hero() { return <div className="old"/>; }
+export function Hero() { return <div className="new"/>; }`;

    const parsed = parseDiff(diff);
    expect(parsed.files[0]!.canonicalPath).toBe("src/components/Hero.tsx");
    expect(parsed.files[0]!.oldPath).toBe("src/components/Hero.tsx");
    expect(parsed.files[0]!.newPath).toBe("src/components/Hero.tsx");
  });

  it("strips git extended headers (index line)", () => {
    const diff = `diff --git a/src/Foo.tsx b/src/Foo.tsx
index abc1234..def5678 100644
--- a/src/Foo.tsx
+++ b/src/Foo.tsx
@@ -1,2 +1,2 @@
 import React from "react";
-export function Foo() { return <div className="old"/>; }
+export function Foo() { return <div className="new"/>; }`;

    const parsed = parseDiff(diff);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.canonicalPath).toBe("src/Foo.tsx");
  });
});

// ---------------------------------------------------------------------------
// B. Malformed diff rejection
// ---------------------------------------------------------------------------

describe("parseDiff — B: malformed diff rejection", () => {
  it("rejects empty string", () => {
    expect(() => parseDiff("")).toThrow(DiffParseError);
  });

  it("rejects whitespace-only string", () => {
    expect(() => parseDiff("   \n  ")).toThrow(DiffParseError);
  });

  it("rejects plain prose (no diff headers)", () => {
    expect(() => parseDiff("This is a description of a change, not a diff.")).toThrow(DiffParseError);
  });

  it("rejects diff with --- but missing +++", () => {
    const bad = `--- a/foo.tsx
@@ -1 +1 @@
-old
+new`;
    expect(() => parseDiff(bad)).toThrow(DiffParseError);
  });

  it("rejects malformed hunk header", () => {
    const bad = `--- a/foo.tsx
+++ b/foo.tsx
@@ this is not a valid hunk header @@
-old
+new`;
    expect(() => parseDiff(bad)).toThrow(DiffParseError);
  });

  it("rejects a file section with no hunks", () => {
    const bad = `--- a/foo.tsx
+++ b/foo.tsx`;
    expect(() => parseDiff(bad)).toThrow(DiffParseError);
  });
});

// ---------------------------------------------------------------------------
// C. Path traversal rejection
// ---------------------------------------------------------------------------

describe("parseDiff — C: path traversal rejection", () => {
  it("rejects diff with path traversal in header", () => {
    expect(() => parseDiff(DIFF_PATH_TRAVERSAL)).toThrow(DiffParseError);
    try {
      parseDiff(DIFF_PATH_TRAVERSAL);
    } catch (e) {
      expect((e as DiffParseError).message).toMatch(/traversal|unsafe/i);
    }
  });

  it("rejects paths containing ..", () => {
    const bad = `--- a/../../etc/passwd
+++ b/../../etc/passwd
@@ -1 +1 @@
-old
+new`;
    expect(() => parseDiff(bad)).toThrow(DiffParseError);
  });
});

// ---------------------------------------------------------------------------
// D. Absolute path rejection
// ---------------------------------------------------------------------------

describe("parseDiff — D: absolute path rejection", () => {
  it("rejects diff with absolute path in +++ header", () => {
    expect(() => parseDiff(DIFF_ABSOLUTE_PATH)).toThrow(DiffParseError);
  });
});

// ---------------------------------------------------------------------------
// I. Deleted file rejection
// ---------------------------------------------------------------------------

describe("parseDiff — I: deleted file rejection", () => {
  it("rejects file deletion by default", () => {
    expect(() => parseDiff(DIFF_FILE_DELETION)).toThrow(DiffParseError);
    try {
      parseDiff(DIFF_FILE_DELETION);
    } catch (e) {
      expect((e as DiffParseError).message).toMatch(/deletion|rejected/i);
    }
  });

  it("allows deletion when allowDeletions=true", () => {
    const parsed = parseDiff(DIFF_FILE_DELETION, { allowDeletions: true });
    expect(parsed.files[0]!.changeType).toBe("deleted");
  });
});

// ---------------------------------------------------------------------------
// J. Renamed file rejection
// ---------------------------------------------------------------------------

describe("parseDiff — J: renamed file rejection", () => {
  it("rejects file rename by default", () => {
    expect(() => parseDiff(DIFF_FILE_RENAME)).toThrow(DiffParseError);
    try {
      parseDiff(DIFF_FILE_RENAME);
    } catch (e) {
      expect((e as DiffParseError).message).toMatch(/rename|rejected/i);
    }
  });

  it("allows rename when allowRenames=true", () => {
    const parsed = parseDiff(DIFF_FILE_RENAME, { allowRenames: true });
    expect(parsed.files[0]!.changeType).toBe("renamed");
  });
});

// ---------------------------------------------------------------------------
// K. Binary file rejection
// ---------------------------------------------------------------------------

describe("parseDiff — K: binary file rejection", () => {
  it("rejects binary file diff", () => {
    expect(() => parseDiff(DIFF_BINARY_FILE)).toThrow(DiffParseError);
    try {
      parseDiff(DIFF_BINARY_FILE);
    } catch (e) {
      expect((e as DiffParseError).message).toMatch(/binary/i);
    }
  });
});

// ---------------------------------------------------------------------------
// U. New file creation
// ---------------------------------------------------------------------------

describe("parseDiff — U: new file handling", () => {
  it("parses /dev/null → new file creation", () => {
    const parsed = parseDiff(DIFF_NEW_FILE);
    expect(parsed.files[0]!.changeType).toBe("created");
    expect(parsed.files[0]!.canonicalPath).toBe("src/components/NewButton.tsx");
    expect(parsed.files[0]!.oldPath).toBe("/dev/null");
  });
});

// ---------------------------------------------------------------------------
// V. Patch hash consistency
// ---------------------------------------------------------------------------

describe("parser — V: hash consistency", () => {
  it("parseDiff of the same input produces consistent file structures", () => {
    const r1 = parseDiff(DIFF_TAILWIND_ONLY);
    const r2 = parseDiff(DIFF_TAILWIND_ONLY);
    expect(r1.files[0]!.canonicalPath).toBe(r2.files[0]!.canonicalPath);
    expect(r1.totalAdditions).toBe(r2.totalAdditions);
    expect(r1.totalDeletions).toBe(r2.totalDeletions);
  });
});

// ---------------------------------------------------------------------------
// checkPathSafety standalone tests
// ---------------------------------------------------------------------------

describe("checkPathSafety", () => {
  it("accepts normal relative paths", () => {
    expect(checkPathSafety("src/components/Hero.tsx").safe).toBe(true);
    expect(checkPathSafety("src/app/page.tsx").safe).toBe(true);
  });

  it("rejects absolute paths", () => {
    expect(checkPathSafety("/etc/passwd").safe).toBe(false);
    expect(checkPathSafety("/absolute/path.tsx").safe).toBe(false);
  });

  it("rejects Windows drive-letter paths", () => {
    expect(checkPathSafety("C:/Windows/System32/config.ts").safe).toBe(false);
    expect(checkPathSafety("D:\\file.tsx").safe).toBe(false);
  });

  it("rejects UNC paths", () => {
    expect(checkPathSafety("//server/share/file.ts").safe).toBe(false);
    expect(checkPathSafety("\\\\server\\share\\file.ts").safe).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(checkPathSafety("../etc/passwd").safe).toBe(false);
    expect(checkPathSafety("src/../../secret.ts").safe).toBe(false);
  });

  it("rejects empty string", () => {
    expect(checkPathSafety("").safe).toBe(false);
  });
});

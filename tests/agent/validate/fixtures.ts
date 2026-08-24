/**
 * Phase 3C Test Fixtures
 *
 * Realistic source fixtures for diff validation tests.
 * All fixtures are plain strings — no disk I/O.
 */

// ---------------------------------------------------------------------------
// Fixture 1: Simple Tailwind component (valid mutation target)
// ---------------------------------------------------------------------------

export const FIXTURE_HERO_BEFORE = `
import React from "react";

interface HeroProps {
  title: string;
  subtitle?: string;
}

export function HeroSection({ title, subtitle }: HeroProps) {
  return (
    <section className="hero-section py-8 bg-gray-100">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-gray-600 text-base">{subtitle}</p>
        )}
        <button className="mt-4 bg-gray-400 text-black px-6 py-2 rounded">
          Get Started
        </button>
      </div>
    </section>
  );
}
`.trim();

export const FIXTURE_HERO_AFTER_VISUAL = `
import React from "react";

interface HeroProps {
  title: string;
  subtitle?: string;
}

export function HeroSection({ title, subtitle }: HeroProps) {
  return (
    <section className="hero-section py-12 bg-white">
      <div className="container mx-auto px-6">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-3 text-gray-500 text-lg">{subtitle}</p>
        )}
        <button className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
          Get Started
        </button>
      </div>
    </section>
  );
}
`.trim();

// ---------------------------------------------------------------------------
// Fixture 2: Component with useState (logic that must be preserved)
// ---------------------------------------------------------------------------

export const FIXTURE_STATEFUL_COMPONENT = `
import React, { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div className="counter p-4">
      <span className="text-xl">{count}</span>
      <button
        className="ml-2 bg-blue-500 text-white px-4 py-2"
        onClick={() => setCount((c) => c + 1)}
      >
        Increment
      </button>
    </div>
  );
}
`.trim();

// ---------------------------------------------------------------------------
// Fixture 3: Component with useEffect
// ---------------------------------------------------------------------------

export const FIXTURE_EFFECT_COMPONENT = `
import React, { useState, useEffect } from "react";

export function DataLoader({ url }: { url: string }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then(setData);
  }, [url]);

  return <div className="data-loader p-4">{JSON.stringify(data)}</div>;
}
`.trim();

// ---------------------------------------------------------------------------
// Fixture 4: Component with API call
// ---------------------------------------------------------------------------

export const FIXTURE_API_COMPONENT = `
import React, { useState } from "react";

export function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<any>(null);

  const loadUser = async () => {
    const res = await fetch(\`/api/users/\${userId}\`);
    const data = await res.json();
    setUser(data);
  };

  return (
    <div className="profile p-4">
      <button className="bg-blue-500 text-white px-4 py-2" onClick={loadUser}>
        Load User
      </button>
      {user && <pre>{JSON.stringify(user, null, 2)}</pre>}
    </div>
  );
}
`.trim();

// ---------------------------------------------------------------------------
// Fixture 5: Server action file
// ---------------------------------------------------------------------------

export const FIXTURE_SERVER_ACTION = `
"use server";

import { db } from "@/lib/db";

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string;
  await db.user.create({ data: { name } });
  return { success: true };
}
`.trim();

// ---------------------------------------------------------------------------
// Fixture 6: Component with sibling components
// ---------------------------------------------------------------------------

export const FIXTURE_SIBLINGS_BEFORE = `
import React from "react";

export function Header() {
  return (
    <header className="header bg-white border-b px-4 py-2">
      <nav>Navigation</nav>
    </header>
  );
}

export function HeroSection() {
  return (
    <section className="hero py-8 bg-gray-50">
      <h1 className="text-3xl font-bold">Welcome</h1>
      <button className="mt-4 bg-gray-400 text-black px-6 py-2">CTA</button>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer bg-gray-800 text-white px-4 py-6">
      <p>Footer content</p>
    </footer>
  );
}
`.trim();

export const FIXTURE_SIBLINGS_HERO_ONLY_CHANGE = `
import React from "react";

export function Header() {
  return (
    <header className="header bg-white border-b px-4 py-2">
      <nav>Navigation</nav>
    </header>
  );
}

export function HeroSection() {
  return (
    <section className="hero py-12 bg-white">
      <h1 className="text-4xl font-bold tracking-tight">Welcome</h1>
      <button className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold">CTA</button>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer bg-gray-800 text-white px-4 py-6">
      <p>Footer content</p>
    </footer>
  );
}
`.trim();

// ---------------------------------------------------------------------------
// Fixture 10: API route
// ---------------------------------------------------------------------------

export const FIXTURE_API_ROUTE = `
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json({ hello: "world" });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({ received: body });
}
`.trim();

// ---------------------------------------------------------------------------
// Fixture 11: Database module
// ---------------------------------------------------------------------------

export const FIXTURE_DB_MODULE = `
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma || new PrismaClient({ log: ["query"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
`.trim();

// ---------------------------------------------------------------------------
// Valid unified diffs
// ---------------------------------------------------------------------------

/** A: Valid visual-only patch for HeroSection */
export const DIFF_VALID_VISUAL_PATCH = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,9 +1,9 @@
 import React from "react";
 
 interface HeroProps {
   title: string;
   subtitle?: string;
 }
 
 export function HeroSection({ title, subtitle }: HeroProps) {
   return (
@@ -9,8 +9,8 @@
     <section className="hero-section py-8 bg-gray-100">
-      <div className="container mx-auto px-4">
+      <div className="container mx-auto px-6">
-        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
+        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{title}</h1>
         {subtitle && (
-          <p className="mt-2 text-gray-600 text-base">{subtitle}</p>
+          <p className="mt-3 text-gray-500 text-lg">{subtitle}</p>
         )}
-        <button className="mt-4 bg-gray-400 text-black px-6 py-2 rounded">
+        <button className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold">
           Get Started
         </button>
       </div>`;

/** B: Tailwind-only className swap */
export const DIFF_TAILWIND_ONLY = `--- a/src/components/Button.tsx
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

/** N: Unsafe — adds useEffect to a visual component */
export const DIFF_ADDS_USE_EFFECT = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,5 +1,5 @@
-import React from "react";
+import React, { useEffect } from "react";
 
 export function HeroSection({ title }: { title: string }) {
+  useEffect(() => {
+    document.title = title;
+  }, [title]);
   return (
-    <section className="hero py-8 bg-gray-100">
+    <section className="hero py-12 bg-white">
       <h1 className="text-3xl font-bold">{title}</h1>
     </section>
   );
 }`;

/** O: Unsafe — adds fetch call */
export const DIFF_ADDS_API_CALL = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,5 +1,10 @@
 import React from "react";
 
 export function HeroSection({ title }: { title: string }) {
+  const loadData = async () => {
+    const res = await fetch("/api/hero");
+    const data = await res.json();
+    console.log(data);
+  };
   return (
-    <section className="hero py-8 bg-gray-100">
+    <section className="hero py-12 bg-white">
       <h1 className="text-3xl font-bold">{title}</h1>
     </section>
   );
 }`;

/** P: Unsafe — adds server action directive */
export const DIFF_ADDS_SERVER_ACTION = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,4 +1,6 @@
+"use server";
+
 import React from "react";
 
 export function HeroSection({ title }: { title: string }) {
   return (
-    <section className="hero py-8 bg-gray-100">
+    <section className="hero py-12 bg-white">
       <h1 className="text-3xl">{title}</h1>
     </section>
   );
 }`;

/** Q: Unsafe — adds external package import */
export const DIFF_ADDS_PACKAGE_IMPORT = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,4 +1,5 @@
 import React from "react";
+import { motion } from "framer-motion";
 
 export function HeroSection({ title }: { title: string }) {
   return (
-    <section className="hero py-8 bg-gray-100">
+    <motion.section className="hero py-12 bg-white">
       <h1 className="text-3xl">{title}</h1>
-    </section>
+    </motion.section>
   );
 }`;

/** R: Unsafe — removes an export */
export const DIFF_REMOVES_EXPORT = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,10 +1,3 @@
 import React from "react";
 
-export function HeroSection({ title }: { title: string }) {
-  return (
-    <section className="hero py-8 bg-gray-100">
-      <h1 className="text-3xl font-bold">{title}</h1>
-    </section>
-  );
-}
+export function HeroRenamed({ title }: { title: string }) {
+  return <section className="hero py-12 bg-white"><h1>{title}</h1></section>;
+}`;

/** C: Path traversal attempt */
export const DIFF_PATH_TRAVERSAL = `--- a/../../../etc/passwd
+++ b/../../../etc/passwd
@@ -1 +1 @@
-root:x:0:0:root:/root:/bin/bash
+hacked:x:0:0:root:/root:/bin/bash`;

/** D: Absolute path */
export const DIFF_ABSOLUTE_PATH = `--- a//etc/hosts
+++ b//etc/hosts
@@ -1 +1 @@
-127.0.0.1 localhost
+1.2.3.4 malicious.example.com`;

/** I: File deletion */
export const DIFF_FILE_DELETION = `--- a/src/components/HeroSection.tsx
+++ /dev/null
@@ -1,4 +0,0 @@
-import React from "react";
-export function HeroSection() {
-  return <section>Hero</section>;
-}`;

/** J: File rename */
export const DIFF_FILE_RENAME = `--- a/src/components/OldHero.tsx
+++ b/src/components/NewHero.tsx
@@ -1,3 +1,3 @@
 import React from "react";
-export function OldHero() {
-  return <section className="old-hero">Old</section>;
+export function NewHero() {
+  return <section className="new-hero">New</section>;
 }`;

/** K: Binary file */
export const DIFF_BINARY_FILE = `Binary files a/public/logo.png and b/public/logo.png differ`;

/** U: Valid new file creation */
export const DIFF_NEW_FILE = `--- /dev/null
+++ b/src/components/NewButton.tsx
@@ -0,0 +1,9 @@
+import React from "react";
+
+export function NewButton({ children }: { children: React.ReactNode }) {
+  return (
+    <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold">
+      {children}
+    </button>
+  );
+}`;

/** W: Provider claimed only Hero but diff also touches api.ts */
export const DIFF_PROVIDER_CLAIM_MISMATCH = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,5 +1,5 @@
 import React from "react";
 export function HeroSection() {
-  return <section className="hero py-8">Hero</section>;
+  return <section className="hero py-12">Hero</section>;
 }
--- a/src/lib/api.ts
+++ b/src/lib/api.ts
@@ -1,3 +1,5 @@
 export const API_URL = "/api";
+export async function fetchData(path: string) {
+  return fetch(API_URL + path).then((r) => r.json());
+}`;

/** Z: Realistic end-to-end: pure visual patch, all checks pass */
export const DIFF_E2E_VALID = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -9,6 +9,6 @@
 export function HeroSection({ title, subtitle }: HeroProps) {
   return (
-    <section className="hero-section py-8 bg-gray-100">
-      <div className="container mx-auto px-4">
-        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
-        <button className="mt-4 bg-gray-400 text-black px-6 py-2 rounded">
+    <section className="hero-section py-12 bg-white">
+      <div className="container mx-auto px-6">
+        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{title}</h1>
+        <button className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold">
           Get Started
         </button>`;

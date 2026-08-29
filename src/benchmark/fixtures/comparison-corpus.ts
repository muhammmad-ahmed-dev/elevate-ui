/**
 * Phase 5A: Controlled Comparison Benchmark Corpus
 *
 * 12 representative, deterministic task fixtures spanning diverse domain
 * archetypes, input modes (vague prompts, detailed prompts, screenshot references,
 * existing site improvements), and visual requirements.
 */

import type { InputMode } from "../../agent/design/types.js";

export interface ComparisonCase {
  id: string;
  name: string;
  category: string;
  inputMode: InputMode;
  prompt: string;
  references?: string[];
  componentPath: string;
  initialComponentCode: string;
  expectedVisualImprovement: string;
  tags: string[];
}

export const COMPARISON_CORPUS: ComparisonCase[] = [
  // 1. Personal Portfolio — Vague Prompt (BUILD_FROM_SCRATCH)
  {
    id: "comp-portfolio-01",
    name: "Developer Portfolio & Projects Showcase",
    category: "portfolio",
    inputMode: "BUILD_FROM_SCRATCH",
    prompt: "Make me a developer portfolio website with dark theme and interactive project cards.",
    componentPath: "src/components/Portfolio.tsx",
    initialComponentCode: `
export default function Portfolio() {
  return (
    <div className="p-8 bg-slate-950 text-white min-h-screen">
      <h1 className="text-3xl font-bold">Alex Rivera</h1>
      <p className="text-slate-400 mt-2">Full-stack engineer building AI interfaces.</p>
      <button className="mt-4 px-6 py-3 min-h-[44px] min-w-[44px] bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg">
        Contact Me
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "Modern dark developer portfolio with responsive work grid, skills tags, and 44x44px touch targets.",
    tags: ["portfolio", "vague", "dark-mode", "build-from-scratch"],
  },

  // 2. SaaS Developer Platform — Detailed Prompt (BUILD_FROM_SCRATCH)
  {
    id: "comp-saas-02",
    name: "SaaS DevPlatform Landing Page & Pricing",
    category: "saas_landing",
    inputMode: "BUILD_FROM_SCRATCH",
    prompt: "Build a high-conversion SaaS landing page for an API automation platform named 'OmniFlow'. Include hero with CTA 'Start Free Trial', 3-card bento feature grid, and 3-tier pricing table (Starter, Pro, Enterprise).",
    componentPath: "src/components/SaaSPlatform.tsx",
    initialComponentCode: `
export default function SaaSPlatform() {
  return (
    <div className="p-8 bg-white text-slate-900 min-h-screen">
      <h1 className="text-4xl font-extrabold text-indigo-600">OmniFlow</h1>
      <p className="text-slate-600 mt-2">Next-generation API automation pipelines.</p>
      <button className="mt-4 px-6 py-3 min-h-[44px] min-w-[44px] bg-indigo-600 text-white font-semibold rounded-lg">
        Start Free Trial
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "Bento feature grid, 3-tier responsive pricing cards, and high-contrast CTA.",
    tags: ["saas", "detailed", "pricing", "bento-grid", "build-from-scratch"],
  },

  // 3. Creative Agency Showcase — Screenshot Reference (REFERENCE_DRIVEN)
  {
    id: "comp-agency-03",
    name: "Aura Creative Studio Showcase",
    category: "agency",
    inputMode: "REFERENCE_DRIVEN",
    prompt: "Create an agency showcase website matching the aesthetic principles of the provided reference.",
    references: ["https://example.com/references/agency-minimal-dark.png"],
    componentPath: "src/components/AgencyShowcase.tsx",
    initialComponentCode: `
export default function AgencyShowcase() {
  return (
    <div className="p-8 bg-black text-white min-h-screen">
      <h1 className="text-5xl font-black tracking-tight">Aura Studio</h1>
      <p className="text-neutral-400 mt-4">We design transformative digital brand experiences.</p>
      <button className="mt-6 px-8 py-4 min-h-[44px] min-w-[44px] bg-white text-black font-bold rounded-full">
        Start a Project
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "Monochrome editorial aesthetics, generous whitespace, and featured case studies.",
    tags: ["agency", "reference-driven", "screenshot", "editorial"],
  },

  // 4. Artisanal Product Storefront — Prompt + Screenshot (REFERENCE_DRIVEN)
  {
    id: "comp-ecommerce-04",
    name: "Artisan Leather Goods Storefront",
    category: "ecommerce",
    inputMode: "REFERENCE_DRIVEN",
    prompt: "Build an eCommerce product grid for bespoke leather wallets and bags with warm neutral tones.",
    references: ["https://example.com/references/warm-minimal-store.png"],
    componentPath: "src/components/ProductStorefront.tsx",
    initialComponentCode: `
export default function ProductStorefront() {
  return (
    <div className="p-8 bg-stone-50 text-stone-900 min-h-screen">
      <h1 className="text-3xl font-serif">Valen Leather</h1>
      <p className="text-stone-600 mt-2">Handcrafted goods made from vegetable-tanned Italian leather.</p>
      <button className="mt-4 px-6 py-3 min-h-[44px] min-w-[44px] bg-amber-900 text-white rounded">
        Shop Collection
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "Product gallery cards with pricing, badge tags, and mobile single-column reflow.",
    tags: ["ecommerce", "prompt-and-screenshot", "warm-palette", "storefront"],
  },

  // 5. Artisanal Bakery & Cafe Menu — Vague Prompt (BUILD_FROM_SCRATCH)
  {
    id: "comp-restaurant-05",
    name: "Lumiere Artisan Bakery & Cafe",
    category: "generic",
    inputMode: "BUILD_FROM_SCRATCH",
    prompt: "Create a welcoming website for an organic sourdough bakery with menu categories.",
    componentPath: "src/components/BakeryMenu.tsx",
    initialComponentCode: `
export default function BakeryMenu() {
  return (
    <div className="p-8 bg-amber-50 text-amber-950 min-h-screen">
      <h1 className="text-4xl font-bold">Lumiere Bakery</h1>
      <p className="text-amber-800 mt-2">Naturally fermented sourdough and single-origin coffee.</p>
      <button className="mt-4 px-6 py-3 min-h-[44px] min-w-[44px] bg-amber-800 text-white rounded-lg">
        Order Online
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "Categorized menu section with pricing, dietary labels, and store hours.",
    tags: ["restaurant", "bakery", "vague", "menu"],
  },

  // 6. Tech Publishing & Blog Feed — Detailed Prompt (BUILD_FROM_SCRATCH)
  {
    id: "comp-blog-06",
    name: "Syntax & Signal Tech Blog",
    category: "blog",
    inputMode: "BUILD_FROM_SCRATCH",
    prompt: "Build a clean, high-readability technical blog layout with featured lead article, grid of recent posts, category badges, and newsletter subscription form.",
    componentPath: "src/components/BlogFeed.tsx",
    initialComponentCode: `
export default function BlogFeed() {
  return (
    <div className="p-8 bg-white text-slate-900 min-h-screen max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold">Syntax & Signal</h1>
      <p className="text-slate-600 mt-2">Essays on distributed systems, AI architectures, and UI engineering.</p>
      <button className="mt-4 px-6 py-3 min-h-[44px] min-w-[44px] bg-blue-600 text-white rounded">
        Subscribe
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "Featured article banner, 2-column post list with read times, and responsive newsletter CTA.",
    tags: ["blog", "detailed", "typography", "readability"],
  },

  // 7. Analytics KPI Console & Data Table — Detailed Prompt (BUILD_FROM_SCRATCH)
  {
    id: "comp-dashboard-07",
    name: "Pulse Metric Analytics Dashboard",
    category: "dashboard",
    inputMode: "BUILD_FROM_SCRATCH",
    prompt: "Create a SaaS analytics dashboard with 4 summary KPI metric cards (MRR, Active Users, Churn, Conversion Rate) and recent transactions table.",
    componentPath: "src/components/AnalyticsDashboard.tsx",
    initialComponentCode: `
export default function AnalyticsDashboard() {
  return (
    <div className="p-8 bg-slate-900 text-white min-h-screen">
      <h1 className="text-2xl font-bold">Pulse Analytics</h1>
      <p className="text-slate-400 mt-1">Real-time performance metrics</p>
      <button className="mt-4 px-4 py-2 min-h-[44px] min-w-[44px] bg-slate-800 text-white rounded">
        Export Report
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "4-card responsive KPI grid, delta percentage badges, and data table.",
    tags: ["dashboard", "kpi-cards", "detailed", "data-table"],
  },

  // 8. Smart Hardware Product Landing — Screenshot Reference (REFERENCE_DRIVEN)
  {
    id: "comp-product-08",
    name: "Nova Acoustics Wireless Earbuds",
    category: "saas_landing",
    inputMode: "REFERENCE_DRIVEN",
    prompt: "Design a high-end product landing page for wireless noise-canceling audio hardware.",
    references: ["https://example.com/references/hardware-landing.png"],
    componentPath: "src/components/ProductLanding.tsx",
    initialComponentCode: `
export default function ProductLanding() {
  return (
    <div className="p-8 bg-zinc-950 text-zinc-100 min-h-screen">
      <h1 className="text-5xl font-extrabold tracking-tight">Nova One</h1>
      <p className="text-zinc-400 mt-4">Pure acoustic precision with adaptive noise cancellation.</p>
      <button className="mt-6 px-8 py-4 min-h-[44px] min-w-[44px] bg-emerald-500 text-black font-bold rounded-lg">
        Pre-Order Now
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "Feature callout bento with battery, driver specs, and pre-order CTA.",
    tags: ["product", "hardware", "reference-driven", "landing"],
  },

  // 9. Executive Advisory Profile — Vague Prompt (BUILD_FROM_SCRATCH)
  {
    id: "comp-personal-brand-09",
    name: "Executive Leadership & Board Advisory",
    category: "portfolio",
    inputMode: "BUILD_FROM_SCRATCH",
    prompt: "Build an executive advisory page for an enterprise cloud advisor.",
    componentPath: "src/components/ExecutiveProfile.tsx",
    initialComponentCode: `
export default function ExecutiveProfile() {
  return (
    <div className="p-8 bg-slate-900 text-slate-50 min-h-screen">
      <h1 className="text-3xl font-bold">Elena Vance</h1>
      <p className="text-slate-400 mt-2">Strategic board advisor & enterprise scaling consultant.</p>
      <button className="mt-4 px-6 py-3 min-h-[44px] min-w-[44px] bg-blue-600 text-white rounded">
        Schedule Consultation
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "Credibility stats, advisory pillars, and booking banner.",
    tags: ["personal-brand", "executive", "advisory", "vague"],
  },

  // 10. Developer API Reference & Documentation — Detailed Prompt (BUILD_FROM_SCRATCH)
  {
    id: "comp-docs-10",
    name: "HyperGraph Developer Documentation",
    category: "documentation",
    inputMode: "BUILD_FROM_SCRATCH",
    prompt: "Build a developer documentation page with sidebar navigation, endpoint quickstart, code snippet box, and response schema card.",
    componentPath: "src/components/ApiDocs.tsx",
    initialComponentCode: `
export default function ApiDocs() {
  return (
    <div className="p-8 bg-slate-950 text-slate-100 min-h-screen">
      <h1 className="text-3xl font-bold">HyperGraph API Docs</h1>
      <p className="text-slate-400 mt-2">Fast, scalable GraphQL & REST gateway.</p>
      <button className="mt-4 px-4 py-2 min-h-[44px] min-w-[44px] bg-indigo-600 text-white rounded">
        Get API Key
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "Sidebar navigation, dark syntax code snippet container, and status badges.",
    tags: ["documentation", "api-reference", "code-box", "detailed"],
  },

  // 11. Existing Portfolio Refinement — Existing Site Mode (EXISTING_SITE)
  {
    id: "comp-existing-portfolio-11",
    name: "Mobile Touch Target & Contrast Refinement",
    category: "portfolio",
    inputMode: "EXISTING_SITE",
    prompt: "Refine touch targets to 44x44px minimum and improve WCAG contrast on this existing portfolio.",
    componentPath: "src/components/LegacyPortfolio.tsx",
    initialComponentCode: `
export default function LegacyPortfolio() {
  return (
    <div className="p-4 bg-white text-gray-500 min-h-screen">
      <h1 className="text-xl font-bold text-gray-400">Design Portfolio</h1>
      <p className="text-gray-300 mt-1">UX & UI Design showcase</p>
      <button className="mt-2 text-[10px] p-1 bg-gray-200 text-gray-400" style={{ width: "24px", height: "24px" }}>
        x
      </button>
    </div>
  );
}
`,
    expectedVisualImprovement: "High-contrast text, 44x44px button dimensions, and enhanced typography hierarchy.",
    tags: ["existing-site", "accessibility", "touch-targets", "contrast"],
  },

  // 12. Existing SaaS Layout Fix — Hybrid Mode (HYBRID)
  {
    id: "comp-existing-saas-12",
    name: "Responsive Overflow & Navigation Refactor",
    category: "saas_landing",
    inputMode: "HYBRID",
    prompt: "Modernize existing SaaS landing page using the visual styling of reference and eliminate horizontal overflow on mobile.",
    references: ["https://example.com/references/modern-saas.png"],
    componentPath: "src/components/LegacySaaS.tsx",
    initialComponentCode: `
export default function LegacySaaS() {
  return (
    <div className="p-8 bg-slate-900 text-white min-h-screen">
      <div className="w-[600px] bg-slate-800 p-6 rounded">
        <h1 className="text-2xl font-bold">Fixed Width Container</h1>
        <p className="text-slate-400 mt-2">Causes horizontal scrolling on mobile viewports.</p>
        <button className="mt-4 px-6 py-3 min-h-[44px] min-w-[44px] bg-blue-600 text-white rounded">
          Get Started
        </button>
      </div>
    </div>
  );
}
`,
    expectedVisualImprovement: "Responsive container with max-w-full and zero horizontal overflow across 375px/768px/1440px.",
    tags: ["hybrid", "overflow", "responsive", "existing-site"],
  },
];

export function getComparisonCases(filter?: {
  category?: string;
  tag?: string;
  caseId?: string;
}): ComparisonCase[] {
  let list = [...COMPARISON_CORPUS];
  if (filter?.caseId) {
    list = list.filter((c) => c.id === filter.caseId);
  }
  if (filter?.category) {
    list = list.filter((c) => c.category === filter.category);
  }
  if (filter?.tag) {
    list = list.filter((c) => c.tags.includes(filter.tag!));
  }
  return list;
}

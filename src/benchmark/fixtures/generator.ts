/**
 * Phase 4C.5: Hardened Benchmark Fixture Generator
 *
 * Programmatically generates deterministic, realistic React/Tailwind component code
 * and corresponding fix patches across all 13 benchmark defect categories with
 * real, observable multi-viewport layout and visual behaviors.
 */

import type { BenchmarkCategory, BenchmarkDifficulty } from "../types.js";

export interface FixtureTemplate {
  name: string;
  category: BenchmarkCategory;
  difficulty: BenchmarkDifficulty;
  componentPath: string;
  expectedIssueTypes: string[];
  initialCode: string;
  fixedCode: string;
  description: string;
  targetSelector: string;
}

export function generateFixtureTemplate(
  category: BenchmarkCategory,
  index: number,
  difficulty: BenchmarkDifficulty = "medium"
): FixtureTemplate {
  const compName = `${category.replace(/-/g, "")}Comp${index}`;

  switch (category) {
    case "accessibility": {
      return {
        name: `Accessibility Contrast Fix ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["color-contrast", "accessibility"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-4 bg-white">\n      <button className="bg-gray-200 text-gray-400 px-4 py-2 rounded font-medium">\n        Submit Order\n      </button>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-4 bg-white">\n      <button className="bg-blue-700 text-white px-4 py-2 rounded font-medium">\n        Submit Order\n      </button>\n    </div>\n  );\n}\n`,
        description: "Button text has insufficient color contrast ratio (2.1:1). Requires high contrast foreground/background.",
        targetSelector: "button",
      };
    }

    case "touch-targets": {
      return {
        name: `Touch Target Expansion ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["touch-target", "mobile-usability"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <nav className="p-2">\n      <button className="h-6 w-6 text-xs bg-slate-100 rounded flex items-center justify-center">\n        X\n      </button>\n    </nav>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <nav className="p-2">\n      <button className="min-h-[44px] min-w-[44px] text-sm bg-slate-100 rounded flex items-center justify-center">\n        X\n      </button>\n    </nav>\n  );\n}\n`,
        description: "Interactive button target is smaller than 44x44px mobile touch target guideline.",
        targetSelector: "button",
      };
    }

    case "horizontal-overflow": {
      return {
        name: `Horizontal Overflow Constrain ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["overflow", "layout-shift"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="w-[650px] p-6 bg-slate-50">\n      <h2 className="text-xl font-bold">Fixed Width Card</h2>\n      <p>Content spilling outside viewport</p>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="w-full max-w-[650px] p-6 bg-slate-50">\n      <h2 className="text-xl font-bold">Fixed Width Card</h2>\n      <p>Content spilling outside viewport</p>\n    </div>\n  );\n}\n`,
        description: "Fixed pixel width causes horizontal scroll on mobile viewports (<375px).",
        targetSelector: "div",
      };
    }

    case "typography": {
      return {
        name: `Typography Scale Adjustment ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["typography", "readability", "color-contrast"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-4 bg-white">\n      <p className="text-[9px] text-gray-400">\n        Terms and conditions apply. Please read full documentation before proceeding.\n      </p>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-4 bg-white">\n      <p className="text-sm text-slate-700 font-medium">\n        Terms and conditions apply. Please read full documentation before proceeding.\n      </p>\n    </div>\n  );\n}\n`,
        description: "Body copy font size is under readable threshold (9px) with low contrast text.",
        targetSelector: "p",
      };
    }

    case "spacing": {
      return {
        name: `Spacing & Touch Padding Balance ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["spacing", "touch-target"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-0 border rounded">\n      <button className="h-6 w-6 p-0 text-xs bg-slate-100">\n        Action\n      </button>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-6 border rounded shadow-sm">\n      <button className="min-h-[44px] min-w-[44px] p-3 text-sm bg-blue-600 text-white rounded">\n        Action\n      </button>\n    </div>\n  );\n}\n`,
        description: "Component has zero inner padding with undersized target button.",
        targetSelector: "button",
      };
    }

    case "heading-structure": {
      return {
        name: `Heading Hierarchy Sequentiality ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["heading-hierarchy", "accessibility"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <section className="p-4 bg-white">\n      <h1 className="text-2xl font-bold">Main Title</h1>\n      <h5 className="text-lg font-semibold mt-4">Skipped Levels Subsection</h5>\n    </section>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <section className="p-4 bg-white">\n      <h1 className="text-2xl font-bold">Main Title</h1>\n      <h2 className="text-lg font-semibold mt-4">Skipped Levels Subsection</h2>\n    </section>\n  );\n}\n`,
        description: "Heading level skips directly from h1 to h5 breaking document outline.",
        targetSelector: "h5",
      };
    }

    case "broken-images": {
      return {
        name: `Broken Image Dimensions & Alt ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["broken-image", "accessibility"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-4">\n      <img src="/broken-url-${index}.png" className="w-full" />\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-4">\n      <img src="/placeholder.png" alt="Featured showcase item" width={400} height={300} className="w-full h-auto rounded" />\n    </div>\n  );\n}\n`,
        description: "Image lacks alt attribute and explicit aspect ratio dimensions.",
        targetSelector: "img",
      };
    }

    case "cta-hierarchy": {
      return {
        name: `CTA Hierarchy Contrast ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["cta-hierarchy", "touch-target"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="flex gap-4 p-4">\n      <button className="h-6 w-6 text-xs bg-gray-200 text-gray-400 rounded">Sign Up</button>\n      <button className="h-6 w-6 text-xs bg-gray-200 text-gray-400 rounded">Cancel</button>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="flex gap-4 p-4">\n      <button className="min-h-[44px] min-w-[44px] px-4 py-2 bg-blue-600 text-white rounded font-semibold">Sign Up</button>\n      <button className="min-h-[44px] min-w-[44px] px-4 py-2 bg-transparent text-slate-700 border border-slate-300 rounded">Cancel</button>\n    </div>\n  );\n}\n`,
        description: "CTA buttons have undersized targets and low visual contrast.",
        targetSelector: "button:first-child",
      };
    }

    case "layout":
    case "responsive":
    case "visual-hierarchy":
    case "negative-space":
    case "responsive-composition":
    default: {
      return {
        name: `Responsive Layout Adaptability ${category} ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: [category, "overflow"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="w-[550px] p-6 bg-slate-50 flex flex-row gap-6">\n      <div className="w-1/2 bg-slate-100 p-4">Left Column</div>\n      <div className="w-1/2 bg-slate-200 p-4">Right Column</div>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="w-full max-w-[550px] p-6 bg-slate-50 flex flex-col md:flex-row gap-6">\n      <div className="w-full md:w-1/2 bg-slate-100 p-4 rounded">Left Column</div>\n      <div className="w-full md:w-1/2 bg-slate-200 p-4 rounded">Right Column</div>\n    </div>\n  );\n}\n`,
        description: `Fixed width (550px) container creates horizontal overflow on 375px mobile viewport for ${category}.`,
        targetSelector: "div.w-\\[550px\\]",
      };
    }
  }
}

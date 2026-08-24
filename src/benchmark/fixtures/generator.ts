/**
 * Phase 4C: Benchmark Fixture Generator
 *
 * Programmatically generates deterministic React/Tailwind component code
 * and corresponding fix patches for all 13 benchmark defect categories.
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
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <nav className="p-2">\n      <button className="h-6 w-6 text-xs bg-slate-100 rounded">\n        X\n      </button>\n    </nav>\n  );\n}\n`,
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
        expectedIssueTypes: ["typography", "readability"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-4">\n      <p className="text-[9px] leading-tight text-slate-600">\n        Terms and conditions apply. Please read the full documentation before proceeding.\n      </p>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-4">\n      <p className="text-sm leading-relaxed text-slate-700">\n        Terms and conditions apply. Please read the full documentation before proceeding.\n      </p>\n    </div>\n  );\n}\n`,
        description: "Body copy font size is under minimum readable threshold (9px).",
        targetSelector: "p",
      };
    }

    case "spacing": {
      return {
        name: `Spacing & Padding Balance ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["spacing", "visual-hierarchy"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-0 border rounded">\n      <h3 className="font-bold mb-0">Cramped Header</h3>\n      <p className="mt-0">Text jammed directly against border without padding.</p>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="p-6 border rounded shadow-sm">\n      <h3 className="font-bold mb-2">Cramped Header</h3>\n      <p className="text-slate-600">Text jammed directly against border without padding.</p>\n    </div>\n  );\n}\n`,
        description: "Component has zero inner padding causing text collision with border boundaries.",
        targetSelector: "div",
      };
    }

    case "heading-structure": {
      return {
        name: `Heading Hierarchy Sequentiality ${index}`,
        category,
        difficulty,
        componentPath: `src/components/${compName}.tsx`,
        expectedIssueTypes: ["heading-hierarchy", "accessibility"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <section className="p-4">\n      <h1 className="text-2xl font-bold">Main Title</h1>\n      <h5 className="text-lg font-semibold mt-4">Skipped Levels Subsection</h5>\n    </section>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <section className="p-4">\n      <h1 className="text-2xl font-bold">Main Title</h1>\n      <h2 className="text-lg font-semibold mt-4">Skipped Levels Subsection</h2>\n    </section>\n  );\n}\n`,
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
        expectedIssueTypes: ["cta-hierarchy", "visual-priority"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="flex gap-4 p-4">\n      <button className="bg-blue-600 text-white px-4 py-2 rounded">Sign Up</button>\n      <button className="bg-blue-600 text-white px-4 py-2 rounded">Cancel</button>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="flex gap-4 p-4">\n      <button className="bg-blue-600 text-white px-4 py-2 rounded font-semibold">Sign Up</button>\n      <button className="bg-transparent text-slate-700 border border-slate-300 px-4 py-2 rounded">Cancel</button>\n    </div>\n  );\n}\n`,
        description: "Primary and secondary buttons share identical prominent styling.",
        targetSelector: "button:last-child",
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
        expectedIssueTypes: [category, "layout"],
        initialCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="flex flex-row p-6 gap-6">\n      <div className="w-1/2 bg-slate-100 p-4">Left Pane</div>\n      <div className="w-1/2 bg-slate-200 p-4">Right Pane</div>\n    </div>\n  );\n}\n`,
        fixedCode: `import React from 'react';\n\nexport function ${compName}() {\n  return (\n    <div className="flex flex-col md:flex-row p-6 gap-6">\n      <div className="w-full md:w-1/2 bg-slate-100 p-4 rounded">Left Pane</div>\n      <div className="w-full md:w-1/2 bg-slate-200 p-4 rounded">Right Pane</div>\n    </div>\n  );\n}\n`,
        description: `Multi-column layout fails to wrap on smaller viewports for category ${category}.`,
        targetSelector: "div.flex",
      };
    }
  }
}

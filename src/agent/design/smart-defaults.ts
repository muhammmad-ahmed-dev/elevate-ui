/**
 * Phase 4D: Smart Defaults Generator
 *
 * Provides sensible, high-quality, domain-specific defaults for vague or underspecified requests.
 * Every inferred property is explicitly tagged with `source: "inferred"` and a confidence rating.
 *
 * CRITICAL SAFETY RAIL:
 * Does NOT invent highly specific facts, fake names, fake testimonials, or arbitrary brand colors.
 */

import type { ProjectType, ExplicitOrInferred } from "./types.js";

export interface DomainArchetype {
  projectType: ProjectType;
  businessDomain: string;
  primaryGoal: string;
  targetAudience: string;
  desiredStyle: string;
  pages: string[];
  primaryCta: string;
  secondaryCta?: string;
  functionalRequirements: string[];
  visualRequirements: string[];
  visualPriorities: string[];
}

export const ARCHETYPES: Record<ProjectType, DomainArchetype> = {
  portfolio: {
    projectType: "portfolio",
    businessDomain: "Personal Portfolio & Creative Showcase",
    primaryGoal: "Showcase selected projects, highlight expertise, and convert visitors into client/employment inquiries",
    targetAudience: "Prospective clients, hiring managers, design collaborators, and industry peers",
    desiredStyle: "Modern minimalist editorial with high-contrast typography, refined whitespace, and restrained accenting",
    pages: ["Home", "Projects", "About", "Contact"],
    primaryCta: "View Selected Work",
    secondaryCta: "Get in Touch",
    functionalRequirements: [
      "Responsive project showcase grid with category filters or tags",
      "Case study detail view / modal or section with context and outcomes",
      "Streamlined contact form or direct communication channel",
      "Interactive resume / skill overview module",
    ],
    visualRequirements: [
      "Clean hierarchy with strong display typography in hero section",
      "Subtle micro-interactions on interactive cards and buttons",
      "Spacious grid rhythm to let imagery and project details breathe",
      "Consistent neutral canvas with high WCAG contrast ratios",
    ],
    visualPriorities: [
      "Hero section typography & value proposition clarity",
      "Project card visual hierarchy & image discoverability",
      "Seamless mobile touch navigation and responsive reflow",
      "Uncluttered contact call-to-action prominence",
    ],
  },

  saas_landing: {
    projectType: "saas_landing",
    businessDomain: "Software as a Service (SaaS) Platform",
    primaryGoal: "Communicate product value, demonstrate features, establish trust, and drive user signups or trial conversions",
    targetAudience: "Product leaders, technical decision-makers, teams, and software practitioners",
    desiredStyle: "Sleek modern tech aesthetic with subtle glassmorphism, crisp feature grids, and distinct accent CTAs",
    pages: ["Home", "Features", "Pricing", "About"],
    primaryCta: "Start Free Trial",
    secondaryCta: "Book a Demo",
    functionalRequirements: [
      "Hero value proposition with immediate primary signup CTA and product preview",
      "Social proof / client logo marquee / trust badges",
      "Feature showcase with interactive tabs or segmented benefit cards",
      "Tiered pricing table with monthly/annual toggle",
      "Frequently asked questions (FAQ) accordion",
    ],
    visualRequirements: [
      "High-contrast hero callout with vibrant primary action button",
      "Structured bento-grid layout for feature modules",
      "Clear visual distinction between pricing tiers (e.g. highlighted 'Popular' tier)",
      "Polished dark/light surface elevation with subtle border strokes",
    ],
    visualPriorities: [
      "Hero conversion area and clear value proposition",
      "Feature bento grid clarity and visual balance",
      "Pricing tier scannability and CTA emphasis",
      "Social proof and trust indicators",
    ],
  },

  ecommerce: {
    projectType: "ecommerce",
    businessDomain: "Digital Retail & Product Commerce",
    primaryGoal: "Showcase product catalogue, facilitate seamless browsing, and drive purchase conversions",
    targetAudience: "Online shoppers, brand consumers, and repeat retail buyers",
    desiredStyle: "Contemporary clean commerce aesthetic with photography-forward layouts, clear pricing, and immediate cart actions",
    pages: ["Home", "Shop", "Product Details", "Cart", "Checkout"],
    primaryCta: "Shop Now",
    secondaryCta: "View Collection",
    functionalRequirements: [
      "Featured product collection grid with price, ratings, and quick add-to-cart",
      "Categorized filtering and sorting interface",
      "Promotional banner or seasonal highlight section",
      "Sticky mini-cart summary or navigation cart counter",
    ],
    visualRequirements: [
      "Prominent high-quality product imagery with consistent aspect ratios",
      "Legible typography hierarchy distinguishing product titles, badges, and prices",
      "Clear visual feedback for stock states, discounts, and selections",
      "Accessible touch targets for mobile purchase flow (min 44x44px)",
    ],
    visualPriorities: [
      "Product card scannability and add-to-cart prominence",
      "Hero product spotlight and promotional clarity",
      "Mobile checkout ergonomics and sticky action buttons",
      "Consistent spacing across product catalogues",
    ],
  },

  blog: {
    projectType: "blog",
    businessDomain: "Content Publishing & Editorial Journal",
    primaryGoal: "Engage readers, present long-form and short-form articles legibly, and encourage newsletter subscriptions",
    targetAudience: "Readers, researchers, subscribers, and community members",
    desiredStyle: "Classic editorial layout with optimized reading typography, generous line-heights, and structured article metadata",
    pages: ["Home", "Articles", "Categories", "About", "Newsletter"],
    primaryCta: "Subscribe to Newsletter",
    secondaryCta: "Browse Articles",
    functionalRequirements: [
      "Featured lead article spotlight followed by chronologically organized feed",
      "Category and tag navigation taxonomy",
      "Article card with estimated reading time, author, and publication date",
      "Inline or footer newsletter subscription capture",
    ],
    visualRequirements: [
      "Carefully calibrated body text typography (65–75 characters per line for optimal reading)",
      "Strong contrast between headings and body text",
      "Clean metadata typography with muted timestamp accents",
      "Uncluttered vertical rhythm without visual noise",
    ],
    visualPriorities: [
      "Reading typography hierarchy and line length comfort",
      "Featured article prominence and feed scannability",
      "Newsletter subscription CTA visibility",
      "Clean category taxonomy navigation",
    ],
  },

  agency: {
    projectType: "agency",
    businessDomain: "Digital Agency & Studio Services",
    primaryGoal: "Demonstrate multidisciplinary capabilities, showcase client case studies, and generate high-value project inquiries",
    targetAudience: "Enterprise clients, founders, marketing executives, and creative directors",
    desiredStyle: "Bold contemporary studio aesthetic with expansive layouts, kinetic typography hints, and immersive case study presentations",
    pages: ["Home", "Work", "Services", "About", "Contact"],
    primaryCta: "Start a Project",
    secondaryCta: "Explore Our Work",
    functionalRequirements: [
      "Hero statement summarizing agency ethos and primary service offerings",
      "Immersive case study showcase with client metrics and deliverables",
      "Comprehensive service capability breakdown with deliverables",
      "Multi-step inquiry form or direct partner contact interface",
    ],
    visualRequirements: [
      "Bold oversized display typography balanced by disciplined grid alignment",
      "High-contrast card containers with subtle border highlights",
      "Structured section breaks establishing rhythm between case studies and services",
      "Polished dark or light theme with architectural whitespace",
    ],
    visualPriorities: [
      "Impactful hero messaging and positioning statement",
      "Case study visual impact and outcome discovery",
      "Service offerings clarity and structured deliverables",
      "Inquiry and project onboarding call-to-action",
    ],
  },

  documentation: {
    projectType: "documentation",
    businessDomain: "Developer & Product Documentation",
    primaryGoal: "Enable users and developers to quickly find guides, reference APIs, and successfully implement solutions",
    targetAudience: "Developers, technical writers, engineers, and platform integrators",
    desiredStyle: "Systematic, clean technical documentation with sticky sidebar navigation, syntax-highlighted code blocks, and on-page table of contents",
    pages: ["Overview", "Quickstart", "Guides", "API Reference"],
    primaryCta: "Get Started",
    secondaryCta: "View on GitHub",
    functionalRequirements: [
      "Collapsible multi-level sidebar navigation hierarchy",
      "Full-text search trigger or search bar placement",
      "Code snippet containers with copy-to-clipboard functionality",
      "On-page heading table of contents (right rail on desktop)",
    ],
    visualRequirements: [
      "Fixed monospace typography for code tokens and parameter blocks",
      "High contrast syntax coloring conforming to accessibility standards",
      "Clear callout boxes (notes, tips, warnings, cautions)",
      "Precise compact spacing suited for information density",
    ],
    visualPriorities: [
      "Sidebar and document navigation scannability",
      "Code block readability and instant copy affordance",
      "Heading anchor navigation and on-page table of contents",
      "Mobile drawer navigation reflow",
    ],
  },

  dashboard: {
    projectType: "dashboard",
    businessDomain: "Data Analytics & Application Console",
    primaryGoal: "Present vital metrics, active processes, and actionable insights clearly in an ergonomic interface",
    targetAudience: "Operations managers, analysts, administrators, and daily application operators",
    desiredStyle: "Dense functional interface with metric cards, structured data tables, status badges, and contextual action menus",
    pages: ["Overview", "Analytics", "Reports", "Settings"],
    primaryCta: "New Report",
    secondaryCta: "Export Data",
    functionalRequirements: [
      "Top-level KPI summary cards with trend indicators",
      "Interactive data charts and visual metrics",
      "Sortable and filterable data table with pagination",
      "Contextual user profile and notification header controls",
    ],
    visualRequirements: [
      "Clear semantic color coding for status badges (success, warning, error, neutral)",
      "Strict grid alignment maintaining card alignment across breakpoints",
      "Compact padding maximizing visible data surface without claustrophobia",
      "Dark and light surface elevation hierarchy separating navigation from canvas",
    ],
    visualPriorities: [
      "KPI summary metrics instant comprehension",
      "Data table density, alignment, and legibility",
      "Status indicator contrast and clarity",
      "Responsive metric reflow on smaller viewports",
    ],
  },

  mobile_showcase: {
    projectType: "mobile_showcase",
    businessDomain: "Mobile Application Marketing",
    primaryGoal: "Showcase mobile app features, UI screenshots, and direct users to App Store / Google Play downloads",
    targetAudience: "Mobile device users, potential app adopters, and consumer reviewers",
    desiredStyle: "Dynamic app showcase featuring realistic device frames, feature carousels, and dual app store download badges",
    pages: ["Home", "Features", "Reviews", "Support"],
    primaryCta: "Download on App Store",
    secondaryCta: "Get on Google Play",
    functionalRequirements: [
      "Hero mockup displaying app interface in modern phone bezel",
      "App store badge download links with QR code alternate",
      "Feature breakdown highlighting key screens and user benefits",
      "User review / testimonial carousel with verified ratings",
    ],
    visualRequirements: [
      "Polished device mockups with clean drop shadows",
      "Vibrant brand accents highlighting download buttons",
      "Harmonious card spacing complementing screen mockups",
      "Smooth mobile preview reflow ensuring mockups scale gracefully",
    ],
    visualPriorities: [
      "Device mockup visual clarity and hero impact",
      "App store download CTA prominence",
      "Feature highlight scannability",
      "Social proof ratings visibility",
    ],
  },

  generic: {
    projectType: "generic",
    businessDomain: "Modern Web Application",
    primaryGoal: "Present core content clearly, engage visitors, and provide intuitive navigation to key actions",
    targetAudience: "General web visitors, customers, and community members",
    desiredStyle: "Balanced modern responsive design with clean typography hierarchy, consistent spacing, and intuitive interactions",
    pages: ["Home", "Features", "About", "Contact"],
    primaryCta: "Explore More",
    secondaryCta: "Contact Us",
    functionalRequirements: [
      "Header navigation with brand logo and mobile menu toggle",
      "Hero section with clear heading, description, and primary CTA",
      "Content or feature grid with iconography and descriptions",
      "Footer with navigation links, copyright, and social anchors",
    ],
    visualRequirements: [
      "Cohesive typography scale from display headings to body copy",
      "8pt-aligned spacing scale across all components",
      "Accessible color contrast exceeding WCAG AA minimums",
      "Zero horizontal overflow across all viewports",
    ],
    visualPriorities: [
      "Hero visual hierarchy and message clarity",
      "Content grid structure and whitespace rhythm",
      "Interactive button and touch target accessibility",
      "Multi-viewport responsive reflow",
    ],
  },
};

export class SmartDefaultsGenerator {
  /**
   * Retrieves the domain archetype for a given project type.
   */
  public static getArchetype(projectType: ProjectType): DomainArchetype {
    return ARCHETYPES[projectType] || ARCHETYPES.generic;
  }

  /**
   * Creates an ExplicitOrInferred wrapper with standard inferred metadata.
   */
  public static createInferred<T>(value: T, confidence: number, rationale: string): ExplicitOrInferred<T> {
    return {
      value,
      source: "inferred",
      confidence: Math.min(Math.max(confidence, 0.1), 0.99),
      rationale,
    };
  }

  /**
   * Creates an ExplicitOrInferred wrapper for an explicitly user-specified value.
   */
  public static createExplicit<T>(value: T, rationale?: string): ExplicitOrInferred<T> {
    return {
      value,
      source: "explicit",
      confidence: 1.0,
      rationale: rationale || "Explicitly specified by user in request prompt.",
    };
  }
}

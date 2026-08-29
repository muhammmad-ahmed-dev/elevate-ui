/**
 * Phase 4D: Component Hierarchy & Responsibility Planner
 *
 * Breaks down site plans into focused, modular, single-responsibility React/Tailwind components.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Defines explicit responsibilities, props, and responsive behaviors for each component.
 * 2. Emphasizes clean reusable subcomponents (cards, badges, buttons, drawers).
 * 3. Specifies exact allowed design tokens and visual hierarchy roles.
 */

import type { ComponentPlan, ComponentDefinition, SitePlan, DesignIntent } from "./types.js";

export class ComponentPlanner {
  /**
   * Generates a modular ComponentPlan aligned with the SitePlan and DesignIntent.
   */
  public static generate(sitePlan: SitePlan, intent: DesignIntent): ComponentPlan {
    const type = intent.projectType.value;
    const isDark = intent.desiredStyle.value.toLowerCase().includes("dark");

    const components: ComponentDefinition[] = [];

    // 1. Navigation Component
    components.push({
      name: "Navbar",
      filePath: "src/components/Navbar.tsx",
      role: "Global Top Navigation & Brand Header",
      responsibility: "Provide sticky header navigation, mobile drawer toggle, brand identity anchor, and primary CTA trigger",
      suggestedProps: ["logoText?: string", "navLinks?: { label: string; href: string }[]", "ctaLabel?: string", "onCtaClick?: () => void"],
      reusableElements: ["NavLink", "MobileMenuButton", "ThemeToggle", "BrandMark"],
      responsiveBehavior: {
        mobile: "Compact bar with logo and hamburger menu button (min 44x44px touch target) opening a full-screen or slide-over drawer",
        tablet: "Horizontal layout with primary links and compact CTA",
        desktop: "Full horizontal navigation bar with links centered and primary action button pinned to the right",
      },
      allowedDesignTokens: [
        isDark ? "bg-slate-950/80 backdrop-blur border-b border-slate-800" : "bg-white/85 backdrop-blur border-b border-slate-100",
        "text-slate-50",
        "text-slate-400",
        "hover:text-white",
      ],
      expectedVisualHierarchy: "Clear, persistent top anchor without overwhelming the content canvas (z-index 40-50)",
    });

    // 2. Hero Component
    components.push({
      name: "HeroSection",
      filePath: "src/components/HeroSection.tsx",
      role: "Lead Conversion & Positioning Area",
      responsibility: "Deliver immediate value statement, display typography, availability/badge callouts, and primary + secondary CTA buttons",
      suggestedProps: ["headline: string", "subheading: string", "primaryCtaText: string", "secondaryCtaText?: string", "badgeText?: string"],
      reusableElements: ["PrimaryButton", "SecondaryButton", "StatusBadge"],
      responsiveBehavior: {
        mobile: "Single-column stacked layout with text-3xl heading, full-width action buttons, and vertical padding py-12",
        tablet: "Centered layout with text-4xl heading, inline button group, and py-16 padding",
        desktop: "High-impact layout with text-5xl to text-6xl display typography, max-w-4xl text bounds, and py-20 to py-24 spacing",
      },
      allowedDesignTokens: [
        "text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight",
        "text-slate-400 text-lg sm:text-xl",
        "bg-blue-600 hover:bg-blue-500 text-white rounded-lg",
      ],
      expectedVisualHierarchy: "Highest visual priority (Tier 1) on the page; immediate focal point upon arrival",
    });

    // 3. Domain-Specific Main Content Modules
    if (type === "portfolio" || type === "agency") {
      components.push({
        name: "ProjectGrid",
        filePath: "src/components/ProjectGrid.tsx",
        role: "Showcase Container & Filter Hub",
        responsibility: "Render list of project case studies, manage active category filter state, and handle responsive grid column reflow",
        suggestedProps: ["projects: ProjectItem[]", "categories?: string[]", "activeCategory?: string", "onSelectCategory?: (cat: string) => void"],
        reusableElements: ["ProjectCard", "CategoryFilterPills", "OutcomeBadge"],
        responsiveBehavior: {
          mobile: "1-column vertical feed with gap-6",
          tablet: "2-column grid with gap-6",
          desktop: "2-column or 3-column staggered grid with gap-8",
        },
        allowedDesignTokens: [
          isDark ? "bg-slate-900/60 border border-slate-800 rounded-xl" : "bg-white border border-gray-100 shadow-sm rounded-xl",
          "transition-all duration-300 hover:scale-[1.01]",
        ],
        expectedVisualHierarchy: "Tier 2 primary content discovery area; visual anchor for proof of work",
      });

      components.push({
        name: "ProjectCard",
        filePath: "src/components/ProjectCard.tsx",
        role: "Individual Case Study / Work Item",
        responsibility: "Display project cover image, title, discipline tags, description excerpt, and clickable detail trigger",
        suggestedProps: ["title: string", "category: string", "description: string", "imageUrl: string", "linkUrl?: string", "metrics?: string"],
        reusableElements: ["ImageContainer", "TagPill", "ExternalLinkIcon"],
        responsiveBehavior: {
          mobile: "Full-width card with 16:9 image aspect ratio and min 44px link area",
          desktop: "Hover elevation, subtle image zoom, and high contrast typography",
        },
        allowedDesignTokens: ["text-xl font-bold text-white", "text-slate-400 text-sm", "bg-slate-800 text-slate-300"],
        expectedVisualHierarchy: "Scannable container with crisp typographic contrast",
      });

      components.push({
        name: "CapabilitiesSection",
        filePath: "src/components/CapabilitiesSection.tsx",
        role: "Skill & Discipline Matrix",
        responsibility: "Present technical competencies, creative capabilities, and workflow philosophy in structured cards",
        suggestedProps: ["capabilities: { title: string; description: string; skills: string[] }[]"],
        reusableElements: ["CapabilityCard", "SkillTag"],
        responsiveBehavior: {
          mobile: "1-column stack with py-12",
          tablet: "2-column grid with py-16",
          desktop: "3-column structured grid with py-20",
        },
        allowedDesignTokens: ["border border-slate-800 bg-slate-900/40 p-6 rounded-xl"],
        expectedVisualHierarchy: "Tier 3 supporting credibility module",
      });
    } else if (type === "saas_landing") {
      components.push({
        name: "BentoFeatureGrid",
        filePath: "src/components/BentoFeatureGrid.tsx",
        role: "Feature Showcase Container",
        responsibility: "Display core product benefits in an asymmetric bento grid with visual interactive previews",
        suggestedProps: ["features: FeatureItem[]"],
        reusableElements: ["FeatureCard", "MetricBadge", "InteractiveTab"],
        responsiveBehavior: {
          mobile: "1-column vertical stack with gap-4",
          tablet: "2-column grid with gap-6",
          desktop: "3-column asymmetric bento layout (1 hero span-2 card + 3 single-span cards)",
        },
        allowedDesignTokens: ["bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 lg:p-8"],
        expectedVisualHierarchy: "Tier 2 feature comprehension area",
      });

      components.push({
        name: "PricingTable",
        filePath: "src/components/PricingTable.tsx",
        role: "Tiered Pricing & Plan Selector",
        responsibility: "Present subscription tiers (Starter, Pro, Enterprise) with monthly/annual billing switcher and feature checklist",
        suggestedProps: ["plans: PricingPlan[]", "billingInterval: 'monthly' | 'annual'", "onSelectPlan: (planId: string) => void"],
        reusableElements: ["PricingCard", "CheckmarkIcon", "PopularBadge", "IntervalToggle"],
        responsiveBehavior: {
          mobile: "1-column stacked cards with recommended tier at top",
          desktop: "3-column side-by-side comparison with recommended tier visually elevated (border-blue-500 scale-105)",
        },
        allowedDesignTokens: ["border-2 border-blue-500 shadow-xl", "bg-slate-900 border border-slate-800"],
        expectedVisualHierarchy: "Tier 2 high-conversion commercial area",
      });
    } else if (type === "ecommerce") {
      components.push({
        name: "ProductGrid",
        filePath: "src/components/ProductGrid.tsx",
        role: "Product Catalogue Grid",
        responsibility: "Display collection of product items with prices, badges, and quick-add actions",
        suggestedProps: ["products: ProductItem[]", "onAddToCart: (productId: string) => void"],
        reusableElements: ["ProductCard", "AddToCartButton", "PriceTag", "RatingBadge"],
        responsiveBehavior: {
          mobile: "1-column or 2-column compact grid",
          desktop: "3-column or 4-column product grid with sticky filter sidebar",
        },
        allowedDesignTokens: ["bg-white border border-gray-100 rounded-xl p-4 shadow-sm"],
        expectedVisualHierarchy: "Tier 2 primary transaction area",
      });
    } else {
      components.push({
        name: "ContentGrid",
        filePath: "src/components/ContentGrid.tsx",
        role: "General Feature & Content Matrix",
        responsibility: "Display multi-column feature or benefit cards with icons and descriptions",
        suggestedProps: ["items: { title: string; description: string; icon?: string }[]"],
        reusableElements: ["ContentCard", "IconWrapper"],
        responsiveBehavior: {
          mobile: "1-column stack with gap-4",
          tablet: "2-column grid with gap-6",
          desktop: "3-column grid with gap-8",
        },
        allowedDesignTokens: ["border border-slate-800 bg-slate-900/50 rounded-xl p-6"],
        expectedVisualHierarchy: "Tier 2 content exploration area",
      });
    }

    // 4. Contact / Lead Capture Component
    components.push({
      name: "ContactSection",
      filePath: "src/components/ContactSection.tsx",
      role: "Conversion & Inquiry Action Container",
      responsibility: "Provide accessible contact input fields, direct email/social links, and response notice",
      suggestedProps: ["emailDestination?: string", "socialLinks?: { name: string; url: string }[]", "onSubmitInquiry?: (data: any) => void"],
      reusableElements: ["InputField", "TextArea", "SubmitButton", "SocialButton"],
      responsiveBehavior: {
        mobile: "Single-column form with full-width inputs and 44px touch-target submit button",
        desktop: "Split 2-column layout (contact info on left, interactive form on right)",
      },
      allowedDesignTokens: [
        "bg-slate-900/80 border border-slate-800 rounded-2xl p-6 lg:p-10",
        "focus:ring-2 focus:ring-blue-500",
      ],
      expectedVisualHierarchy: "Final conversion anchor (Tier 2/3)",
    });

    // 5. Footer Component
    components.push({
      name: "Footer",
      filePath: "src/components/Footer.tsx",
      role: "Site Closure, Legal & Navigation Directory",
      responsibility: "Display copyright, secondary directory links, social anchors, and back-to-top button",
      suggestedProps: ["copyrightYear?: number", "links?: { label: string; href: string }[]"],
      reusableElements: ["FooterLink", "SocialIconGroup", "BackToTopButton"],
      responsiveBehavior: {
        mobile: "Vertical stacked links with centered copyright",
        desktop: "Multi-column directory with horizontal bottom bar",
      },
      allowedDesignTokens: ["border-t border-slate-800/80 py-12 text-slate-500 text-sm"],
      expectedVisualHierarchy: "Subordinate closing element (Tier 4)",
    });

    return {
      components,
      entryComponent: "src/app/page.tsx",
      sharedUtilities: ["clsx", "tailwind-merge", "lucide-react (icons)"],
    };
  }
}

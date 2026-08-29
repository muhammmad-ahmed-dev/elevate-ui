/**
 * Phase 4D: Site Architecture & User Flow Planner
 *
 * Formulates tailored site plans, page architectures, section layouts, and conversion flows.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Adapts structure dynamically to project intent (portfolio, SaaS, eCommerce, blog, etc.).
 * 2. Establishes clear user journeys and CTA hierarchies.
 * 3. Does NOT force a rigid single template onto all project types.
 */

import type { SitePlan, PageSectionPlan, DesignIntent } from "./types.js";

export class SitePlanner {
  /**
   * Generates a tailored SitePlan based on DesignIntent.
   */
  public static generate(intent: DesignIntent): SitePlan {
    const type = intent.projectType.value;
    const isSinglePage = intent.pages.value.some((p) => p.toLowerCase().includes("single page"));

    if (isSinglePage) {
      return this.buildSinglePagePlan(intent);
    }

    switch (type) {
      case "portfolio":
        return this.buildPortfolioPlan(intent);
      case "saas_landing":
        return this.buildSaasPlan(intent);
      case "ecommerce":
        return this.buildEcommercePlan(intent);
      case "blog":
        return this.buildBlogPlan(intent);
      case "agency":
        return this.buildAgencyPlan(intent);
      case "documentation":
        return this.buildDocumentationPlan(intent);
      case "dashboard":
        return this.buildDashboardPlan(intent);
      default:
        return this.buildGenericPlan(intent);
    }
  }

  private static buildSinglePagePlan(intent: DesignIntent): SitePlan {
    const sections: PageSectionPlan[] = [
      {
        id: "sec-hero",
        name: "Hero Section",
        purpose: "Establish value proposition and direct visitors to primary CTA",
        recommendedComponents: ["Hero", "Navbar"],
        contentPriorities: ["Headline & positioning", "Primary CTA", "Featured visual preview"],
        cta: intent.primaryCta.value,
        layoutPattern: "Centered headline with action buttons and floating preview card",
      },
      {
        id: "sec-highlights",
        name: "Highlights & Features",
        purpose: "Demonstrate capabilities, core offerings, or key projects",
        recommendedComponents: ["FeatureGrid", "ProjectCard"],
        contentPriorities: ["Top 3-6 highlights", "Interactive category tags", "Detail modal links"],
        layoutPattern: "2-to-3 column responsive grid",
      },
      {
        id: "sec-about",
        name: "About & Context",
        purpose: "Provide background, philosophy, and credibility",
        recommendedComponents: ["AboutModule", "ExperienceTimeline"],
        contentPriorities: ["Core mission statement", "Key milestones/skills", "Social proof links"],
        layoutPattern: "Split 2-column layout (bio text on left, credentials/stats on right)",
      },
      {
        id: "sec-contact",
        name: "Contact & Conversion",
        purpose: "Capture user inquiries or direct to contact channels",
        recommendedComponents: ["ContactSection", "Footer"],
        contentPriorities: ["Inquiry form / direct email button", "Response timeframe notice", "Social links"],
        cta: intent.secondaryCta?.value || "Get in Touch",
        layoutPattern: "Focused card container with clean input fields and submission action",
      },
    ];

    return {
      pages: [
        {
          slug: "/",
          title: "Home",
          purpose: "All-in-one single page conversion and presentation flow",
          isPrimary: true,
          sections,
        },
      ],
      navigation: {
        desktopPattern: "Sticky top bar with smooth scroll anchors (#highlights, #about, #contact)",
        mobilePattern: "Compact drawer menu with anchored section links",
        sticky: true,
        items: [
          { label: "Overview", href: "#sec-hero" },
          { label: "Work", href: "#sec-highlights" },
          { label: "About", href: "#sec-about" },
          { label: "Contact", href: "#sec-contact" },
        ],
      },
      userFlow: [
        "1. Arrive at Hero: absorb core proposition within 3 seconds",
        "2. Scroll to Highlights: explore key projects or feature cards",
        "3. Review About: establish credibility and technical depth",
        "4. Reach Contact: trigger inquiry form or external communication",
      ],
      ctaHierarchy: {
        primary: intent.primaryCta.value,
        secondary: intent.secondaryCta?.value,
        tertiary: "Explore More",
      },
      contentPriorities: ["Hero Value Statement", "Featured Showcase", "About / Credibility", "Contact Conversion"],
    };
  }

  private static buildPortfolioPlan(intent: DesignIntent): SitePlan {
    const homeSections: PageSectionPlan[] = [
      {
        id: "sec-hero",
        name: "Hero Section",
        purpose: "Introduce creator, discipline, and key value statement",
        recommendedComponents: ["Hero", "StatusBadge"],
        contentPriorities: ["Creator title & specialty", "Primary CTA", "Availability status badge"],
        cta: intent.primaryCta.value,
        layoutPattern: "Asymmetric editorial header with large display type",
      },
      {
        id: "sec-work",
        name: "Selected Work Grid",
        purpose: "Showcase flagship projects with visual impact and measurable results",
        recommendedComponents: ["ProjectGrid", "ProjectCard", "TagFilter"],
        contentPriorities: ["Project cover images", "Role & outcome metrics", "Live link anchors"],
        cta: "View Case Study",
        layoutPattern: "2-column staggered responsive card grid",
      },
      {
        id: "sec-capabilities",
        name: "Capabilities & Philosophy",
        purpose: "Highlight technical tools, creative methodology, and skills",
        recommendedComponents: ["SkillsMatrix", "PhilosophyCallout"],
        contentPriorities: ["Core disciplines", "Technology stack tags", "Process summary"],
        layoutPattern: "3-column structured capability cards",
      },
      {
        id: "sec-contact",
        name: "Contact & Collaboration Callout",
        purpose: "Convert visitors into project inquiries or hiring discussions",
        recommendedComponents: ["ContactBanner", "Footer"],
        contentPriorities: ["Direct contact action", "Social platform links", "Timezone/Location"],
        cta: intent.secondaryCta?.value || "Get in Touch",
        layoutPattern: "Full-width high-contrast conversion banner",
      },
    ];

    return {
      pages: [
        {
          slug: "/",
          title: "Home",
          purpose: "Primary landing and selected work overview",
          isPrimary: true,
          sections: homeSections,
        },
      ],
      navigation: {
        desktopPattern: "Minimal horizontal bar with logo mark, category anchors, and contact button",
        mobilePattern: "Full-screen overlay menu with touch-friendly navigation links",
        sticky: true,
        items: [
          { label: "Selected Work", href: "#sec-work" },
          { label: "Capabilities", href: "#sec-capabilities" },
          { label: "Contact", href: "#sec-contact" },
        ],
      },
      userFlow: [
        "1. Viewer scans hero positioning and availability",
        "2. Viewer browses curated case studies in selected work grid",
        "3. Viewer evaluates capabilities and skill depth",
        "4. Viewer initiates contact via primary/secondary CTA",
      ],
      ctaHierarchy: {
        primary: intent.primaryCta.value,
        secondary: intent.secondaryCta?.value,
      },
      contentPriorities: ["Hero Positioning", "Flagship Case Studies", "Technical Capabilities", "Direct Contact Action"],
    };
  }

  private static buildSaasPlan(intent: DesignIntent): SitePlan {
    const homeSections: PageSectionPlan[] = [
      {
        id: "sec-hero",
        name: "Hero Conversion Section",
        purpose: "State core SaaS benefit, social proof, and trial signup CTA",
        recommendedComponents: ["Hero", "ProductMockup", "SocialProofBar"],
        contentPriorities: ["Value proposition heading", "Free trial CTA", "Interactive product screenshot preview"],
        cta: intent.primaryCta.value,
        layoutPattern: "Centered headline, dual CTA buttons, and elevated preview mockup",
      },
      {
        id: "sec-features",
        name: "Core Features Bento Grid",
        purpose: "Break down product benefits into visual, digestible capability cards",
        recommendedComponents: ["BentoGrid", "FeatureCard"],
        contentPriorities: ["Primary capability spotlight", "Secondary feature cards", "Integration badges"],
        layoutPattern: "Asymmetric bento grid (1 large feature card + 4 smaller cards)",
      },
      {
        id: "sec-pricing",
        name: "Pricing Plans",
        purpose: "Clearly communicate tiered options and remove purchase friction",
        recommendedComponents: ["PricingTable", "BillingToggle"],
        contentPriorities: ["Monthly/Annual toggle", "Starter, Pro, and Enterprise tiers", "Feature checklists"],
        cta: "Choose Plan",
        layoutPattern: "3-column card comparison with highlighted recommended tier",
      },
      {
        id: "sec-faq",
        name: "Frequently Asked Questions",
        purpose: "Resolve common objections and security/trial queries",
        recommendedComponents: ["FaqAccordion"],
        contentPriorities: ["Top 5-6 customer questions", "Expandable answers", "Support link"],
        layoutPattern: "Clean single-column centered accordion",
      },
      {
        id: "sec-footer-cta",
        name: "Final Conversion Banner & Footer",
        purpose: "Reiterate primary CTA before user leaves page",
        recommendedComponents: ["FinalCtaBanner", "Footer"],
        contentPriorities: ["Final trial invite", "Navigation directory", "Compliance & copyright"],
        cta: intent.primaryCta.value,
        layoutPattern: "Full-width background highlight container",
      },
    ];

    return {
      pages: [
        {
          slug: "/",
          title: "Home",
          purpose: "SaaS product showcase, feature demonstration, and lead conversion",
          isPrimary: true,
          sections: homeSections,
        },
      ],
      navigation: {
        desktopPattern: "Modern SaaS header with logo on left, nav links centered, and login + signup CTA on right",
        mobilePattern: "Collapsible sheet navigation with sticky bottom CTA",
        sticky: true,
        items: [
          { label: "Features", href: "#sec-features" },
          { label: "Pricing", href: "#sec-pricing" },
          { label: "FAQ", href: "#sec-faq" },
        ],
      },
      userFlow: [
        "1. Discover product value proposition and social proof in Hero",
        "2. Understand workflow and advantages through Bento Feature Grid",
        "3. Evaluate appropriate plan in Pricing section",
        "4. Click Primary CTA to start trial or register account",
      ],
      ctaHierarchy: {
        primary: intent.primaryCta.value,
        secondary: intent.secondaryCta?.value || "Book a Demo",
      },
      contentPriorities: ["Value Proposition", "Feature Bento Grid", "Pricing Comparison", "Social Proof & Trust"],
    };
  }

  private static buildEcommercePlan(intent: DesignIntent): SitePlan {
    return {
      pages: [
        {
          slug: "/",
          title: "Storefront Home",
          purpose: "Merchandise discovery and seasonal promotions",
          isPrimary: true,
          sections: [
            {
              id: "sec-hero",
              name: "Storefront Hero",
              purpose: "Feature flagship collection and promotional offer",
              recommendedComponents: ["HeroBanner", "PromoBadge"],
              contentPriorities: ["Hero collection banner", "Shop Now CTA", "Promo discount code"],
              cta: intent.primaryCta.value,
              layoutPattern: "Full-bleed split banner with product focus",
            },
            {
              id: "sec-products",
              name: "Featured Collection Grid",
              purpose: "Showcase trending products with instant cart actions",
              recommendedComponents: ["ProductGrid", "ProductCard"],
              contentPriorities: ["Product imagery", "Pricing & ratings", "Quick Add button"],
              cta: "Add to Cart",
              layoutPattern: "4-column responsive product card grid",
            },
          ],
        },
      ],
      navigation: {
        desktopPattern: "Store navigation with category dropdowns, search bar, and cart drawer trigger",
        mobilePattern: "Mobile header with search trigger and sticky bottom cart bar",
        sticky: true,
        items: [
          { label: "Shop All", href: "/shop" },
          { label: "New Arrivals", href: "/new" },
          { label: "Best Sellers", href: "/bestsellers" },
        ],
      },
      userFlow: [
        "1. Land on Storefront and view featured promotions",
        "2. Filter and browse products in collection grid",
        "3. Add items to cart with instant feedback",
        "4. Proceed through streamlined checkout",
      ],
      ctaHierarchy: {
        primary: intent.primaryCta.value,
        secondary: intent.secondaryCta?.value || "View All Products",
      },
      contentPriorities: ["Product Imagery", "Clear Pricing & Badges", "Instant Cart Actions", "Trust / Free Shipping Notice"],
    };
  }

  private static buildBlogPlan(intent: DesignIntent): SitePlan {
    return {
      pages: [
        {
          slug: "/",
          title: "Editorial Journal",
          purpose: "Article discovery, reading engagement, and newsletter conversion",
          isPrimary: true,
          sections: [
            {
              id: "sec-featured",
              name: "Lead Editorial Article",
              purpose: "Spotlight the most prominent essay or publication",
              recommendedComponents: ["FeaturedArticleCard"],
              contentPriorities: ["Title, excerpt, author, read time", "Hero article cover"],
              layoutPattern: "Large hero article with prominent headline and author avatar",
            },
            {
              id: "sec-feed",
              name: "Article Feed & Taxonomy",
              purpose: "Display chronologically organized publications by category",
              recommendedComponents: ["ArticleFeed", "CategoryPills"],
              contentPriorities: ["Article list", "Category filters", "Reading time metadata"],
              layoutPattern: "2-column editorial card list",
            },
          ],
        },
      ],
      navigation: {
        desktopPattern: "Classic editorial masthead with category links and subscribe button",
        mobilePattern: "Minimal top bar with category drawer",
        sticky: true,
        items: [
          { label: "Latest", href: "#sec-feed" },
          { label: "Essays", href: "#essays" },
          { label: "Subscribe", href: "#subscribe" },
        ],
      },
      userFlow: [
        "1. Discover lead story and key editorial highlights",
        "2. Filter topics by category or search archives",
        "3. Read article with optimal typography comfort",
        "4. Subscribe to newsletter for regular updates",
      ],
      ctaHierarchy: {
        primary: intent.primaryCta.value,
        secondary: intent.secondaryCta?.value,
      },
      contentPriorities: ["Lead Article", "Article Feed", "Reading Typography", "Newsletter Capture"],
    };
  }

  private static buildAgencyPlan(intent: DesignIntent): SitePlan {
    return {
      pages: [
        {
          slug: "/",
          title: "Agency Studio",
          purpose: "Position agency expertise, showcase client work, and generate high-value inquiries",
          isPrimary: true,
          sections: [
            {
              id: "sec-hero",
              name: "Agency Ethos Hero",
              purpose: "Bold headline stating studio discipline and mission",
              recommendedComponents: ["AgencyHero", "ClientMarquee"],
              contentPriorities: ["Agency mission statement", "Client trust logos", "Start project CTA"],
              cta: intent.primaryCta.value,
              layoutPattern: "Oversized bold display typography with client marquee",
            },
            {
              id: "sec-cases",
              name: "Client Case Studies",
              purpose: "Immersive showcase of client deliverables and business impact",
              recommendedComponents: ["CaseStudyShowcase"],
              contentPriorities: ["Client deliverables", "Before/After metrics", "Case study preview"],
              layoutPattern: "Full-width staggered visual case study cards",
            },
          ],
        },
      ],
      navigation: {
        desktopPattern: "Spacious studio header with project inquiry button",
        mobilePattern: "Full-screen studio navigation menu",
        sticky: true,
        items: [
          { label: "Work", href: "#sec-cases" },
          { label: "Services", href: "#services" },
          { label: "Contact", href: "#contact" },
        ],
      },
      userFlow: [
        "1. Absorb agency creative ethos and client credentials",
        "2. Review detailed case studies and results",
        "3. Understand service capabilities and process",
        "4. Submit project brief or schedule introductory call",
      ],
      ctaHierarchy: {
        primary: intent.primaryCta.value,
        secondary: intent.secondaryCta?.value || "Explore Work",
      },
      contentPriorities: ["Studio Positioning", "Client Case Studies", "Service Capabilities", "Project Onboarding CTA"],
    };
  }

  private static buildDocumentationPlan(intent: DesignIntent): SitePlan {
    return {
      pages: [
        {
          slug: "/docs",
          title: "Documentation Overview",
          purpose: "Quickstart developer onboarding and technical API reference",
          isPrimary: true,
          sections: [
            {
              id: "sec-quickstart",
              name: "Quickstart Guide",
              purpose: "Step-by-step installation and basic usage",
              recommendedComponents: ["QuickstartCard", "CodeSnippet"],
              contentPriorities: ["npm install command", "Code example", "Next steps link"],
              cta: intent.primaryCta.value,
              layoutPattern: "Structured 2-column guide with code preview",
            },
          ],
        },
      ],
      navigation: {
        desktopPattern: "Sticky multi-level sidebar on left, content in center, table of contents on right",
        mobilePattern: "Collapsible drawer for documentation tree and search",
        sticky: true,
        items: [
          { label: "Quickstart", href: "#quickstart" },
          { label: "Architecture", href: "#architecture" },
          { label: "API Reference", href: "#api" },
        ],
      },
      userFlow: [
        "1. Search documentation or select topic from sidebar",
        "2. Review explanation and copy code snippets",
        "3. Follow step-by-step guides to implementation",
      ],
      ctaHierarchy: {
        primary: intent.primaryCta.value,
        secondary: intent.secondaryCta?.value || "GitHub Repo",
      },
      contentPriorities: ["Search & Sidebar Navigation", "Code Snippet Readability", "Step-by-Step Guides"],
    };
  }

  private static buildDashboardPlan(intent: DesignIntent): SitePlan {
    return {
      pages: [
        {
          slug: "/dashboard",
          title: "Application Overview",
          purpose: "Actionable operational metrics and management console",
          isPrimary: true,
          sections: [
            {
              id: "sec-kpi",
              name: "Key Performance Indicators",
              purpose: "Display core business metrics with trend markers",
              recommendedComponents: ["KpiCardGrid"],
              contentPriorities: ["Total metrics", "Percentage trends", "Quick filter"],
              layoutPattern: "4-column metric card grid",
            },
            {
              id: "sec-table",
              name: "Activity Data Table",
              purpose: "Sortable, filterable operational records",
              recommendedComponents: ["DataTable", "TablePagination"],
              contentPriorities: ["Status badges", "Timestamp", "Contextual actions"],
              layoutPattern: "Full-width dense data table",
            },
          ],
        },
      ],
      navigation: {
        desktopPattern: "Sidebar navigation with collapsible icons and top header user controls",
        mobilePattern: "Bottom tab bar or sliding left navigation drawer",
        sticky: true,
        items: [
          { label: "Overview", href: "/dashboard" },
          { label: "Analytics", href: "/analytics" },
          { label: "Settings", href: "/settings" },
        ],
      },
      userFlow: [
        "1. Check high-level KPI trends in overview cards",
        "2. Drill down into recent activities or reports in table",
        "3. Trigger contextual action or export data",
      ],
      ctaHierarchy: {
        primary: intent.primaryCta.value,
        secondary: intent.secondaryCta?.value,
      },
      contentPriorities: ["KPI Summaries", "Data Table Scannability", "Filter & Search Tools"],
    };
  }

  private static buildGenericPlan(intent: DesignIntent): SitePlan {
    return {
      pages: [
        {
          slug: "/",
          title: "Home",
          purpose: "Present core application value and facilitate user navigation",
          isPrimary: true,
          sections: [
            {
              id: "sec-hero",
              name: "Hero Section",
              purpose: "Welcome visitors and explain core purpose",
              recommendedComponents: ["Hero"],
              contentPriorities: ["Main headline", "Supporting paragraph", "Action CTA"],
              cta: intent.primaryCta.value,
              layoutPattern: "Centered hero container with clear CTA",
            },
            {
              id: "sec-content",
              name: "Feature & Content Grid",
              purpose: "Provide structured overview of key features or offerings",
              recommendedComponents: ["ContentGrid", "ContentCard"],
              contentPriorities: ["Key benefit cards", "Iconography", "Descriptive copy"],
              layoutPattern: "3-column responsive card grid",
            },
            {
              id: "sec-contact",
              name: "Contact / Next Steps",
              purpose: "Direct users to connect or sign up",
              recommendedComponents: ["ContactSection", "Footer"],
              contentPriorities: ["Contact actions", "Navigation links"],
              cta: intent.secondaryCta?.value || "Get in Touch",
              layoutPattern: "Clean card container with action button",
            },
          ],
        },
      ],
      navigation: {
        desktopPattern: "Header navigation with brand logo on left and links on right",
        mobilePattern: "Hamburger menu dropdown",
        sticky: true,
        items: [
          { label: "Home", href: "#sec-hero" },
          { label: "Features", href: "#sec-content" },
          { label: "Contact", href: "#sec-contact" },
        ],
      },
      userFlow: [
        "1. Discover proposition in hero section",
        "2. Explore key capabilities in feature grid",
        "3. Engage with primary conversion CTA",
      ],
      ctaHierarchy: {
        primary: intent.primaryCta.value,
        secondary: intent.secondaryCta?.value,
      },
      contentPriorities: ["Hero Value Statement", "Feature Discovery Grid", "Actionable CTA"],
    };
  }
}

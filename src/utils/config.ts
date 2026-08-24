export interface ElevateConfig {
  targetUrl: string;
  maxPasses: number;
  reportDir: string;
  projectRoot: string;
  viewports: {
    mobile: { width: number; height: number; label: string };
    tablet: { width: number; height: number; label: string };
    desktop: { width: number; height: number; label: string };
  };
}

export const DEFAULT_CONFIG: ElevateConfig = {
  targetUrl: "http://localhost:3000",
  maxPasses: 3,
  reportDir: "./elevate-report",
  projectRoot: process.cwd(),
  viewports: {
    mobile: { width: 375, height: 667, label: "mobile (375px)" },
    tablet: { width: 768, height: 1024, label: "tablet (768px)" },
    desktop: { width: 1440, height: 900, label: "desktop (1440px)" },
  },
};

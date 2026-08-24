/**
 * Phase 4B: MCP Resources Implementation
 *
 * Exposes read-only contextual resources (latest run, report JSON, report HTML).
 */

import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import type { McpRunStore } from "./store.js";
import { renderHtmlReport } from "../reports/renderer.js";
import { sanitizeMcpOutput } from "./security.js";

export function registerMcpResources(server: McpServer, store: McpRunStore): void {
  // -------------------------------------------------------------------------
  // 1. Static Resource: elevate://runs/latest
  // -------------------------------------------------------------------------
  server.registerResource(
    "latest-run",
    "elevate://runs/latest",
    {
      title: "Latest Elevate Run Result",
      description: "Structured JSON data of the most recent audit or improve run",
      mimeType: "application/json",
    },
    async (uri) => {
      const latest = store.getLatestRun();
      if (!latest) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: "No runs recorded in current session." }, null, 2),
            },
          ],
        };
      }

      const cleanData = sanitizeMcpOutput(latest.data);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(cleanData, null, 2),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // 2. Dynamic Resource: elevate://runs/{runId}
  // -------------------------------------------------------------------------
  server.registerResource(
    "run-by-id",
    new ResourceTemplate("elevate://runs/{runId}", { list: undefined }),
    {
      title: "Elevate Run Result by ID",
      description: "Structured JSON result for a specific run ID",
      mimeType: "application/json",
    },
    async (uri, params) => {
      const runId = params.runId as string;
      const run = store.getRun(runId);
      if (!run) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: `Run '${runId}' not found.` }, null, 2),
            },
          ],
        };
      }

      const cleanData = sanitizeMcpOutput(run.data);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(cleanData, null, 2),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // 3. Dynamic Resource: elevate://reports/{reportId}
  // -------------------------------------------------------------------------
  server.registerResource(
    "report-json-by-id",
    new ResourceTemplate("elevate://reports/{reportId}", { list: undefined }),
    {
      title: "Elevate Report JSON by ID",
      description: "Machine-readable ReportModel JSON for a given report ID",
      mimeType: "application/json",
    },
    async (uri, params) => {
      const reportId = params.reportId as string;
      const report = store.getReport(reportId);
      if (!report) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: `Report '${reportId}' not found.` }, null, 2),
            },
          ],
        };
      }

      const cleanReport = sanitizeMcpOutput(report);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(cleanReport, null, 2),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // 4. Dynamic Resource: elevate://reports/{reportId}/html
  // -------------------------------------------------------------------------
  server.registerResource(
    "report-html-by-id",
    new ResourceTemplate("elevate://reports/{reportId}/html", { list: undefined }),
    {
      title: "Elevate Report HTML by ID",
      description: "Interactive visual diff HTML document for a given report ID",
      mimeType: "text/html",
    },
    async (uri, params) => {
      const reportId = params.reportId as string;
      const report = store.getReport(reportId);
      if (!report) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/html",
              text: "<html><body><h1>Report Not Found</h1></body></html>",
            },
          ],
        };
      }

      const html = renderHtmlReport(report);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/html",
            text: html,
          },
        ],
      };
    }
  );
}

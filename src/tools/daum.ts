import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ToolContext } from "../context.js";
import type { DaumSearchCategory } from "../services/kakao.js";
import { DaumSearchSchema } from "../schemas.js";
import { describeApiError } from "../services/errors.js";
import { render, stripHighlightTags } from "../services/format.js";
import { logger } from "../logger.js";

type Input = z.infer<typeof DaumSearchSchema>;

interface DaumToolSpec {
  name: string;
  category: DaumSearchCategory;
  title: string;
  label: string;
}

const DAUM_TOOLS: DaumToolSpec[] = [
  {
    name: "daum_search_web",
    category: "web",
    title: "Search Daum web documents",
    label: "web document",
  },
  {
    name: "daum_search_image",
    category: "image",
    title: "Search Daum images",
    label: "image",
  },
  {
    name: "daum_search_blog",
    category: "blog",
    title: "Search Daum blog posts",
    label: "blog post",
  },
  {
    name: "daum_search_cafe",
    category: "cafe",
    title: "Search Daum cafe posts",
    label: "cafe post",
  },
];

/** Returns the value if it is a non-empty string, else undefined. */
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Reduces a raw Daum document to the fields worth surfacing. */
function summariseDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const title = str(doc.title);
  out.title = title
    ? stripHighlightTags(title)
    : (str(doc.display_sitename) ?? "[untitled]");

  const contents = str(doc.contents);
  if (contents) {
    const clean = stripHighlightTags(contents);
    out.snippet = clean.length > 150 ? `${clean.slice(0, 150)}...` : clean;
  }

  out.url = str(doc.url) ?? str(doc.doc_url);
  out.image_url =
    str(doc.image_url) ?? str(doc.thumbnail_url) ?? str(doc.thumbnail);
  out.source =
    str(doc.blogname) ?? str(doc.cafename) ?? str(doc.collection);

  const dt = doc.datetime;
  if (typeof dt === "string" || typeof dt === "number") {
    const parsed = new Date(dt);
    if (!Number.isNaN(parsed.getTime())) {
      out.date = parsed.toISOString().slice(0, 10);
    }
  }

  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/** Registers all four Daum search tools (web, image, blog, cafe). */
export function registerDaumSearchTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  for (const spec of DAUM_TOOLS) {
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description:
          `Search Daum for ${spec.label}s by query. Read-only. Supports ` +
          "ordering by accuracy or recency and offset pagination via the " +
          "'page' parameter.\n\n" +
          "Returns, per result: title, a text snippet (when available), URL, " +
          "image URL, source name, and publication date.",
        inputSchema: DaumSearchSchema.shape,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (input: Input) => {
        try {
          const data = await ctx.kakao.daumSearch(spec.category, {
            query: input.query,
            sort: input.sort,
            page: input.page,
            size: input.size,
          });
          const docs = data.documents ?? [];
          if (docs.length === 0) {
            return {
              content: [
                { type: "text", text: `No ${spec.label}s found for "${input.query}".` },
              ],
            };
          }

          const results = docs.map(summariseDoc);
          const total = data.meta?.total_count ?? results.length;
          const structured = {
            query: input.query,
            category: spec.category,
            total_count: total,
            page: input.page,
            count: results.length,
            has_more: data.meta ? !data.meta.is_end : false,
            results,
          };

          const markdown = [
            `# Daum ${spec.label} search: "${input.query}"`,
            "",
            `Found ${total} ${spec.label}s (page ${input.page}, showing ${results.length}).`,
            "",
            ...results.map((r, i) => {
              const lines = [`## ${i + 1}. ${r.title as string}`];
              if (r.snippet) lines.push(`- ${r.snippet as string}`);
              if (r.source) lines.push(`- Source: ${r.source as string}`);
              if (r.date) lines.push(`- Date: ${r.date as string}`);
              if (r.url) lines.push(`- URL: ${r.url as string}`);
              if (r.image_url) lines.push(`- Image: ${r.image_url as string}`);
              return lines.join("\n");
            }),
            "",
            structured.has_more
              ? "More results are available. Increase 'page' to see them."
              : "This is the last page of results.",
          ].join("\n");

          return {
            content: [
              {
                type: "text",
                text: render(input.response_format, markdown, structured),
              },
            ],
          };
        } catch (error) {
          logger.error(
            `${spec.name} failed:`,
            error instanceof Error ? error.message : String(error),
          );
          return {
            content: [
              {
                type: "text",
                text: describeApiError(error, `Daum ${spec.label} search failed`),
              },
            ],
            isError: true,
          };
        }
      },
    );
  }
}

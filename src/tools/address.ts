import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ToolContext } from "../context.js";
import { CoordToAddressSchema } from "../schemas.js";
import { describeApiError } from "../services/errors.js";
import { render } from "../services/format.js";
import { logger } from "../logger.js";

type Input = z.infer<typeof CoordToAddressSchema>;

/** Registers the kakao_coord_to_address tool. */
export function registerCoordToAddress(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "kakao_coord_to_address",
    {
      title: "Convert coordinate to address",
      description:
        "Convert a WGS84 longitude/latitude coordinate into a Korean address. " +
        "Read-only. Returns both the road-name address and the lot-number " +
        "(jibun) address when available.",
      inputSchema: CoordToAddressSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: Input) => {
      try {
        const data = await ctx.kakao.coordToAddress(input.x, input.y);
        const doc = data.documents?.[0];
        if (!doc) {
          return {
            content: [
              {
                type: "text",
                text: `No address found for coordinate (${input.x}, ${input.y}).`,
              },
            ],
          };
        }

        const structured = {
          x: input.x,
          y: input.y,
          road_address: doc.road_address?.address_name ?? null,
          lot_address: doc.address?.address_name ?? null,
          building_name: doc.road_address?.building_name ?? null,
        };

        const markdown = [
          `# Address for (${input.x}, ${input.y})`,
          "",
          `- Road address: ${structured.road_address ?? "not available"}`,
          `- Lot address: ${structured.lot_address ?? "not available"}`,
          ...(structured.building_name
            ? [`- Building: ${structured.building_name}`]
            : []),
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
          "kakao_coord_to_address failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            {
              type: "text",
              text: describeApiError(error, "Address conversion failed"),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

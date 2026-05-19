import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import dotenv from "dotenv";
import { DEFAULT_ODSAY_REFERER } from "./constants.js";

// Load .env before reading any environment variable. quiet: true suppresses
// dotenv's startup banner, which would otherwise be written to stdout and
// corrupt the JSON-RPC stream in stdio mode.
dotenv.config({ quiet: true });

export type TransportMode = "stdio" | "http";

export interface AppConfig {
  mode: TransportMode;
  port: number;
  kakaoApiKey: string;
  odsayApiKey?: string;
  odsayReferer: string;
}

/**
 * Builds the runtime configuration from CLI arguments and environment
 * variables. CLI arguments take precedence over environment variables.
 *
 * @throws Error if the required Kakao REST API key is missing.
 */
export function loadConfig(): AppConfig {
  const argv = yargs(hideBin(process.argv))
    .option("mode", {
      type: "string",
      choices: ["stdio", "http"] as const,
      default: "stdio",
      description: "Transport mode: stdio (local) or http (remote)",
    })
    .option("port", {
      type: "number",
      default: 3000,
      description: "Port for the HTTP transport",
    })
    .option("kakao-api-key", {
      type: "string",
      description: "Kakao REST API key (overrides KAKAO_REST_API_KEY)",
    })
    .option("odsay-api-key", {
      type: "string",
      description: "ODsay API key (overrides ODSAY_API_KEY)",
    })
    .option("odsay-referer", {
      type: "string",
      description: "Referer header matching the ODsay key's registered URI",
    })
    .help()
    .alias("help", "h")
    .parseSync();

  const kakaoApiKey =
    (argv.kakaoApiKey as string | undefined) ?? process.env.KAKAO_REST_API_KEY;

  if (!kakaoApiKey) {
    throw new Error(
      "Kakao REST API key not found. Set the KAKAO_REST_API_KEY environment " +
        "variable or pass --kakao-api-key. Register an app at " +
        "https://developers.kakao.com/ to obtain a key.",
    );
  }

  return {
    mode: argv.mode as TransportMode,
    port: argv.port as number,
    kakaoApiKey,
    odsayApiKey:
      (argv.odsayApiKey as string | undefined) ?? process.env.ODSAY_API_KEY,
    odsayReferer:
      (argv.odsayReferer as string | undefined) ??
      process.env.ODSAY_REFERER ??
      DEFAULT_ODSAY_REFERER,
  };
}

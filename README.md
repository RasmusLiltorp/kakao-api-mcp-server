# korea-travel-mcp

An MCP (Model Context Protocol) server for Korean travel and local search. It
gives an AI agent tools for Kakao Map place search, coordinate-to-address
conversion, Kakao Mobility car routing, ODsay public-transit routing, and Daum
web/image/blog/cafe search.

This project is a fork of
[jeong-sik/kakao-api-mcp-server](https://github.com/jeong-sik/kakao-api-mcp-server).
It has been restructured into a modular TypeScript codebase, modernised to the
current MCP SDK (`registerTool`, streamable HTTP), and extended with public
transit routing.

## Tools

| Tool | Description |
| --- | --- |
| `kakao_search_places` | Search places on Kakao Map by keyword, optionally biased to a coordinate. Paginated. |
| `kakao_search_by_category` | Find all places of a category (cafe, pharmacy, etc.) within a radius of a point. |
| `kakao_coord_to_address` | Convert a WGS84 coordinate to road-name and lot-number addresses. |
| `kakao_search_address` | Geocode an address string to a WGS84 coordinate. |
| `kakao_coord_to_region` | Convert a coordinate to its administrative and legal region. |
| `kakao_find_route` | Car route between two places (distance, duration, taxi fare, tolls, traffic). |
| `odsay_find_transit_route` | Public-transit routes (bus, subway, intercity train) via ODsay, ranked fastest-first. |
| `daum_search_web` | Search Daum web documents. |
| `daum_search_image` | Search Daum images. |
| `daum_search_blog` | Search Daum blog posts. |
| `daum_search_cafe` | Search Daum cafe posts. |

Every tool is read-only and accepts a `response_format` parameter
(`markdown`, the default, or `json`).

Geocoding results are cached in-process and all outbound requests retry with
backoff on rate-limit errors, to keep API call counts low and routing reliable.

`kakao_find_route` computes car routes only. For public transit, use
`odsay_find_transit_route`.

## Requirements

- Node.js 18 or newer.
- A Kakao REST API key. Register an app at
  [developers.kakao.com](https://developers.kakao.com/) and enable the Local
  (Kakao Map) and Search services.
- An ODsay API key (optional, only needed for `odsay_find_transit_route`).
  Register at [lab.odsay.com](https://lab.odsay.com/). ODsay keys registered
  against a web URI are validated by `Referer` header; set `ODSAY_REFERER` to
  that URI when your key requires it.

## Setup

```bash
npm install
npm run build
```

Provide credentials through environment variables (a `.env` file is supported)
or CLI arguments. See `.env.example`.

| Variable | CLI argument | Required |
| --- | --- | --- |
| `KAKAO_REST_API_KEY` | `--kakao-api-key` | yes |
| `ODSAY_API_KEY` | `--odsay-api-key` | no |
| `ODSAY_REFERER` | `--odsay-referer` | no |

## Running

stdio transport (local clients such as Claude Desktop and Claude Code):

```bash
npm run start:stdio
```

Streamable HTTP transport (remote clients), served at `POST /mcp`:

```bash
npm run start:http   # add -- --port 8080 to change the port
```

## Client configuration

Add the server to your MCP client config. See `mcp.json.example` for the
shape; point `args` at the built `dist/index.js`.

## Skill

`skills/korea-fastest-route/` is a Claude skill that drives these tools to find
the fastest route between two Korean places while minimising API calls. Install
it by copying the folder into `~/.claude/skills/`.

## Project structure

```
src/
  index.ts        Entry point
  config.ts       CLI and environment configuration
  server.ts       MCP server assembly and tool registration
  transport.ts    stdio and streamable HTTP transports
  schemas.ts      Zod input schemas
  types.ts        API response types
  services/       API clients, geocoding, formatting, error handling
  tools/          One file per tool domain
```

## License

MIT. See [LICENSE](./LICENSE). Original work by jeong-sik; see the upstream
repository linked above.

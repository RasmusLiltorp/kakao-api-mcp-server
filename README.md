# korea-travel-mcp

An MCP (Model Context Protocol) server for Korean travel and local search. It
gives an AI agent tools for Kakao Map place search, coordinate-to-address
conversion, Kakao Mobility car routing, ODsay public-transit routing, Daum
web/image/blog/cafe search, and housing/room-listing search across gobang.kr,
Zigbang, Dabang and Goshipages.

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
| `gobang_search_listings` | Search gobang.kr 1인가구 housing listings (고시원/원룸텔/쉐어하우스/코리빙/오피스텔) by region or map bounds, with house-type, gender, rent, deposit and age filters. |
| `gobang_count_listings` | Count listings matching a filter, without fetching them. |
| `gobang_listing_detail` | Full detail for one listing (address, contact, gender/age policy, tags, nearby subways and schools). |
| `gobang_listings_nearby` | Listings within 0–500m or 500–1000m of a coordinate. |
| `gobang_search_places` | Resolve a place / subway / region name to coordinates via gobang.kr's place search. |
| `gobang_regions` | List top-level regions (시/도) with their codes and listing counts. |
| `zigbang_search_places` | Resolve a place / subway / region / apartment name to coordinates via Zigbang. |
| `zigbang_search_listings` | Search Zigbang rooms (원룸/오피스텔/빌라) in an area by geohash or coordinate, with deposit/rent and sales-type filters. |
| `zigbang_listing_detail` | Full detail for one Zigbang listing (price, area, floor, address, options, subways, agent). |
| `dabang_search_region` | Resolve a Korean place name to a Dabang region code and coordinates. |
| `dabang_search_listings` | Search Dabang rooms by region/bbox/subway/university with sales-type, room-type, deposit/rent and size filters (search only — detail is login-gated). |
| `goshipages_search_places` | Autocomplete Goshipages destinations (subway, area, listing) to a destination id. |
| `goshipages_search_listings` | Search Goshipages stays (goshiwon/livingtel/share-house) near a destination, rates in KRW. |
| `goshipages_listing_detail` | Full detail for one Goshipages stay (address, gender, amenities, room types, languages). |

Every tool is read-only and accepts a `response_format` parameter
(`markdown`, the default, or `json`).

The `gobang_*`, `zigbang_*`, `dabang_*` and `goshipages_*` tools use each
platform's own public (unauthenticated) endpoints — the same ones the website
calls — and need no API key. Korean prices are in 만원 (10,000 KRW); Goshipages
rates are in KRW. Dabang exposes search only (its listing detail requires login,
and its search coordinates are approximate).

To keep API call counts low, every API response is cached in-process with a
TTL tuned to how fast that data changes (long for addresses, short for
traffic-sensitive routes), identical concurrent requests are coalesced into
one, and all outbound requests retry with backoff on rate-limit errors.

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

## Skills

`skills/` contains Claude skills that drive these tools efficiently. Install
them by copying the folders into `~/.claude/skills/`.

| Skill | Purpose |
| --- | --- |
| `korea-fastest-route` | Find the fastest route between two places, comparing car and transit. |
| `korea-place-finder` | Find places and points of interest, including "what is near X". |
| `korea-local-search` | Search Korean web, blog, cafe and image content via Daum. |
| `korea-housing-search` | Find 1인가구 housing (고시원, 원룸텔, 쉐어하우스 …) on gobang.kr by region, subway or map area. |
| `zigbang-rooms` | Search Zigbang rooms (원룸/오피스텔/빌라) by area with deposit/rent filters, and pull listing detail. |
| `dabang-rooms` | Search Dabang rooms by region/area with room-type and price filters (search only). |
| `goshipages-stays` | Find foreigner-friendly Goshipages stays (goshiwon/livingtel/share-house) near a destination. |

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

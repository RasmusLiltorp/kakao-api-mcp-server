---
name: korea-housing-search
description: >-
  Find 1인가구 (single-person) housing in South Korea — 고시원, 원룸텔, 원룸/투룸,
  쉐어하우스, 코리빙, 오피스텔 — on gobang.kr using the korea-travel-mcp gobang
  tools. Use when the user wants to find a goshiwon/one-roomtel/sharehouse/room
  to rent, compare monthly rent or deposit in an area, or look up a specific
  gobang.kr listing.
---

# Korea 1인가구 housing search (gobang.kr)

This skill finds single-person housing listings on gobang.kr using the
`korea-travel-mcp` gobang tools, with the fewest API calls. All tools are
read-only, need no login, and report prices in 만원 (10,000 KRW).

## Tools you will use

- `gobang_regions` — top-level 시/도 regions with their `sido_code` and counts.
- `gobang_search_places` — resolve a place/subway/region name to coordinates.
- `gobang_search_listings` — the main search; filter by region or map bounds,
  house type, gender, rent, deposit, and age.
- `gobang_count_listings` — how many listings match, without fetching them.
- `gobang_listings_nearby` — listings within 0–500m or 500–1000m of a point.
- `gobang_listing_detail` — full detail for one listing by its number.

## Picking a location (required for search/count)

Every search or count needs a location. Choose the most specific one you can:

1. **Near a subway or landmark** — call `gobang_search_places` with the name
   (e.g. "사당역"), take the result's `latitude`/`longitude`, then use
   `gobang_listings_nearby`. This is the best match for "near X" requests.
2. **A whole city/province** — call `gobang_regions`, pick the `sido_code`
   (e.g. "11" 서울), and pass it to `gobang_search_listings`.
3. **A map area** — pass a bounding box (`sw_lat`, `ne_lat`, `sw_lng`,
   `ne_lng`) when the user gives an explicit area.

## Filters

- `house_types`: GOSIWON 고시원, ONE_ROOM_TEL 원룸텔, ONE_TWO_ROOM 원룸/투룸,
  SHARE_HOUSE 쉐어하우스, CO_LIVING 코리빙, OFFICETEL 오피스텔. Omit for all.
- `gender`: MALE 남성전용, FEMALE 여성전용, ALL.
- `min_price`/`max_price` (monthly rent) and `min_deposit`/`max_deposit`, all in
  만원. `min_age`/`max_age` for tenant age limits.

## Workflow

1. **Resolve the location first** when the user names a station or landmark
   (`gobang_search_places` → coords → `gobang_listings_nearby`). For a city,
   use `gobang_regions` → `sido_code`.
2. **Gauge before listing (optional).** For a broad area, `gobang_count_listings`
   shows how many match so you can tighten filters before pulling results.
3. **Search with filters**, then page through with `page`/`page_size`.
4. **Drill in** with `gobang_listing_detail` (use the listing `no`) when the
   user wants address, contact, gender/age policy, or nearby subways/schools.

## Reporting

Summarise in the user's language. Lead with the count and the top matches:
name, type, monthly rent / deposit, location, and nearest subway. Each result
includes its gobang.kr URL (`https://gobang.kr/place/<no>`) — surface it so the
user can open the listing. Note tour-video availability and gender/age
restrictions when relevant.

## Keep API calls low

- Responses are cached, so reuse identical queries verbatim — resolve a
  location's coordinate or `sido_code` once, then reuse it across searches.
- Use `gobang_count_listings` to size a broad area before pulling full pages.
- Start at `page` 1; only paginate when the user needs more than the first set.
- Fetch `gobang_listing_detail` only for listings the user actually wants to
  inspect, not for every search result.

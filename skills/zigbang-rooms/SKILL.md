---
name: zigbang-rooms
description: >-
  Find rooms, officetels and villas to rent or buy in South Korea on Zigbang
  (직방) using the korea-travel-mcp zigbang tools. Use when the user wants to
  find a 원룸/오피스텔/빌라, compare 전세/월세 deposit or rent near a station or
  neighbourhood, or look up a specific Zigbang listing.
---

# Korea room search (Zigbang / 직방)

This skill finds rental and sale listings on Zigbang using the
`korea-travel-mcp` zigbang tools, with the fewest API calls. All tools are
read-only, need no login, and report prices in 만원 (10,000 KRW).

## Tools you will use

- `zigbang_search_places` — resolve a place/subway/region/apartment name to
  coordinates (returns `latitude`/`longitude` and a `type`).
- `zigbang_search_listings` — the main search; takes a geohash OR a
  latitude+longitude, plus property type, deposit/rent range, and deal types.
  Returns enriched per-listing summaries.
- `zigbang_listing_detail` — full detail for one listing by its `item_id`.

## Picking a location (required for search)

`zigbang_search_listings` needs either a `geohash` or a `latitude`+`longitude`.

1. **Near a subway or landmark** — call `zigbang_search_places` with the name
   (e.g. "강남역"), take the result's `latitude`/`longitude`, and pass them to
   `zigbang_search_listings` (it computes the geohash for you).
2. **A neighbourhood** — search the dong name (e.g. "역삼동") the same way.
3. **A known geohash** — pass `geohash` directly (e.g. "wydm9" ≈ central Seoul).

The default geohash `precision` is 5 (~5km cell). Use a higher precision (6–7)
to tighten the area around a point; a cell holds a fixed set of items.

## Filters

- `property_type`: oneroom 원룸, officetel 오피스텔, villa 빌라. Default oneroom.
- `sales_types`: 전세 (lump-sum deposit), 월세 (monthly rent), 매매 (purchase).
  Omit for all.
- `deposit_min`/`deposit_max` (보증금) and `rent_min`/`rent_max` (월세), all in
  만원.

## Workflow

1. **Resolve the location first** when the user names a station, landmark, or
   dong (`zigbang_search_places` → coords). Reuse those coords across searches.
2. **Search with filters** via `zigbang_search_listings`. The area endpoint
   returns only IDs, so the tool details the first `limit` items (default 15,
   max 30) — it does not detail the whole cell. Raise `limit` only if needed.
3. **Drill in** with `zigbang_listing_detail` (use the `item_id`) when the user
   wants options, management cost, move-in date, nearby subways, or the agent
   contact.

## Reporting

Summarise in the user's language. Lead with how many matched and the top
listings: title, deal type (전세/월세), deposit/rent, property/room type, size
(㎡), floor, and location. Each result includes its Zigbang URL
(`https://www.zigbang.com/home/<type>/items/<id>`) — surface it so the user can
open the listing. Mention 관리비 (management cost) and move-in date when
relevant.

## Keep API calls low

- Responses are cached, so reuse identical queries verbatim — resolve a
  location's coordinate once, then reuse it across property types and filters.
- `zigbang_search_listings` already fetches per-listing detail for the page, so
  only call `zigbang_listing_detail` for a listing the user wants to inspect
  more closely.
- Keep `limit` modest (the default 15 is usually plenty); each item beyond the
  area lookup is one extra detail request.
- Narrow with `sales_types` and deposit/rent ranges instead of pulling a large
  `limit` and filtering by hand.

---
name: dabang-rooms
description: >-
  Search 원룸/투룸 (one-room/two-room), 오피스텔, and 아파트 rental listings in
  South Korea on Dabang (다방) using the korea-travel-mcp dabang tools. Use when
  the user wants to find a room/apartment to rent, compare monthly rent (월세)
  or jeonse (전세) deposits in an area, or browse Dabang listings. Search-only:
  full listing detail and contact info are login-gated and unavailable.
---

# Korea room search (Dabang / 다방)

This skill finds rental listings on Dabang (다방) using the `korea-travel-mcp`
dabang tools, with the fewest API calls. All tools are read-only, need no
login, and report prices in 만원 (10,000 KRW).

## Important limitation — search only

Dabang's listing-detail endpoint is **login-gated** (returns 403 to anonymous
clients), so there is **no detail tool**. You can search and list rooms with
their title, type, price, neighbourhood (동), approximate location, and a
thumbnail, but you **cannot** retrieve the exact address, agent contact, or
full detail. For those, direct the user to open the listing in the Dabang app
or on dabangapp.com. Coordinates returned are **approximate** — Dabang jitters
them for privacy.

## Tools you will use

- `dabang_search_region` — resolve a Korean place/region name (동/구/시) to a
  region `code` and coordinates.
- `dabang_search_listings` — the main search; filter by area, deal type, room
  type, deposit, rent, size, and floor.

## Picking an area (required for search)

Every search needs exactly one area. Choose the most specific one you can:

1. **A named neighbourhood/district** — call `dabang_search_region` with the
   Korean name (e.g. "역삼동" or "강남구"), take a result's `code`, and pass it
   as `region_code`. This is the usual path.
2. **A map area** — pass a bounding box (`sw_lat`, `sw_lng`, `ne_lat`,
   `ne_lng`) when the user gives an explicit area, or when you have a centre
   coordinate and want to draw a box around it.
3. **A subway station or university** — pass `subway_id` or `univ_id` if you
   already have a Dabang id for it.

Provide only one area per call.

## Filters

- `selling_types`: MONTHLY_RENT (월세), LEASE (전세/jeonse). Omit for both.
- `room_types`: ONE_ROOM (원룸), TWO_ROOM (투룸), THREE_ROOM, OFFICETEL
  (오피스텔), APT (아파트). Defaults to ONE_ROOM + TWO_ROOM.
- `room_floors`: GROUND_FIRST (1층), GROUND_SECOND_OVER (2층 이상),
  SEMI_BASEMENT (반지하), ROOFTOP (옥탑). Omit for all.
- `min_deposit`/`max_deposit` (보증금) and `min_price`/`max_price` (월세 or
  전세 amount), all in 만원. `min_size`/`max_size` in 평 (pyeong, ≈3.3 m²).

Prices in results come as `deposit/rent` in 만원 — e.g. `80/80` means a
보증금 800만원 deposit and 80만원 monthly rent.

## Workflow

1. **Resolve the area first** when the user names a place — `dabang_search_region`
   → pick the matching `code` → use it as `region_code`. For an explicit map
   area, build a bounding box instead.
2. **Search with filters**, then page through with `page` when the user needs
   more than the first set. The response reports `total` and `has_more`.
3. **Report and hand off.** Since detail is login-gated, summarise the matches
   and tell the user to open promising ones in the Dabang app/site.

## Reporting

Summarise in the user's language. Lead with the total count and the top
matches: title, room type, deal type, deposit/rent (만원), neighbourhood (동),
and the thumbnail. State clearly that exact address and contact require the
Dabang app (login-gated) and that coordinates are approximate.

## Keep API calls low

- Responses are cached, so reuse identical queries verbatim — resolve a
  region's `code` once, then reuse it across searches.
- Resolve the area with a single `dabang_search_region` call; don't re-resolve
  the same place.
- Start at `page` 1; only paginate (`page` 2, 3, …) when the user needs more
  than the first set of results.
- Apply filters up front (deal/room type, deposit, rent) to narrow results
  instead of fetching many pages and filtering by hand.

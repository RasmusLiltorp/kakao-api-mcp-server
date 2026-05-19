---
name: korea-place-finder
description: >-
  Find places, businesses and points of interest in South Korea using the
  korea-travel-mcp tools. Use when the user asks where something is, what is
  near a location, to find nearby cafes / restaurants / pharmacies / stations,
  to look up a business, or to turn an address or coordinate into a place.
---

# Korea place finder

This skill discovers places in South Korea with the `korea-travel-mcp` server,
using the fewest API calls.

## Tools you will use

- `kakao_search_places` — keyword search; resolves a name to address + coordinate.
- `kakao_search_by_category` — every place of one category within a radius of a
  coordinate (cafe, restaurant, pharmacy, bank, subway station, and more).
- `kakao_search_address` — geocode an address string to a coordinate.
- `kakao_coord_to_address` / `kakao_coord_to_region` — describe a coordinate.

## Workflow

1. **Specific place by name** → `kakao_search_places` with the keyword. The
   result includes the address and the `x`/`y` coordinate.

2. **"What is near X"** → first get X's coordinate:
   - X is a named place → `kakao_search_places`, take `x`/`y` from result 1.
   - X is an address → `kakao_search_address`, take `x`/`y`.
   Then call `kakao_search_by_category` with that coordinate, the right
   `category_group_code`, and a radius. Pick the radius to match the request
   ("walking distance" ≈ 500-800m, "in the area" ≈ 1000-2000m).

3. **Bias keyword search to an area** → pass `x`/`y` (and `radius`) to
   `kakao_search_places` so results cluster around that point.

4. **Describe a coordinate** → `kakao_coord_to_address` for the street address,
   `kakao_coord_to_region` for the administrative district.

## Category codes

`kakao_search_by_category` takes one of: MT1 supermarket, CS2 convenience
store, PK6 parking, OL7 gas station, SW8 subway station, BK9 bank, CT1
culture, AG2 real-estate agency, PO3 public institution, AT4 tourist
attraction, AD5 accommodation, FD6 restaurant, CE7 cafe, HP8 hospital, PM9
pharmacy, SC4 school, AC5 academy. If the user wants something outside this
list (a specific chain, a niche shop), use `kakao_search_places` instead.

## Keep API calls low

- The server caches responses, so reuse identical queries verbatim.
- Resolve a location's coordinate once, then reuse it for every nearby search.
- Start at `page` 1; only paginate when the user needs more than the first set.

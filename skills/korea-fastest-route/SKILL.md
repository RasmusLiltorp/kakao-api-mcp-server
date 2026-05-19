---
name: korea-fastest-route
description: >-
  Find the fastest way to travel between two places in South Korea using the
  korea-travel-mcp tools. Use when the user asks how long a trip takes, which
  route is fastest, whether to drive or take transit, or to compare travel
  options between Korean locations (stations, universities, addresses, cities).
---

# Korea fastest-route finder

This skill finds the fastest realistic route between two places in South Korea
using the `korea-travel-mcp` server, while keeping API calls to a minimum.

## Tools you will use

- `kakao_find_route` — car route: distance, duration, taxi fare, tolls, traffic.
- `odsay_find_transit_route` — public-transit routes (bus, subway, train),
  already ranked fastest-first, with fare and transfers.
- `kakao_search_places` — only for disambiguating an unclear place name.

## Workflow

1. **Pass place names straight to the routing tools.** Both `kakao_find_route`
   and `odsay_find_transit_route` accept plain place names and geocode them
   internally. The server caches geocoding, so the same name costs no extra API
   calls on later tools. Do NOT call `kakao_search_places` just to get
   coordinates first.

2. **To find the fastest route, compare modes in parallel.** Call
   `kakao_find_route` (car) and `odsay_find_transit_route` (transit) in the same
   turn. `odsay_find_transit_route` returns several options already sorted
   fastest-first; set `max_results` to 3 to see alternatives.

3. **Pick the winner by total duration.** Compare the car duration against the
   fastest transit option. Note the trade-offs: car has no transfers but is
   traffic-dependent; transit has a fixed fare and avoids parking.

4. **Disambiguate only when needed.** If a routing tool resolves a name to the
   wrong place (visible in the returned origin/destination), call
   `kakao_search_places` to find the right one, then retry with a more specific
   name.

## Reporting

Lead with the fastest option: mode, total time, and fare or taxi estimate.
Then give the runner-up in one line so the user can judge the trade-off.
Mention transfers for transit and traffic for car when relevant.

## Keep API calls low

- Never pre-geocode with `kakao_search_places` when a routing tool can take the
  name directly.
- Reuse place names verbatim across tool calls so the geocoding cache hits.
- Request only as many transit options as you will actually compare.

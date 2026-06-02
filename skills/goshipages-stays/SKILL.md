---
name: goshipages-stays
description: >-
  Find foreigner-friendly Korean stays — goshiwon, goshitel, livingtel,
  share-house, guesthouse — on goshipages.com using the korea-travel-mcp
  goshipages tools. Use when the user (often a foreigner or visitor) wants an
  English-facing place to stay in Korea near a station or area, wants to compare
  monthly or nightly rates in KRW, needs quarantine-friendly or gender-specific
  rooms, or wants the full detail of a specific stay.
---

# Goshipages foreigner stays search (goshipages.com)

This skill finds stays on goshipages.com — a **foreigner-facing**, English-first
Korean stays platform covering goshiwon / goshitel / livingtel / share-house /
guesthouse — using the `korea-travel-mcp` goshipages tools, with the fewest API
calls. All tools are read-only, need no login, and report rates in **KRW**.

## Tools you will use

- `goshipages_search_places` — autocomplete a place / subway / region / area /
  listing name into destination predictions.
- `goshipages_search_listings` — the main search; resolves a `query` (place
  name) or takes a `destn_id`, returns stays around that destination.
- `goshipages_listing_detail` — full detail for one stay by its `slug`.

## Picking a destination (required for search)

A listing search is **anchored to a destination**, not free-form. The easiest
path is to pass a place name straight to `goshipages_search_listings` via
`query` — it autocompletes and resolves the best destination for you. When you
want to confirm or choose among options first, call `goshipages_search_places`
and pass the chosen prediction's name back as `query`.

Prefer subway/region/area predictions as search anchors over individual
`listing` predictions.

## Filtering is client-side

The platform itself filters **only by destination** — it returns every stay
around that point. All other filters are applied locally by the tool over the
returned list:

- `min_monthly_krw` / `max_monthly_krw` — monthly rate bounds in **KRW** (e.g.
  300000), matched against each stay's monthly range.
- `quarantine_ok` — only stays flagged quarantine-friendly.
- `gender` — gender policy lives only in the **detail** page, not the search
  summary, so this filter can't be applied to the summary list. To honour a
  gender request, open candidates with `goshipages_listing_detail` and read the
  decoded gender policy there.

## Rates and units

Rates are reported in KRW. Room sizes in detail are in m². A stay's gender
policy is decoded to plain English (e.g. "Female only", "Mixed (separate
male/female areas)"), as is each room type's gender.

## Workflow

1. **Resolve the destination.** Pass the user's area/station name as `query` to
   `goshipages_search_listings` (it autocompletes). Use
   `goshipages_search_places` first only when you need to disambiguate.
2. **Search with filters** (`max_monthly_krw`, `quarantine_ok`, `limit`). Note
   the destination viewport returned for context.
3. **Drill in** with `goshipages_listing_detail` (use the `slug` from a result)
   when the user wants address, contact phones, languages, amenities, room
   types with sizes/rates, gender policy, or gallery images.

## Reporting

Report in English (this is a foreigner-facing service). Lead with the count and
the top matches: name, monthly / nightly rate in KRW, location, and whether it's
quarantine-friendly. Each result includes its URL
(`https://goshipages.com/<slug>`) — surface it so the user can open the stay.
When the user cares about gender or room specifics, open the detail and report
the decoded gender policy, room types, private bath/shower, and amenities.

## Keep API calls low

- Responses are cached, so reuse identical queries verbatim — resolve a
  destination once, then reuse its `destn_id` across follow-up searches instead
  of re-resolving the same place name.
- Let `goshipages_search_listings` resolve the destination from `query` in one
  step rather than always calling `goshipages_search_places` first.
- Use `limit` to keep result sets small; raise it only when the user needs more.
- Fetch `goshipages_listing_detail` only for stays the user actually wants to
  inspect (or to check gender policy), not for every search result.

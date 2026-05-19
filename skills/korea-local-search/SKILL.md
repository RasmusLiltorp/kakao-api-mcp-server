---
name: korea-local-search
description: >-
  Search Korean-language web, blog, cafe and image content using the
  korea-travel-mcp Daum search tools. Use when the user wants Korean sources,
  local reviews or opinions, neighbourhood or restaurant write-ups, community
  discussion, or images for a Korea-related topic.
---

# Korea local search

This skill searches Korean-language content through the Daum search tools of
the `korea-travel-mcp` server. Daum indexes Korean web content far better than
English search engines, so it is the right choice for Korea-specific topics.

## Tools you will use

- `daum_search_web` — general web documents (encyclopaedic, news, official).
- `daum_search_blog` — personal blog posts: reviews, trip reports, how-tos.
- `daum_search_cafe` — community forum (cafe) posts: questions, local opinion.
- `daum_search_image` — images.

## Picking the right tool

- Facts, definitions, official info → `daum_search_web`.
- First-hand experience, restaurant or neighbourhood reviews, "is X good"
  → `daum_search_blog`.
- Community opinion, questions locals ask, recommendations, housing chatter
  → `daum_search_cafe`.
- Visuals → `daum_search_image`.

When the user wants a rounded picture (for example "what is this
neighbourhood like"), query the blog and cafe tools and combine what they say.

## Parameters

- `sort`: use `recency` for anything time-sensitive (current prices, recent
  openings, this year's reviews); use `accuracy` otherwise.
- `page` / `size`: start at page 1; paginate only if the first page is thin.
- Queries work best in Korean. Translate the user's topic to a natural Korean
  query when they did not supply one.

## Reporting

Summarise findings in the user's language. Quote the source name and date,
and include the URL so the user can read the original. Flag when results are
old or thin rather than overstating confidence.

## Keep API calls low

Responses are cached, so reuse identical queries verbatim. Do not page beyond
what the user actually needs.

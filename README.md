# App Store & Google Play Reviews Scraper + Insights

Scrape **app reviews from the Apple App Store and Google Play in a single run**, in any country, and get a ready-to-use **insight summary per app**. Turn on **monitoring mode** to receive **only new reviews** on every scheduled run.

No login, no API key, no proxies needed.

## Why this Actor?

| | This Actor | Typical review scrapers |
|---|---|---|
| App Store **and** Google Play in one run | ✅ | ❌ one store per Actor |
| Multi-country in one run | ✅ | sometimes |
| Insight summary (rating by version, complaint keywords) | ✅ | ❌ |
| Only NEW reviews since last run (monitoring) | ✅ | ❌ |
| Filter by star rating (e.g. only 1–2★) | ✅ | sometimes |

## Use cases

- **Product & app teams**: track what users complain about after each release (rating by version).
- **Customer support**: get every new 1–2★ review daily and answer fast.
- **Competitor analysis**: compare ratings and complaints of competing apps across countries.
- **ASO & marketing agencies**: monitor client apps and report on sentiment.
- **AI/LLM pipelines**: clean, normalized JSON from both stores, ready for summarization.

## Input example

```json
{
  "apps": [
    "https://apps.apple.com/us/app/id310633997",
    "https://play.google.com/store/apps/details?id=com.whatsapp",
    "com.spotify.music"
  ],
  "countries": ["us", "gb"],
  "language": "en",
  "maxReviewsPerApp": 200,
  "maxRating": 2,
  "includeSummary": true,
  "monitorMode": false
}
```

## Output

One item per review (`type: "review"`), same fields for both stores:

```json
{
  "type": "review",
  "store": "googleplay",
  "appName": "WhatsApp Messenger",
  "appId": "com.whatsapp",
  "country": "us",
  "reviewId": "…",
  "rating": 2,
  "title": null,
  "text": "Since the last update the app crashes when…",
  "author": "…",
  "version": "2.26.24.5",
  "date": "2026-11-20T15:39:37.000Z",
  "thumbsUp": 14,
  "replyText": "Hi, sorry for the trouble…",
  "url": "…"
}
```

Plus one summary per app and country (`type: "summary"`): `avgRatingInSample`, `ratingDistribution`, `negativeShare`, `ratingByVersion`, `topComplaintKeywords`, `topPraiseKeywords`, `storeRating`, `storeRatingCount`, `periodFrom/To`.

## Monitoring mode

Set `monitorMode: true` and create a schedule (daily or weekly). The first run stores a baseline; next runs output **only reviews you haven't received yet**, so you pay only for new reviews.

## Pricing

Pay per event: a small fee per review returned and per app summary. No charge for apps without reviews.

## Notes & limits

- The App Store public feed exposes the **500 most recent reviews per country**. Google Play allows more (up to 5,000 here).
- Data comes from public store pages and feeds. Review authors are shown as published by the stores; use the data in compliance with GDPR and the stores' terms.

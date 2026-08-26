# Portal Analysis Summary

**Date:** 2026-08-25
**Method:** Playwright headless browser with network interception

---

## Ixigo — API-Based (Recommended Primary Source)

**Architecture:** REST API + SSE streaming. Flight data fetched via XHR, not embedded in HTML.

### Flight Search Endpoint (SSE Streaming)

```
GET https://www.ixigo.com/flights/v2/search/stream
```

**Query Parameters:**

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `origin` | str | IATA airport code | `DEL` |
| `destination` | str | IATA airport code | `BOM` |
| `leave` | str | Departure date `DDMMYYYY` | `01092026` |
| `return` | str | Return date `DDMMYYYY` or empty | `` |
| `adults` | int | Adult passengers | `1` |
| `children` | int | Child passengers | `0` |
| `infants` | int | Infant passengers | `0` |
| `class` | str | Cabin: `e`/`b`/`p`/`f` | `e` |
| `airlineFareType` | str | Fare type | `REGULAR` |
| `version` | str | API version | `2.0` |
| `searchSrc` | str | Search source | `Search Form` |

**Response:** `text/event-stream` (SSE). Each `data:` frame contains JSON with `flightJourneys` array.

### Fare Calendar Endpoint (JSON)

```
GET https://www.ixigo.com/outlook/v1/onward/ranged
```

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `departureDate` | str | `DDMMYYYY` | `01092026` |
| `destination` | str | IATA code | `BOM` |
| `fareClass` | str | Cabin class | `e` |
| `origin` | str | IATA code | `DEL` |
| `paxCombinationType` | str | Pax code (100=1 adult) | `100` |
| `refundTypes` | str | Comma-separated | `REFUNDABLE,NON_REFUNDABLE,PARTIALLY_REFUNDABLE` |

**Response:** `application/json` with `data.going.results[]` containing per-airline fares.

### Required Headers

| Header | Value | Notes |
|--------|-------|-------|
| `apikey` | `ixiweb!2$` | Hardcoded client key |
| `clientid` | `ixiweb` | Client identifier |
| `uuid` | `<generated>` | 20-char hex, device identifier |
| `deviceid` | `<same as uuid>` | Same as uuid |
| `ixisrc` | `ixiweb` | Source platform |
| `appversion` | `2` | App version |
| `x-request-webappversion` | `2.78.1` | Web app version |
| `referer` | `<search page URL>` | Must match |

**Auth model:** No login required. `apikey` is static/hardcoded. No Bearer tokens or session cookies needed.

---

## EaseMyTrip — Server-Rendered (Fallback Source)

**Architecture:** Server-side rendered HTML with embedded flight data. AngularJS 1.5.8 binds to data in page. No XHR flight data API found.

### Data Extraction Strategy

Flight data is embedded in the HTML response from:
```
GET https://flight.easemytrip.com/FlightList/Index?seg1={ORIGIN}|{DEST}|{DATE}&ttype=1&ad=1&ch=0&inf=0&cbn=E&nonstop=false
```

**Date format:** `YYYY-MM-DD`

Data is rendered via AngularJS bindings (e.g., `{{GetFltDtl(segInt.FL[0]).AC}}`). The raw HTML contains a JavaScript variable with the full flight listing. Extraction requires either:
1. Parsing the embedded JS/JSON from HTML response
2. Using Playwright to render the page and extract DOM after AngularJS binding

### Encryption (for API calls if needed later)

AES-CBC with CryptoJS. Keys found:
- `encKey = "EMTmVUvDhT9aWsVG"` (general requests)
- `encKeySrch = "hylW@zmEQdG@4Idr"` (search-specific)

### No Auth Required

No Authorization headers, API keys, or session tokens captured. Standard browser cookies only.

---

## IndiGo — Skipped

Heavy Akamai bot protection, React SPA, no stable URL patterns. Deferred to future phase.

---

## Implementation Decisions

1. **Ixigo is primary source** — clean REST API, no auth barriers, SSE streaming for real-time data
2. **EaseMyTrip is fallback** — server-rendered, requires HTML parsing, less reliable for automation
3. **IndiGo deferred** — too complex for initial implementation
4. **Rate limit:** 1 req/sec/domain, exponential backoff on 429/5xx
5. **Token TTL:** 4 hours (Ixigo `apikey` is static, but `uuid`/`deviceid` should rotate periodically)

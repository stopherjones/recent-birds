# Recent Birds

A static page showing bird species recently reported by eBird within 12 km of a fixed point, with one photo per species. Each species name links to its eBird species page.

**Live page:** https://stopherjones.github.io/recent-birds/

## How it works

- A GitHub Action runs daily at 23:00 UTC (`.github/workflows/daily.yml`).
- It calls the eBird API for observations from the last 7 days within 12 km of the configured point (`scripts/fetch-sightings.mjs`).
- It finds one reusable photo per species, using the Wikipedia main photo first and a Wikimedia Commons search as fallback. Only freely licensed images (CC BY, CC BY-SA, CC0, public domain) without no-derivatives or non-commercial terms are used.
- It writes `data/sightings.json` and `data/species-photos.json` and commits them to `main`. GitHub Pages redeploys from `main`.
- The page (`index.html`, `js/app.js`, `css/style.css`) loads those two JSON files when it opens. It doesn't call eBird directly.

Photo credits are hidden by default. Tap the CC button in the bottom-right corner of a photo to show the photographer and licence.

## Repository layout

```
index.html                    page markup
css/style.css                 styles
js/app.js                     rendering, sorting, photo credits, daily data loader
data/sightings.json           generated daily: recent observations
data/species-photos.json      generated daily: one photo and licence per species
scripts/fetch-sightings.mjs   daily job: eBird + photo lookup
.github/workflows/daily.yml   scheduled job
```

## Configuration

Set these as repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `EBIRD_API_KEY` | Your eBird API key |
| `EBIRD_LAT` | Latitude of the centre point |
| `EBIRD_LNG` | Longitude of the centre point |

The centre point is kept in secrets so it isn't published in the repo. The sightings in `data/sightings.json` still show the general area, because eBird includes each record's location.

The search radius (12 km) and window (7 days) are set at the top of `scripts/fetch-sightings.mjs` (`DIST_KM`, `DAYS_BACK`).

## Running it manually

Go to Actions → **Refresh bird sightings** → **Run workflow**. Use this after changing the configuration or to refresh the data straight away.

## "Find birds near me"

The page also has a **Find birds near me** button. It asks the browser for the visitor's location and queries eBird through a Cloudflare Worker, which keeps the API key on the server side. The Worker address is set in the hidden `worker` field in `index.html`. This lookup uses a 12 km radius and makes a live call, so it isn't cached.

The Worker is a pass-through to `api.ebird.org/v2`, and its `EBIRD_API_KEY` variable must hold a valid key.

## Troubleshooting

- **Action fails with `eBird returned 403`:** the `EBIRD_API_KEY` secret is wrong or has been revoked. Re-copy it from your eBird account.
- **Action fails with `Missing EBIRD_API_KEY, EBIRD_LAT or EBIRD_LNG`:** one of the secrets isn't set or has a different name.
- **Page says it could not load the daily sightings:** the workflow hasn't run yet, or `data/sightings.json` is missing. Run the workflow manually.
- **Species show the leaf placeholder:** no freely licensed photo was found. The job retries these species each day.

## Credits

Sightings data from [eBird](https://ebird.org) (Cornell Lab of Ornithology). Photos from Wikipedia and [Wikimedia Commons](https://commons.wikimedia.org), each credited on the page.
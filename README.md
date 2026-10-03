# Svampkoll – mushroom chance in Sweden

Static web app (no build, no API key). Open `index.html` via any static server, e.g. `python3 -m http.server`.

- **Map**: Leaflet + OpenStreetMap; ~48 Swedish towns coloured by mushroom score; slider for -14…+7 days.
- **Weather data**: [Open-Meteo](https://open-meteo.com) forecast API (last 60 days + 14-day forecast, incl. soil temp/moisture, humidity) and ERA5 archive (last 12 months).
- **Location**: "My location" uses the browser Geolocation API (needs HTTPS or localhost, e.g. GitHub Pages).
- **Score** (`score.js`): heuristic from lagged rain, air/soil temperature, humidity, soil moisture, frost penalty and a seasonal curve.

## Weather sources
Open-Meteo (base, soil temp/moisture, 12-month ERA5 history) + MET Norway Nordic 1 km model via Open-Meteo (next ~2.5 days) + SMHI MESAN (current conditions). Any extra source that fails is skipped silently.

## Live group sharing (optional)
1. Create a free project at https://supabase.com (Realtime is on by default).
2. Put the Project URL and the *anon public* key (Settings → API) into `config.js` and push. The anon key is designed to be public.
3. In the app: enter your name and a group code, tap "Join & share my location", and send friends the link (`…/CSvamp/#g=CODE`).

Privacy: opt-in, positions are only relayed while the app is open (nothing is stored), and anyone who knows the group code can see members. Use a hard-to-guess code. Browsers can't send GPS in the background, so keep the app open with the screen on.

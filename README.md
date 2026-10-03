# Svampkoll – mushroom chance in Sweden

Static web app (no build, no API key). Open `index.html` via any static server, e.g. `python3 -m http.server`.

- **Map**: Leaflet + OpenStreetMap; ~48 Swedish towns coloured by mushroom score; slider for -14…+7 days.
- **Weather data**: [Open-Meteo](https://open-meteo.com) forecast API (last 60 days + 14-day forecast, incl. soil temp/moisture, humidity) and ERA5 archive (last 12 months).
- **Location**: "My location" uses the browser Geolocation API (needs HTTPS or localhost, e.g. GitHub Pages).
- **Score** (`score.js`): heuristic from lagged rain, air/soil temperature, humidity, soil moisture, frost penalty and a seasonal curve.

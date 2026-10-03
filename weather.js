// Extra weather sources layered on top of Open-Meteo. Everything here fails soft:
// callers get null and fall back to the base Open-Meteo data.
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const MESAN = "https://opendata-download-metanalys.smhi.se/api/category/mesan2g/version/1/geotype/point";

// Open-Meteo returns "key" for a single model but sometimes "key_<model>"; accept both.
function pickSeries(hourly, key, model) {
  return hourly[key] || hourly[`${key}_${model}`] || null;
}

// MET Norway Nordic 1 km blend (Sweden is covered), ~2.5 days ahead, updated hourly.
async function fetchNordic(lat, lon, getJSON) {
  try {
    const q = new URLSearchParams({
      latitude: lat, longitude: lon, timezone: "Europe/Stockholm", models: "metno_nordic",
      hourly: "temperature_2m,relative_humidity_2m,precipitation", past_days: 1, forecast_days: 3,
    });
    const h = (await getJSON(`${OPEN_METEO}?${q}`)).hourly;
    return {
      time: h.time,
      temperature_2m: pickSeries(h, "temperature_2m", "metno_nordic"),
      relative_humidity_2m: pickSeries(h, "relative_humidity_2m", "metno_nordic"),
      precipitation: pickSeries(h, "precipitation", "metno_nordic"),
    };
  } catch (e) { return null; }
}

// Replace base hourly values with the higher-resolution Nordic ones where both exist.
// Returns the list of fields that were overlaid (empty if nothing matched).
function overlayHourly(base, nordic) {
  if (!nordic || !nordic.time) return [];
  const idx = new Map(base.time.map((t, i) => [t, i]));
  const used = new Set();
  nordic.time.forEach((t, k) => {
    const i = idx.get(t);
    if (i == null) return;
    for (const f of ["temperature_2m", "relative_humidity_2m", "precipitation"]) {
      const v = nordic[f] && nordic[f][k];
      if (v != null) { base[f][i] = v; used.add(f); }
    }
  });
  return [...used];
}

// SMHI MESAN: latest observed-based analysis for a point (~5 km, hourly). Parameter names
// in the response are matched leniently because the API could not be inspected offline.
function parseMesan(json) {
  const ts = json && json.timeSeries && json.timeSeries[0];
  if (!ts || !ts.parameters) return null;
  const get = (...names) => {
    const p = ts.parameters.find((x) => names.includes(x.name));
    return p && p.values && p.values[0] != null && p.values[0] > -999 ? p.values[0] : null;
  };
  return { time: ts.validTime || null, t: get("t"), rh: get("r"), precip1h: get("prec1h") };
}
async function fetchMesanNow(lat, lon, getJSON) {
  try {
    return parseMesan(await getJSON(`${MESAN}/lon/${(+lon).toFixed(4)}/lat/${(+lat).toFixed(4)}/data.json`));
  } catch (e) { return null; }
}

if (typeof module !== "undefined") module.exports = { overlayHourly, parseMesan, pickSeries };

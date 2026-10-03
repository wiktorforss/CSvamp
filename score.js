// Mushroom-chance heuristic. Pure functions, usable in browser and Node.
// Daily input arrays (same length, index = day): dates, tmean, tmin, precip,
// and optionally rh (mean %), soilT (°C), soilM (m³/m³). Missing values = null.

function trap(x, a, b, c, d) {
  // 0 below a, ramps to 1 at b, stays 1 until c, ramps to 0 at d
  if (x == null || isNaN(x)) return null;
  if (x <= a || x >= d) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (d - x) / (d - c);
}

function mean(arr, from, to) {
  let s = 0, n = 0;
  for (let i = Math.max(0, from); i <= to && i < arr.length; i++) {
    if (arr[i] != null && !isNaN(arr[i])) { s += arr[i]; n++; }
  }
  return n ? s / n : null;
}
function sum(arr, from, to) {
  let s = 0, n = 0;
  for (let i = Math.max(0, from); i <= to && i < arr.length; i++) {
    if (arr[i] != null && !isNaN(arr[i])) { s += arr[i]; n++; }
  }
  return n ? s : null;
}
function minOf(arr, from, to) {
  let m = null;
  for (let i = Math.max(0, from); i <= to && i < arr.length; i++) {
    if (arr[i] != null && (m == null || arr[i] < m)) m = arr[i];
  }
  return m;
}

function dayOfYear(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
}

// Returns {score 0-100, factors:[{name,value,unit,s,weight}], frost, season}
function mushroomScore(series, i) {
  const rain14 = sum(series.precip, i - 14, i);
  const rain28 = sum(series.precip, i - 28, i);
  // Lagged rain: fungi fruit 1-3 weeks after a soaking.
  const rain = rain14 != null && rain28 != null ? 0.6 * rain14 + 0.4 * (rain28 / 2) : rain14;
  const t7 = mean(series.tmean, i - 7, i);
  const soil = series.soilT ? mean(series.soilT, i - 5, i) : null;
  const rh = series.rh ? mean(series.rh, i - 7, i) : null;
  const soilM = series.soilM ? mean(series.soilM, i - 5, i) : null;

  const factors = [
    { name: "Rain (last 2–4 wks)", value: rain14, unit: "mm/14d", s: trap(rain, 5, 25, 70, 160), weight: 0.35 },
    { name: "Air temp (7-day mean)", value: t7, unit: "°C", s: trap(t7, 1, 8, 16, 23), weight: 0.25 },
    { name: "Soil temp (6 cm)", value: soil, unit: "°C", s: trap(soil, 2, 7, 14, 20), weight: 0.15 },
    { name: "Humidity (7-day mean)", value: rh, unit: "%", s: trap(rh, 55, 80, 100, 101), weight: 0.1 },
    { name: "Soil moisture", value: soilM, unit: "m³/m³", s: trap(soilM, 0.08, 0.2, 0.4, 0.55), weight: 0.15 },
  ];

  let ln = 0, w = 0;
  for (const f of factors) {
    if (f.s == null) continue;
    ln += f.weight * Math.log(Math.max(f.s, 0.02));
    w += f.weight;
  }
  let base = w ? Math.exp(ln / w) : 0;

  const tmin3 = minOf(series.tmin, i - 3, i);
  let frost = 1;
  if (tmin3 != null) frost = tmin3 < -3 ? 0.35 : tmin3 < 0 ? 0.75 : 1;

  const doy = dayOfYear(series.dates[i]);
  const season = Math.max(0.08, trap(doy, 160, 205, 290, 330));

  return { score: Math.round(100 * base * frost * season), factors, frost, season };
}

function scoreLabel(s) {
  return s < 15 ? "Very low" : s < 35 ? "Low" : s < 55 ? "Moderate" : s < 75 ? "Good" : "Excellent";
}
function scoreColor(s) {
  // red -> yellow -> green
  const h = Math.round((Math.min(100, Math.max(0, s)) / 100) * 120);
  return `hsl(${h} 70% 38%)`;
}

if (typeof module !== "undefined") module.exports = { mushroomScore, trap, scoreLabel, scoreColor, dayOfYear };

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

const TOWNS = [
  ["Malmö", 55.605, 13.0], ["Helsingborg", 56.046, 12.694], ["Lund", 55.704, 13.191],
  ["Kristianstad", 56.029, 14.157], ["Karlskrona", 56.161, 15.586], ["Kalmar", 56.663, 16.357],
  ["Växjö", 56.879, 14.806], ["Halmstad", 56.674, 12.857], ["Jönköping", 57.783, 14.157],
  ["Göteborg", 57.709, 11.975], ["Borås", 57.721, 12.94], ["Visby", 57.634, 18.295],
  ["Linköping", 58.411, 15.621], ["Norrköping", 58.588, 16.193], ["Skövde", 58.39, 13.846],
  ["Trollhättan", 58.284, 12.289], ["Karlstad", 59.379, 13.504], ["Örebro", 59.275, 15.207],
  ["Västerås", 59.61, 16.545], ["Stockholm", 59.329, 18.069], ["Uppsala", 59.858, 17.639],
  ["Eskilstuna", 59.371, 16.51], ["Nyköping", 58.753, 17.007], ["Falun", 60.607, 15.626],
  ["Borlänge", 60.485, 15.437], ["Mora", 61.005, 14.538], ["Gävle", 60.675, 17.141],
  ["Hudiksvall", 61.728, 17.104], ["Sundsvall", 62.391, 17.307], ["Östersund", 63.179, 14.636],
  ["Örnsköldsvik", 63.29, 18.716], ["Umeå", 63.826, 20.263], ["Skellefteå", 64.75, 20.95],
  ["Lycksele", 64.595, 18.675], ["Luleå", 65.584, 22.154], ["Piteå", 65.317, 21.479],
  ["Arvidsjaur", 65.59, 19.17], ["Gällivare", 67.138, 20.653], ["Kiruna", 67.855, 20.225],
  ["Kalix", 65.85, 23.15], ["Älmhult", 56.55, 14.137], ["Sälen", 61.16, 13.26],
  ["Åre", 63.4, 13.08], ["Vilhelmina", 64.62, 16.65], ["Ljusdal", 61.83, 16.09],
  ["Arvika", 59.655, 12.59], ["Ystad", 55.43, 13.82],
];

const $ = (id) => document.getElementById(id);
const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

const map = L.map("map").setView([62, 16], 5);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18, attribution: "© OpenStreetMap contributors",
}).addTo(map);

let townSeries = null;       // [{name, lat, lon, series}]
let townMarkers = [];
let pickMarker = null, meMarker = null, meCircle = null, watchId = null;
let charts = {};

function setStatus(msg) { $("status").textContent = msg || ""; }

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r.json();
}

// ---- Towns (daily data, one multi-location request) ----
async function loadTowns() {
  setStatus("Loading weather for Swedish towns…");
  const q = new URLSearchParams({
    latitude: TOWNS.map((t) => t[1]).join(","),
    longitude: TOWNS.map((t) => t[2]).join(","),
    daily: "temperature_2m_mean,temperature_2m_min,precipitation_sum",
    past_days: 45, forecast_days: 8, timezone: "Europe/Stockholm",
  });
  const data = await getJSON(`${FORECAST}?${q}`);
  const arr = Array.isArray(data) ? data : [data];
  townSeries = arr.map((d, i) => ({
    name: TOWNS[i][0], lat: TOWNS[i][1], lon: TOWNS[i][2],
    series: {
      dates: d.daily.time, tmean: d.daily.temperature_2m_mean,
      tmin: d.daily.temperature_2m_min, precip: d.daily.precipitation_sum,
    },
  }));
  setStatus("");
  drawTowns();
}

function drawTowns() {
  if (!townSeries) return;
  townMarkers.forEach((m) => m.remove());
  const off = +$("day").value;
  $("dayLabel").textContent = off === 0 ? "today" : off > 0 ? `+${off} d (forecast)` : `${off} d`;
  townMarkers = townSeries.map((t) => {
    const i = t.series.dates.indexOf(todayStr) + off;
    if (i < 0 || i >= t.series.dates.length) return null;
    const r = mushroomScore(t.series, i);
    const icon = L.divIcon({
      className: "", iconSize: [26, 26],
      html: `<div class="dot" style="background:${scoreColor(r.score)}">${r.score}</div>`,
    });
    const m = L.marker([t.lat, t.lon], { icon })
      .bindTooltip(`${t.name}: ${scoreLabel(r.score)} (${t.series.dates[i]})`)
      .on("click", () => pick(t.lat, t.lon, t.name))
      .addTo(map);
    return m;
  }).filter(Boolean);
}

// ---- Single point (hourly -> daily, incl. soil + humidity) ----
function hourlyToDaily(h, soilT = "soil_temperature_6cm", soilM = "soil_moisture_3_9cm") {
  const days = {};
  h.time.forEach((t, k) => {
    const d = t.slice(0, 10);
    (days[d] ||= { t: [], p: [], rh: [], st: [], sm: [] });
    const o = days[d];
    o.t.push(h.temperature_2m[k]); o.p.push(h.precipitation[k]);
    o.rh.push(h.relative_humidity_2m[k]);
    o.st.push(h[soilT][k]); o.sm.push(h[soilM][k]);
  });
  const dates = Object.keys(days).sort();
  const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const tot = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
  const mn = (a) => { const v = a.filter((x) => x != null); return v.length ? Math.min(...v) : null; };
  return {
    dates,
    tmean: dates.map((d) => avg(days[d].t)), tmin: dates.map((d) => mn(days[d].t)),
    precip: dates.map((d) => tot(days[d].p)), rh: dates.map((d) => avg(days[d].rh)),
    soilT: dates.map((d) => avg(days[d].st)), soilM: dates.map((d) => avg(days[d].sm)),
  };
}

async function loadPoint(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "Europe/Stockholm",
    hourly: "temperature_2m,relative_humidity_2m,precipitation,soil_temperature_6cm,soil_moisture_3_9cm",
    past_days: 60, forecast_days: 14,
  });
  const [base, nordic] = await Promise.all([getJSON(`${FORECAST}?${q}`), fetchNordic(lat, lon, getJSON)]);
  const overlaid = overlayHourly(base.hourly, nordic);
  const daily = hourlyToDaily(base.hourly);
  daily.sources = overlaid.length ? "Open-Meteo + MET Nordic 1 km" : "Open-Meteo";
  return daily;
}

async function loadYear(lat, lon) {
  const end = new Date(Date.now() - 6 * 864e5), start = new Date(end - 365 * 864e5);
  const f = (d) => d.toISOString().slice(0, 10);
  const q = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "Europe/Stockholm",
    start_date: f(start), end_date: f(end),
    hourly: "temperature_2m,relative_humidity_2m,precipitation,soil_temperature_0_to_7cm,soil_moisture_0_to_7cm",
  });
  const h = (await getJSON(`${ARCHIVE}?${q}`)).hourly;
  return hourlyToDaily(h, "soil_temperature_0_to_7cm", "soil_moisture_0_to_7cm");
}

let selected = null;
async function pick(lat, lon, name) {
  const same = selected && selected.lat === lat && selected.lon === lon;
  selected = { lat, lon, name };
  if (pickMarker) pickMarker.remove();
  pickMarker = L.marker([lat, lon]).addTo(map);
  setStatus("Loading weather for this spot…");
  if (!same) $("detail").hidden = true;
  try {
    const [recent, year, mesan] = await Promise.all([loadPoint(lat, lon), loadYear(lat, lon).catch(() => null), fetchMesanNow(lat, lon, getJSON)]);
    setStatus("");
    showDetail(name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, recent, year, mesan);
  } catch (e) {
    setStatus("Could not load weather: " + e.message);
  }
}

function showDetail(name, recent, year, mesan) {
  $("detail").hidden = false;
  $("placeName").textContent = name;
  const ti = recent.dates.indexOf(todayStr);
  const now = mushroomScore(recent, ti);
  $("scoreNum").textContent = now.score;
  $("scoreNum").style.color = scoreColor(now.score);
  $("scoreLabel").textContent = scoreLabel(now.score) + " chance today";

  const rows = now.factors.filter((f) => f.value != null).map((f) => {
    const v = f.unit === "m³/m³" ? f.value.toFixed(2) : Math.round(f.value * 10) / 10;
    return `<div class="factor">${f.name}: <b>${v} ${f.unit}</b>
      <div class="bar"><i style="width:${Math.round(f.s * 100)}%;background:${scoreColor(f.s * 100)}"></i></div></div>`;
  });
  rows.push(`<div class="factor">Frost penalty: <b>${now.frost === 1 ? "none" : "×" + now.frost}</b> · Season factor: <b>${Math.round(now.season * 100)}%</b></div>`);
  $("factors").innerHTML = rows.join("");

  const rh = (i) => (recent.rh[i] == null ? "–" : Math.round(recent.rh[i]) + "%");
  const rhMean = (a, b) => { const v = recent.rh.slice(a, b + 1).filter((x) => x != null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) + "%" : "–"; };
  $("humidity").innerHTML = `<span>💧 Humidity today <b>${rh(ti)}</b></span><span>Tomorrow <b>${rh(ti + 1)}</b></span><span>Past 7 d avg <b>${rhMean(ti - 7, ti)}</b></span><span>Next 7 d avg <b>${rhMean(ti + 1, ti + 7)}</b></span>`
    + (mesan && (mesan.t != null || mesan.rh != null) ? `<span>SMHI now: <b>${mesan.t != null ? Math.round(mesan.t) + "°C" : ""}${mesan.rh != null ? " · " + Math.round(mesan.rh) + "%" : ""}${mesan.precip1h ? " · " + mesan.precip1h + " mm/h" : ""}</b></span>` : "");
  $("source").textContent = "Data: " + (recent.sources || "Open-Meteo") + (mesan ? " + SMHI MESAN" : "");
  drawChart("chartRecent", recent, 14, recent.dates.length - 1);
  if (year) drawChart("chartYear", year, 0, year.dates.length - 1, true);
}

function drawChart(id, series, from, to, skipFirst30) {
  const idx = [];
  for (let i = from; i <= to; i++) idx.push(i);
  // recent chart: start 60 days back, which is index 0; show everything
  const labels = idx.map((i) => series.dates[i].slice(5));
  const scores = idx.map((i) => (skipFirst30 && i < 28 ? null : mushroomScore(series, i).score));
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), {
    data: {
      labels,
      datasets: [
        { type: "line", label: "Mushroom score", data: scores, borderColor: "#2e7d32", backgroundColor: "#2e7d3233", fill: true, pointRadius: 0, tension: 0.3, yAxisID: "y", order: 1 },
        { type: "bar", label: "Rain mm", data: idx.map((i) => series.precip[i]), backgroundColor: "#4a90d9aa", yAxisID: "y2", order: 2 },
        { type: "line", label: "Humidity %", data: idx.map((i) => series.rh && series.rh[i] != null ? Math.round(series.rh[i]) : null), borderColor: "#00acc1", borderDash: [4, 3], pointRadius: 0, borderWidth: 1.5, yAxisID: "y4", order: 0 },
        { type: "line", label: "Temp °C", data: idx.map((i) => series.tmean[i]), borderColor: "#e57300", pointRadius: 0, borderWidth: 1.5, yAxisID: "y3", order: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { min: 0, max: 100, title: { display: true, text: "score" } },
        y2: { position: "right", min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: "mm" } },
        y3: { display: false },
        y4: { display: false, min: 0, max: 100 },
      },
      plugins: { legend: { labels: { boxWidth: 12 } } },
    },
  });
}

// ---- Map interaction + geolocation ----
map.on("click", (e) => pick(e.latlng.lat, e.latlng.lng));
$("day").addEventListener("input", drawTowns);

function startTracking() {
  if (!navigator.geolocation) return setStatus("Geolocation is not supported by this browser.");
  if (!window.isSecureContext) return setStatus("Location needs HTTPS (or localhost).");
  setStatus("Getting your location…");
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  let first = true;
  watchId = navigator.geolocation.watchPosition((pos) => {
    const ll = [pos.coords.latitude, pos.coords.longitude];
    if (!meMarker) {
      meMarker = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#1976d2", fillOpacity: 1 }).addTo(map);
      meCircle = L.circle(ll, { radius: pos.coords.accuracy, color: "#1976d2", weight: 1, fillOpacity: 0.1 }).addTo(map);
    } else {
      meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(pos.coords.accuracy);
    }
    Share.publish({ lat: ll[0], lon: ll[1], acc: pos.coords.accuracy });
    if (first) { first = false; setStatus(""); map.setView(ll, 10); pick(ll[0], ll[1], "Your location"); }
  }, (err) => setStatus("Location error: " + err.message), { enableHighAccuracy: true, maximumAge: 5000 });
}
$("locate").addEventListener("click", startTracking);
document.addEventListener("svamp:need-location", () => { if (watchId == null) startTracking(); });
Share.init(map);

const REFRESH_MS = 30 * 60 * 1000;
let lastUpdate = 0;
async function refreshAll() {
  $("refresh").disabled = true;
  try {
    await loadTowns();
    if (selected) await pick(selected.lat, selected.lon, selected.name);
    lastUpdate = Date.now();
    $("updated").textContent = "Updated " + new Date(lastUpdate).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    setStatus("Could not refresh: " + e.message + (lastUpdate ? " (showing older data)" : ""));
  } finally { $("refresh").disabled = false; }
}
$("refresh").addEventListener("click", refreshAll);
setInterval(() => { if (!document.hidden) refreshAll(); }, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastUpdate > REFRESH_MS) refreshAll(); });
window.addEventListener("online", refreshAll);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
refreshAll();

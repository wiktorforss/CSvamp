// Live group location sharing over Supabase Realtime (Broadcast + Presence). Nothing is stored.
const SEND_EVERY_MS = 5000, STALE_MS = 120000;

function normalizeCode(s) { return String(s || "").trim().toLowerCase().replace(/[^a-z0-9åäö-]/g, "").slice(0, 32); }
function shouldSend(lastTs, now, every = SEND_EVERY_MS) { return !lastTs || now - lastTs >= every; }
function isStale(ts, now, ttl = STALE_MS) { return now - ts > ttl; }
function colorFor(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 65% 42%)`; }
function haversineKm(a, b) {
  const r = (x) => (x * Math.PI) / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}

const Share = (() => {
  let sb = null, channel = null, wake = null, lastSent = 0, mine = null;
  const myId = Math.random().toString(36).slice(2, 10);
  const members = new Map();   // id -> {name,lat,lon,ts,marker}
  let map = null, el = {};

  function enabled() { return !!(window.SVAMP_CONFIG && SVAMP_CONFIG.SUPABASE_URL && SVAMP_CONFIG.SUPABASE_ANON_KEY && window.supabase); }

  function render() {
    const now = Date.now(), rows = [];
    for (const [id, m] of members) {
      const stale = isStale(m.ts, now);
      if (m.marker) m.marker.getElement()?.style && (m.marker.getElement().style.opacity = stale ? 0.4 : 1);
      const d = mine ? haversineKm(mine, m).toFixed(1) + " km" : "";
      rows.push(`<li><span class="gdot" style="background:${colorFor(id)}">${m.name[0] || "?"}</span>${m.name} <small>${d} · ${stale ? "last seen " + Math.round((now - m.ts) / 60000) + " min ago" : "live"}</small></li>`);
    }
    el.list.innerHTML = rows.join("") || "<li><small>Nobody else here yet. Share the link.</small></li>";
  }

  function upsert(id, p) {
    let m = members.get(id);
    if (!m) {
      m = { name: p.name || "?" };
      m.marker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", iconSize: [28, 28],
        html: `<div class="dot" style="background:${colorFor(id)};width:28px;height:28px;line-height:24px">${(p.name || "?")[0]}</div>` }) })
        .bindTooltip(m.name, { permanent: false }).addTo(map);
      members.set(id, m);
    }
    Object.assign(m, { name: p.name || m.name, lat: p.lat, lon: p.lon, ts: p.ts });
    m.marker.setLatLng([p.lat, p.lon]);
    render();
  }

  async function join(name, code) {
    code = normalizeCode(code); name = (name || "").trim().slice(0, 20);
    if (!code || !name) return setStatus("Enter your name and a group code.");
    leave();
    sb = sb || supabase.createClient(SVAMP_CONFIG.SUPABASE_URL, SVAMP_CONFIG.SUPABASE_ANON_KEY);
    channel = sb.channel(`svamp:${code}`, { config: { broadcast: { self: false }, presence: { key: myId } } });
    channel.on("broadcast", { event: "pos" }, ({ payload }) => payload && payload.id !== myId && upsert(payload.id, payload));
    channel.on("presence", { event: "sync" }, () => {
      const here = new Set(Object.keys(channel.presenceState()));
      for (const [id, m] of members) if (!here.has(id)) { m.marker.remove(); members.delete(id); }
      render();
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ name });
        setStatus(`🟢 Sharing live in group “${code}”`);
        el.join.textContent = "Stop sharing";
        history.replaceState(null, "", `#g=${code}`);
        document.dispatchEvent(new Event("svamp:need-location"));
        try { wake = await navigator.wakeLock?.request("screen"); } catch (e) {}
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setStatus("Could not connect to the group server.");
    });
    el.join.dataset.name = name;
  }

  function leave() {
    if (channel && sb) sb.removeChannel(channel);
    channel = null;
    for (const m of members.values()) m.marker.remove();
    members.clear(); render();
    try { wake && wake.release(); } catch (e) {} wake = null;
    el.join && (el.join.textContent = "Join & share my location");
    setStatus("Not sharing.");
  }

  function setStatus(t) { el.status.textContent = t; }

  // Called by app.js on every GPS fix.
  function publish(pos) {
    mine = { lat: pos.lat, lon: pos.lon };
    if (!channel) return;
    const now = Date.now();
    if (!shouldSend(lastSent, now)) return;
    lastSent = now;
    channel.send({ type: "broadcast", event: "pos", payload: { id: myId, name: el.join.dataset.name, lat: pos.lat, lon: pos.lon, acc: pos.acc, ts: now } });
  }

  function init(leafletMap) {
    map = leafletMap;
    el = { box: document.getElementById("group"), name: document.getElementById("gName"), code: document.getElementById("gCode"),
      join: document.getElementById("gJoin"), status: document.getElementById("gStatus"), list: document.getElementById("gList") };
    if (!enabled()) return;        // sharing is optional; hide the panel when not configured
    el.box.hidden = false;
    const hash = (location.hash.match(/g=([\w-åäö]+)/) || [])[1];
    el.code.value = hash || localStorageGet("svamp.code") || Math.random().toString(36).slice(2, 8);
    el.name.value = localStorageGet("svamp.name") || "";
    el.join.addEventListener("click", () => {
      if (channel) return leave();
      localStorageSet("svamp.name", el.name.value); localStorageSet("svamp.code", el.code.value);
      join(el.name.value, el.code.value);
    });
    setInterval(render, 15000);
    document.addEventListener("visibilitychange", async () => {
      if (!document.hidden && channel && !wake) { try { wake = await navigator.wakeLock?.request("screen"); } catch (e) {} }
    });
  }
  function localStorageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  return { init, publish, leave };
})();

if (typeof module !== "undefined") module.exports = { normalizeCode, shouldSend, isStale, haversineKm, colorFor };

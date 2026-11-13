export function greeting(hour) {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function fullDate(date) {
  const text = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function decode(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(item, name) {
  const match = item.match(new RegExp(`<${name}(\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match ? { attrs: match[1] || "", text: decode(match[2]) } : null;
}

export function parseNews(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const source = tag(item, "source");
    const sourceUrl = source?.attrs.match(/url="([^"]+)"/)?.[1] || "";
    let title = tag(item, "title")?.text || "";
    if (source?.text && title.endsWith(` - ${source.text}`)) title = title.slice(0, -(source.text.length + 3));
    const published = Date.parse(tag(item, "pubDate")?.text || "");
    return { title, link: tag(item, "link")?.text || "", source: source?.text || "", sourceUrl, published: Number.isNaN(published) ? null : published };
  }).filter((a) => a.title && /^https?:/.test(a.link));
}

export function ago(published, now) {
  if (!published) return "";
  const minutes = Math.max(1, Math.round((now - published) / 60000));
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.floor(minutes / 60)} h`;
  const days = Math.floor(minutes / (60 * 24));
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

export function weatherIcon(code, day = true) {
  if (code === 0) return day ? "sun" : "moon";
  if (code <= 2) return day ? "cloud-sun" : "cloud-moon";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "cloud-fog";
  if (code >= 51 && code <= 57) return "cloud-drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "cloud-rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "cloud-snow";
  if (code >= 95) return "cloud-lightning";
  return "cloud";
}

export function weatherLabel(code) {
  if (code === 0) return "Céu limpo";
  if (code <= 2) return "Poucas nuvens";
  if (code === 3) return "Nublado";
  if (code === 45 || code === 48) return "Neblina";
  if (code >= 51 && code <= 57) return "Garoa";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "Chuva";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Neve";
  if (code >= 95) return "Tempestade";
  return "Nublado";
}

export function hourly(forecast, now, count = 12) {
  const times = forecast?.hourly?.time ?? [];
  const start = times.findIndex((t) => Date.parse(t) + 3600000 > now);
  if (start < 0) return [];
  return times.slice(start, start + count).map((t, i) => ({
    hour: new Date(Date.parse(t)).getHours(),
    temp: Math.round(forecast.hourly.temperature_2m[start + i]),
    code: forecast.hourly.weather_code[start + i],
    day: Boolean(forecast.hourly.is_day?.[start + i] ?? 1),
  }));
}

export function shortcuts(pinned, top, max = 10) {
  const seen = new Set();
  const out = [];
  for (const site of [...pinned, ...top]) {
    let key;
    try { key = new URL(site.url).href.replace(/\/$/, ""); } catch { continue; }
    if (!/^https?:/.test(site.url) || seen.has(key)) continue;
    seen.add(key);
    out.push({ url: site.url, title: site.title || new URL(site.url).hostname.replace(/^www\./, ""), pinned: pinned.includes(site) });
    if (out.length >= max) break;
  }
  return out;
}

export function placesUrl(query) {
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=pt&format=json`;
}

export function places(json) {
  return (json?.results ?? []).filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && r.name).map((r) => ({
    name: r.name,
    label: [...new Set([r.name, r.admin1, r.country].filter(Boolean))].join(", "),
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

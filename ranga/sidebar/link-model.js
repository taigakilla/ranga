const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|twclid|_hsenc|_hsmi|mkt_tok|ref_src|si)$/i;

export function cleanUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!/^https?:$/.test(parsed.protocol)) return url;
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING.test(key)) parsed.searchParams.delete(key);
  }
  return parsed.toString().replace(/\?$/, "").replace(/\?#/, "#");
}

export function markdownLink(title, url) {
  const text = (title || url).replace(/([\[\]\\])/g, "\\$1");
  return `[${text}](${cleanUrl(url).replace(/\)/g, "%29")})`;
}

export function droppedText(uriList, text) {
  const url = (uriList || "").split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#"));
  if (url) return { url };
  const query = (text || "").trim().replace(/\s+/g, " ");
  if (/^https?:\/\/\S+$/i.test(query)) return { url: query };
  return query ? { text: query } : null;
}

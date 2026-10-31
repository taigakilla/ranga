const SCOPES = "openid email https://www.googleapis.com/auth/drive.appdata";
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";

let client;

async function google() {
  client ??= fetch(chrome.runtime.getURL("google-client.json")).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const { clientId, clientSecret } = await client;
  if (!clientId || !clientSecret) throw new Error("Este build do Ranga não tem o cliente do Google configurado.");
  return { clientId, clientSecret };
}

export async function configured() {
  return google().then(() => true, () => false);
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function emailOf(idToken) {
  try {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(payload)))).email ?? "";
  } catch {
    return "";
  }
}

async function tokenRequest(params) {
  const { clientId, clientSecret } = await google();
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || `token ${response.status}`), { code: body.error });
  return body;
}

export async function signIn() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const redirect = chrome.identity.getRedirectURL();
  const url = `${AUTH}?${new URLSearchParams({
    client_id: (await google()).clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
  })}`;
  const back = new URL(await chrome.identity.launchWebAuthFlow({ url, interactive: true }));
  const code = back.searchParams.get("code");
  if (!code) throw new Error(back.searchParams.get("error") || "login cancelado");
  const body = await tokenRequest({ code, code_verifier: verifier, redirect_uri: redirect, grant_type: "authorization_code" });
  if (!body.refresh_token) throw new Error("o Google não devolveu o token de renovação");
  await chrome.storage.session.set({ syncToken: { value: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 } });
  return { refresh: body.refresh_token, email: emailOf(body.id_token ?? "") };
}

export async function accessToken(account, fresh = false) {
  if (account.dev) return account.dev.token;
  const { syncToken } = await chrome.storage.session.get("syncToken");
  if (!fresh && syncToken && syncToken.until > Date.now()) return syncToken.value;
  const body = await tokenRequest({ refresh_token: account.refresh, grant_type: "refresh_token" });
  await chrome.storage.session.set({ syncToken: { value: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 } });
  return body.access_token;
}

export async function revoke(account) {
  await chrome.storage.session.remove("syncToken");
  if (account?.refresh) await fetch(`${REVOKE}?${new URLSearchParams({ token: account.refresh })}`, { method: "POST" }).catch(() => {});
}

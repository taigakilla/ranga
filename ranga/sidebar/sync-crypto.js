const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function newVaultKey() {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES));
}

export function newId(bytes = 8) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function recoveryKey(key) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of key) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g).join("-");
}

export function parseRecoveryKey(text) {
  const clean = String(text ?? "").toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (clean.length !== Math.ceil((KEY_BYTES * 8) / 5)) return null;
  const out = new Uint8Array(KEY_BYTES);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const char of clean) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      if (index < KEY_BYTES) out[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return index === KEY_BYTES ? out : null;
}

export function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function importKey(key) {
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(key, name, value) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = encoder.encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(name) }, await importKey(key), data);
  const out = new Uint8Array(IV_BYTES + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), IV_BYTES);
  return out;
}

export async function open(key, name, bytes) {
  const all = new Uint8Array(bytes);
  if (all.length <= IV_BYTES) throw new Error("objeto cifrado curto demais");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: all.slice(0, IV_BYTES), additionalData: encoder.encode(name) },
    await importKey(key),
    all.slice(IV_BYTES),
  );
  return JSON.parse(decoder.decode(plain));
}

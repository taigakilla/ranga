const BOUNDARY = "ranga-sync-boundary";

export function driveStore({ api = "https://www.googleapis.com", token }) {
  let ids = null;

  async function request(path, init = {}, retry = true) {
    const response = await fetch(`${api}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await token(!retry)}` } });
    if (response.status === 401 && retry) return request(path, init, false);
    if (!response.ok && response.status !== 404) throw Object.assign(new Error(`Drive ${response.status}`), { status: response.status });
    return response;
  }

  async function list() {
    const files = [];
    let page = "";
    do {
      const params = new URLSearchParams({ spaces: "appDataFolder", pageSize: "1000", orderBy: "createdTime", fields: "nextPageToken,files(id,name,modifiedTime)" });
      if (page) params.set("pageToken", page);
      const body = await (await request(`/drive/v3/files?${params}`)).json();
      files.push(...(body.files ?? []));
      page = body.nextPageToken ?? "";
    } while (page);
    ids = new Map();
    for (const file of files) if (!ids.has(file.name)) ids.set(file.name, file.id);
    return files.map((f) => ({ name: f.name, modified: Date.parse(f.modifiedTime) || 0 }));
  }

  async function idOf(name) {
    if (!ids) await list();
    return ids.get(name) ?? null;
  }

  async function read(name) {
    const id = await idOf(name);
    if (!id) return null;
    const response = await request(`/drive/v3/files/${id}?alt=media`);
    if (response.status === 404) {
      ids.delete(name);
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async function write(name, bytes) {
    const id = await idOf(name);
    if (id) {
      const response = await request(`/upload/drive/v3/files/${id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/octet-stream" }, body: bytes });
      if (response.status !== 404) return;
      ids.delete(name);
    }
    const head = `--${BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ["appDataFolder"] })}\r\n--${BOUNDARY}\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const body = new Blob([head, bytes, `\r\n--${BOUNDARY}--`]);
    const response = await request("/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${BOUNDARY}` }, body });
    ids.set(name, (await response.json()).id);
  }

  async function remove(name) {
    const id = await idOf(name);
    if (!id) return;
    await request(`/drive/v3/files/${id}`, { method: "DELETE" });
    ids.delete(name);
  }

  return { list, read, write, remove };
}

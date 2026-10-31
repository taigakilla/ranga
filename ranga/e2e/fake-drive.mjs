import http from "node:http";

export function fakeDrive({ token = "fake-token" } = {}) {
  const files = new Map();
  let next = 1;

  function send(res, status, body, type = "application/json") {
    res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  }

  async function bodyOf(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  function multipart(buffer, type) {
    const boundary = /boundary=(.+)$/.exec(type)[1];
    const parts = buffer.toString("latin1").split(`--${boundary}`).slice(1, -1);
    const [meta, data] = parts.map((p) => p.slice(p.indexOf("\r\n\r\n") + 4, -2));
    return { meta: JSON.parse(Buffer.from(meta, "latin1").toString("utf8")), data: Buffer.from(data, "latin1") };
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE" });
      return res.end();
    }
    if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: "unauthorized" });
    const url = new URL(req.url, "http://x");
    const media = /^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (req.method === "GET" && url.pathname === "/drive/v3/files") {
      const list = [...files.values()].sort((a, b) => a.created - b.created).map(({ id, name, modified }) => ({ id, name, modifiedTime: new Date(modified).toISOString() }));
      return send(res, 200, { files: list });
    }
    if (req.method === "POST" && url.pathname === "/upload/drive/v3/files") {
      const { meta, data } = multipart(await bodyOf(req), req.headers["content-type"]);
      const id = `f${next++}`;
      const now = Date.now();
      files.set(id, { id, name: meta.name, data, created: now + next / 1000, modified: now });
      return send(res, 200, { id });
    }
    if (!media || !files.has(media[2])) return send(res, 404, { error: "not found" });
    const file = files.get(media[2]);
    if (req.method === "GET") return send(res, 200, file.data, "application/octet-stream");
    if (req.method === "PATCH") {
      file.data = await bodyOf(req);
      file.modified = Date.now();
      return send(res, 200, { id: file.id });
    }
    if (req.method === "DELETE") {
      files.delete(file.id);
      res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
      return res.end();
    }
    return send(res, 405, {});
  });

  return {
    files,
    listen: (port = 0) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const drive = fakeDrive();
  console.log(await drive.listen(Number(process.argv[2] ?? 0)));
}

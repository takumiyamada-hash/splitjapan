import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const base = normalize(join(ROOT, p));
  if (!base.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  // mirror the host's behaviour: directory index and extensionless clean URLs
  const candidates = p.endsWith("/")
    ? [join(base, "index.html")]
    : [base, base + ".html", join(base, "index.html")];
  for (const file of candidates) {
    try {
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
      return;
    } catch { /* try next */ }
  }
  res.writeHead(404).end("not found");
}).listen(3411, () => console.log("splitjapan on :3411"));

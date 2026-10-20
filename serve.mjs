// serve.mjs — zero-dep static dev server for local testing. Not used in prod.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PORT = process.env.PORT || 5178;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/" || p === "") p = "/index.html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end("no"); }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  } catch { res.writeHead(404); res.end("404"); }
}).listen(PORT, () => console.log(`cholf dev → http://localhost:${PORT}`));

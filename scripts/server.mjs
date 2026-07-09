import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  root,
  collectionPath,
  paperPaths,
  readJson,
  paperSlugs,
  paperRecord,
  fetchPdfBytes,
  defaultCollection,
} from "./lib.mjs";

const cacheDir = path.join(root, ".cache", "papers");
const args = process.argv.slice(2);
const editMode = args.includes("--edit");
const portArg = args.find((arg) => /^\d+$/.test(arg));
const port = Number(portArg || process.env.PORT || 8000);

const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
]);

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

function validSlug(slug) {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

async function paperList() {
  const papers = [];
  for (const slug of await paperSlugs()) {
    papers.push(paperRecord(await readJson(paperPaths(slug).json)));
  }
  return papers;
}

function normalizeCollection(value) {
  if (!value || typeof value !== "object") {
    throw new Error("collection must be an object");
  }
  return {
    title: String(value.title || "").trim() || "Annotated Papers",
    description: String(value.description || "").trim(),
  };
}

async function readCollection() {
  if (!existsSync(collectionPath)) {
    return defaultCollection();
  }
  return normalizeCollection(await readJson(collectionPath));
}

async function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, { "content-type": types.get(ext) || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

async function ensurePdf(slug) {
  return cachePaperPdf(await readJson(paperPaths(slug).json));
}

async function cachePaperPdf(paper) {
  const pdfPath = path.join(cacheDir, `${paper.slug}.pdf`);
  const metaPath = path.join(cacheDir, `${paper.slug}.json`);
  if (existsSync(pdfPath) && existsSync(metaPath)) {
    const meta = await readJson(metaPath);
    if (meta.pdfUrl === paper.pdfUrl) {
      return pdfPath;
    }
  }
  await mkdir(cacheDir, { recursive: true });
  await writeFile(pdfPath, await fetchPdfBytes(paper.pdfUrl));
  await writeFile(metaPath, `${JSON.stringify({ pdfUrl: paper.pdfUrl }, null, 2)}\n`);
  return pdfPath;
}

function normalizePaper(paper, originalSlug = "") {
  if (!paper || typeof paper !== "object") {
    throw new Error("paper must be an object");
  }
  const slug = String(paper.slug || "").trim();
  if (!validSlug(slug)) {
    throw new Error("paper slug must use lowercase letters, numbers, and dashes");
  }
  if (originalSlug && slug !== originalSlug) {
    throw new Error("paper slug cannot be changed after creation");
  }
  const title = String(paper.title || "").trim();
  const pdfUrl = String(paper.pdfUrl || "").trim();
  if (!title) {
    throw new Error("paper title is required");
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(pdfUrl);
  } catch {
    throw new Error("PDF link must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("PDF link must start with http or https");
  }
  return {
    slug,
    title,
    subtitle: String(paper.subtitle || "").trim(),
    author: String(paper.author || "").trim(),
    year: String(paper.year || "").trim(),
    source: String(paper.source || "").trim(),
    intro: String(paper.intro || "").trim(),
    pdfUrl,
  };
}

async function savePaper(paper, originalSlug = "") {
  const normalized = normalizePaper(paper, originalSlug);
  const { dir: paperDir, json: paperPath, notes: notesPath } = paperPaths(normalized.slug);
  if (!originalSlug && existsSync(paperPath)) {
    throw new Error(`${normalized.slug} exists`);
  }
  if (originalSlug && !existsSync(paperPath)) {
    throw new Error(`${originalSlug} does not exist`);
  }
  await cachePaperPdf(normalized);
  await mkdir(paperDir, { recursive: true });
  await writeFile(paperPath, `${JSON.stringify(normalized, null, 2)}\n`);
  if (!existsSync(notesPath)) {
    await writeFile(notesPath, "[]\n");
  }
  return paperRecord(normalized);
}

async function routePaperFile(res, slug, file) {
  if (!validSlug(slug)) {
    return send(res, 400, "invalid paper slug\n");
  }
  if (file === "paper.pdf") {
    return serveFile(res, await ensurePdf(slug));
  }
  const filePath = path.join(paperPaths(slug).dir, file);
  if (!existsSync(filePath)) {
    return send(res, 404, "not found\n");
  }
  return serveFile(res, filePath);
}

function writeJson(res, value) {
  return send(res, 200, `${JSON.stringify(value, null, 2)}\n`, "application/json; charset=utf-8");
}

async function parseJsonBody(req) {
  return JSON.parse(await collectBody(req));
}

async function ensurePaperExists(slug) {
  if (!existsSync(paperPaths(slug).json)) {
    throw new Error(`${slug} does not exist`);
  }
}

async function routeSaveNotes(req, res, slug) {
  if (!validSlug(slug)) {
    return send(res, 400, "invalid paper slug\n");
  }
  await ensurePaperExists(slug);
  const parsed = await parseJsonBody(req);
  if (!Array.isArray(parsed)) {
    return send(res, 400, "notes payload must be an array\n");
  }
  const notes = parsed.map(normalizeNote).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  await writeFile(paperPaths(slug).notes, `${JSON.stringify(notes, null, 2)}\n`);
  return writeJson(res, notes);
}

async function routeSavePaper(req, res) {
  const parsed = await parseJsonBody(req);
  const saved = await savePaper(parsed, String(parsed.originalSlug || "").trim());
  return writeJson(res, saved);
}

function requireEditMode(res) {
  if (editMode) {
    return true;
  }
  send(res, 403, "edit mode is disabled\n");
  return false;
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeNote(note) {
  if (!note || typeof note !== "object") {
    throw new Error("note must be an object");
  }
  const page = Number(note.page);
  const x = Number(note.x);
  const y = Number(note.y);
  const text = String(note.text || "").trimEnd();
  if (!Number.isInteger(page) || page < 1) {
    throw new Error("note page must be a positive integer");
  }
  if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
    throw new Error("note x and y must be normalized numbers");
  }
  if (!text.trim()) {
    throw new Error("note text is required");
  }
  return {
    id: String(note.id || randomUUID()),
    page,
    x,
    y,
    text,
    quote: String(note.quote || ""),
    createdAt: String(note.createdAt || new Date().toISOString()),
    updatedAt: String(note.updatedAt || new Date().toISOString()),
  };
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const route = decodeURIComponent(url.pathname);

  if (req.method === "GET" && route === "/") {
    return serveFile(res, path.join(root, "web", "index.html"));
  }
  if (req.method === "GET" && route === "/reader.html") {
    return serveFile(res, path.join(root, "web", "reader.html"));
  }
  if (req.method === "GET" && route === "/app-config.json") {
    return send(
      res,
      200,
      `${JSON.stringify({
        mode: editMode ? "local edit" : "read only",
        readOnly: !editMode,
      }, null, 2)}\n`,
      "application/json; charset=utf-8",
    );
  }
  if (req.method === "GET" && route === "/papers.json") {
    return writeJson(res, await paperList());
  }
  if (req.method === "GET" && route === "/collection.json") {
    return writeJson(res, await readCollection());
  }
  if (req.method === "GET" && route === "/shared/monospace-web.css") {
    return serveFile(res, path.join(root, "shared", "monospace-web.css"));
  }
  if (
    req.method === "GET"
    && ["/app.css", "/app.js", "/gallery.js", "/lib.js"].includes(route)
  ) {
    return serveFile(res, path.join(root, "web", route.slice(1)));
  }

  const paperMatch = route.match(/^\/papers\/([^/]+)\/(paper\.json|notes\.json|paper\.pdf)$/);
  if (paperMatch) {
    const [, slug, file] = paperMatch;
    return routePaperFile(res, slug, file);
  }

  const notesMatch = route.match(/^\/api\/papers\/([^/]+)\/notes$/);
  if (req.method === "POST" && notesMatch) {
    if (!requireEditMode(res)) {
      return;
    }
    return routeSaveNotes(req, res, notesMatch[1]);
  }

  if (req.method === "POST" && route === "/api/papers") {
    if (!requireEditMode(res)) {
      return;
    }
    return routeSavePaper(req, res);
  }

  if (req.method === "POST" && route === "/api/collection") {
    if (!requireEditMode(res)) {
      return;
    }
    const saved = normalizeCollection(await parseJsonBody(req));
    await writeFile(collectionPath, `${JSON.stringify(saved, null, 2)}\n`);
    return writeJson(res, saved);
  }

  return send(res, 404, "not found\n");
}

createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    send(res, 500, `${error.message}\n`);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`${editMode ? "Edit" : "Read-only"} server: http://127.0.0.1:${port}`);
});

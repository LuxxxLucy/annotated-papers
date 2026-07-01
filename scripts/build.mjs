import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "_site");
const papersDir = path.join(root, "papers");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function copyFileTo(src, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, await readFile(src));
}

async function paperSlugs() {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(papersDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => existsSync(path.join(papersDir, slug, "paper.json")))
    .sort();
}

async function fetchPdf(paper, dest) {
  if (!paper.pdfUrl) {
    throw new Error(`${paper.slug}: paper.json needs pdfUrl`);
  }
  const response = await fetch(paper.pdfUrl);
  if (!response.ok) {
    throw new Error(`${paper.slug}: ${paper.pdfUrl} returned ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(dest, bytes);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await copyFileTo(path.join(root, "web", "index.html"), path.join(outDir, "index.html"));
await copyFileTo(path.join(root, "web", "app.css"), path.join(outDir, "app.css"));
await copyFileTo(path.join(root, "web", "app.js"), path.join(outDir, "app.js"));
await copyFileTo(
  path.join(root, "shared", "monospace-web.css"),
  path.join(outDir, "shared", "monospace-web.css"),
);

const papers = [];
for (const slug of await paperSlugs()) {
  const paperDir = path.join(papersDir, slug);
  const paper = await readJson(path.join(paperDir, "paper.json"));
  if (paper.slug !== slug) {
    throw new Error(`${slug}: paper.json slug must match directory name`);
  }
  const publicPaperDir = path.join(outDir, "papers", slug);
  await mkdir(publicPaperDir, { recursive: true });
  await copyFileTo(path.join(paperDir, "paper.json"), path.join(publicPaperDir, "paper.json"));
  await copyFileTo(path.join(paperDir, "notes.json"), path.join(publicPaperDir, "notes.json"));
  await fetchPdf(paper, path.join(publicPaperDir, "paper.pdf"));
  papers.push({
    ...paper,
    pdfPath: `papers/${slug}/paper.pdf`,
    notesPath: `papers/${slug}/notes.json`,
  });
}

await writeFile(
  path.join(outDir, "papers.json"),
  `${JSON.stringify(papers, null, 2)}\n`,
);
await writeFile(
  path.join(outDir, "app-config.json"),
  `${JSON.stringify({ mode: "published", readOnly: true }, null, 2)}\n`,
);

console.log(`Built ${papers.length} paper(s) into ${outDir}`);

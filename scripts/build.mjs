import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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

const outDir = path.join(root, "_site");

async function copyFileTo(src, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, await readFile(src));
}

async function fetchPdf(paper, dest) {
  if (!paper.pdfUrl) {
    throw new Error(`${paper.slug}: paper.json needs pdfUrl`);
  }
  await writeFile(dest, await fetchPdfBytes(paper.pdfUrl));
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const name of ["index.html", "reader.html", "app.css", "app.js", "gallery.js", "lib.js"]) {
  await copyFileTo(path.join(root, "web", name), path.join(outDir, name));
}
await copyFileTo(
  path.join(root, "shared", "monospace-web.css"),
  path.join(outDir, "shared", "monospace-web.css"),
);

const papers = [];
for (const slug of await paperSlugs()) {
  const { json, notes } = paperPaths(slug);
  const paper = await readJson(json);
  if (paper.slug !== slug) {
    throw new Error(`${slug}: paper.json slug must match directory name`);
  }
  const publicPaperDir = path.join(outDir, "papers", slug);
  await mkdir(publicPaperDir, { recursive: true });
  await copyFileTo(json, path.join(publicPaperDir, "paper.json"));
  await copyFileTo(notes, path.join(publicPaperDir, "notes.json"));
  await fetchPdf(paper, path.join(publicPaperDir, "paper.pdf"));
  papers.push(paperRecord(paper));
}

await writeFile(
  path.join(outDir, "papers.json"),
  `${JSON.stringify(papers, null, 2)}\n`,
);

const collection = existsSync(collectionPath)
  ? await readJson(collectionPath)
  : defaultCollection();
await writeFile(
  path.join(outDir, "collection.json"),
  `${JSON.stringify(collection, null, 2)}\n`,
);
await writeFile(
  path.join(outDir, "app-config.json"),
  `${JSON.stringify({ mode: "published", readOnly: true }, null, 2)}\n`,
);

console.log(`Built ${papers.length} paper(s) into ${outDir}`);

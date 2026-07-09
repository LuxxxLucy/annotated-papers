import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const papersDir = path.join(root, "papers");
export const collectionPath = path.join(root, "collection.json");

export function paperPaths(slug) {
  const dir = path.join(papersDir, slug);
  return {
    dir,
    json: path.join(dir, "paper.json"),
    notes: path.join(dir, "notes.json"),
    pdf: path.join(dir, "paper.pdf"),
  };
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function paperSlugs() {
  const entries = await readdir(papersDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => existsSync(paperPaths(slug).json))
    .sort();
}

export function paperRecord(paper) {
  return {
    ...paper,
    pdfPath: `papers/${paper.slug}/paper.pdf`,
    notesPath: `papers/${paper.slug}/notes.json`,
  };
}

export async function fetchPdfBytes(pdfUrl) {
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`${pdfUrl} returned ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function defaultCollection() {
  return { title: "Annotated Papers", description: "" };
}

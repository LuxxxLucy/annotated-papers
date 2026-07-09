import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
import { escapeHtml, fetchJson, slugify } from "./lib.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

const els = {
  paperTitle: document.querySelector("#paper-title"),
  paperSubtitle: document.querySelector("#paper-subtitle"),
  paperAuthor: document.querySelector("#paper-author"),
  paperYear: document.querySelector("#paper-year"),
  paperYearText: document.querySelector("#paper-year-text"),
  paperUrlToggleLabel: document.querySelector("#paper-url-toggle-label"),
  paperUrlToggle: document.querySelector("#paper-url-toggle"),
  paperUrl: document.querySelector("#paper-url"),
  paperSource: document.querySelector("#paper-source"),
  paperIntro: document.querySelector("#paper-intro"),
  paperSelect: document.querySelector("#paper-select"),
  addNote: document.querySelector("#add-note"),
  saveNotes: document.querySelector("#save-notes"),
  addPaper: document.querySelector("#add-paper"),
  editPaper: document.querySelector("#edit-paper"),
  modeBadge: document.querySelector("#mode-badge"),
  pdfRoot: document.querySelector("#pdf-root"),
  noteCount: document.querySelector("#note-count"),
  noteDialog: document.querySelector("#note-dialog"),
  noteForm: document.querySelector("#note-form"),
  dialogTitle: document.querySelector("#dialog-title"),
  noteText: document.querySelector("#note-text"),
  deleteNote: document.querySelector("#delete-note"),
  paperDialog: document.querySelector("#paper-dialog"),
  paperForm: document.querySelector("#paper-form"),
  paperDialogTitle: document.querySelector("#paper-dialog-title"),
  paperSlug: document.querySelector("#paper-slug"),
  paperTitleInput: document.querySelector("#paper-title-input"),
  paperSubtitleInput: document.querySelector("#paper-subtitle-input"),
  paperAuthorInput: document.querySelector("#paper-author-input"),
  paperYearInput: document.querySelector("#paper-year-input"),
  paperSourceInput: document.querySelector("#paper-source-input"),
  paperIntroInput: document.querySelector("#paper-intro-input"),
  paperPdfUrlInput: document.querySelector("#paper-pdf-url-input"),
};

const state = {
  config: { readOnly: true },
  papers: [],
  paper: null,
  pdf: null,
  notes: [],
  pageViews: new Map(),
  addMode: false,
  editingNote: null,
  editingPaperMode: "new",
  dirty: false,
};

function status(message) {
  els.pdfRoot.innerHTML = `<div class="status">${escapeHtml(message)}</div>`;
}

function setDirty(value) {
  state.dirty = value;
  if (!state.config.readOnly) {
    els.saveNotes.disabled = !value;
  }
}

function renderOptionalText(element, text) {
  const value = String(text || "").trim();
  element.hidden = !value;
  element.textContent = value;
}

function renderIntro(text) {
  const intro = String(text || "").trim();
  els.paperIntro.hidden = !intro;
  els.paperIntro.innerHTML = escapeHtml(intro).replaceAll("\n\n", "</p><p>").replaceAll("\n", "<br>");
  if (intro) {
    els.paperIntro.innerHTML = `<p>${els.paperIntro.innerHTML}</p>`;
  }
}

function renderYearAndUrl(year, url) {
  const yearValue = String(year || "").trim();
  const value = String(url || "").trim();
  els.paperYear.hidden = !yearValue && !value;
  els.paperYearText.textContent = yearValue;
  els.paperUrlToggleLabel.hidden = !value;
  els.paperUrlToggle.hidden = !value;
  els.paperUrlToggle.checked = false;
  els.paperUrl.hidden = !value;
  els.paperUrl.innerHTML = value
    ? `URL: <a href="${escapeHtml(value)}">${escapeHtml(value)}</a>`
    : "";
}

function renderChrome() {
  const paper = state.paper;
  els.paperTitle.textContent = paper ? paper.title : "Annotated Papers";
  renderOptionalText(els.paperSubtitle, paper?.subtitle);
  renderOptionalText(els.paperAuthor, paper?.author);
  renderYearAndUrl(paper?.year, paper?.pdfUrl);
  renderOptionalText(els.paperSource, paper?.source);
  renderIntro(paper?.intro);
  els.paperSelect.innerHTML = state.papers
    .map((item) => `<option value="${escapeHtml(item.slug)}">${escapeHtml(item.title)}</option>`)
    .join("");
  if (paper) {
    els.paperSelect.value = paper.slug;
  }
  els.modeBadge.textContent = state.config.mode || (state.config.readOnly ? "read only" : "local edit");
  els.noteCount.textContent = String(state.notes.length);
  els.addNote.hidden = state.config.readOnly;
  els.saveNotes.hidden = state.config.readOnly;
  els.addPaper.hidden = state.config.readOnly;
  els.editPaper.hidden = state.config.readOnly;
  els.editPaper.disabled = !paper;
  els.addNote.setAttribute("aria-pressed", String(state.addMode));
  els.saveNotes.disabled = state.config.readOnly || !state.dirty;
}

function renderNoteCount() {
  els.noteCount.textContent = String(state.notes.length);
}

function renderPageNotes(pageNumber) {
  const view = state.pageViews.get(pageNumber);
  if (!view) {
    return;
  }
  const notes = state.notes.filter((note) => note.page === pageNumber);
  view.markers.innerHTML = "";
  view.gutter.innerHTML = "";

  for (const note of notes) {
    const noteNumber = state.notes.findIndex((item) => item.id === note.id) + 1;
    const marker = document.createElement("button");
    marker.className = "marker";
    marker.type = "button";
    marker.style.left = `${note.x * 100}%`;
    marker.style.top = `${note.y * 100}%`;
    marker.textContent = String(noteNumber);
    marker.setAttribute("aria-label", `Note ${noteNumber}`);
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.config.readOnly) {
        jumpToNote(note.id);
        return;
      }
      openNoteEditor(note);
    });
    view.markers.append(marker);

    const card = document.createElement("aside");
    card.className = "note-card";
    card.style.top = `${note.y * 100}%`;
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `<strong>${noteNumber}</strong>${escapeHtml(note.text).replaceAll("\n", "<br>")}`;
    button.addEventListener("click", () => {
      if (state.config.readOnly) {
        jumpToNote(note.id);
        return;
      }
      openNoteEditor(note);
    });
    card.append(button);
    view.gutter.append(card);
  }
}

function renderAllNotes() {
  state.notes.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  renderNoteCount();
  for (const pageNumber of state.pageViews.keys()) {
    renderPageNotes(pageNumber);
  }
}

async function renderPage(pageNumber) {
  const page = await state.pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const fullWidth = window.matchMedia("(max-width: 760px)").matches;
  const columnWidth = fullWidth ? els.pdfRoot.clientWidth : els.pdfRoot.clientWidth * 0.55;
  const available = Math.min(760, Math.max(fullWidth ? 220 : 280, columnWidth));
  const scale = Math.max(0.45, Math.min(1.35, available / baseViewport.width));
  const viewport = page.getViewport({ scale });
  const ratio = window.devicePixelRatio || 1;

  const shell = document.createElement("section");
  shell.className = "page-shell";
  shell.id = `page-${pageNumber}`;

  const left = document.createElement("div");
  left.className = "page-left";
  left.textContent = `p${pageNumber}`;

  const pageView = document.createElement("div");
  pageView.className = "page-view";
  pageView.style.setProperty("--page-width", `${viewport.width}px`);
  pageView.style.setProperty("--page-height", `${viewport.height}px`);
  if (!state.config.readOnly) {
    pageView.classList.toggle("adding", state.addMode);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const markers = document.createElement("div");
  markers.className = "marker-layer";

  const gutter = document.createElement("div");
  gutter.className = "page-notes";
  gutter.style.setProperty("--page-height", `${viewport.height}px`);

  pageView.append(canvas, markers);
  shell.append(left, pageView, gutter);
  els.pdfRoot.append(shell);

  state.pageViews.set(pageNumber, { pageView, markers, gutter, viewport });

  pageView.addEventListener("click", (event) => {
    if (state.config.readOnly || !state.addMode) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    openNoteEditor({
      id: crypto.randomUUID(),
      page: pageNumber,
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
      text: "",
      quote: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isNew: true,
    });
  });

  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  await page.render({ canvasContext: context, viewport }).promise;
  renderPageNotes(pageNumber);
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

async function renderPdf() {
  state.pageViews.clear();
  status("Loading PDF");
  state.pdf = await pdfjsLib.getDocument(state.paper.pdfPath).promise;
  els.pdfRoot.innerHTML = "";
  for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
    await renderPage(pageNumber);
  }
  renderAllNotes();
}

async function loadPapers() {
  state.papers = await fetchJson("papers.json");
}

async function loadPaper(slug) {
  state.paper = state.papers.find((paper) => paper.slug === slug);
  if (!state.paper) {
    throw new Error(`Unknown paper: ${slug}`);
  }
  state.notes = await fetchJson(state.paper.notesPath);
  state.addMode = false;
  setDirty(false);
  renderChrome();
  await renderPdf();
}

function openNoteEditor(note) {
  state.editingNote = { ...note };
  els.dialogTitle.textContent = `Page ${note.page}`;
  els.noteText.value = note.text || "";
  els.deleteNote.hidden = Boolean(note.isNew);
  els.noteDialog.showModal();
  els.noteText.focus();
}

function applyNoteEditor() {
  if (!state.editingNote) {
    return;
  }
  const text = els.noteText.value.trimEnd();
  if (!text.trim()) {
    return;
  }
  const updated = {
    ...state.editingNote,
    text,
    updatedAt: new Date().toISOString(),
  };
  delete updated.isNew;
  const index = state.notes.findIndex((note) => note.id === updated.id);
  if (index >= 0) {
    state.notes[index] = updated;
  } else {
    state.notes.push(updated);
  }
  state.editingNote = null;
  setDirty(true);
  renderAllNotes();
}

function deleteEditingNote() {
  if (!state.editingNote) {
    return;
  }
  state.notes = state.notes.filter((note) => note.id !== state.editingNote.id);
  state.editingNote = null;
  els.noteDialog.close();
  setDirty(true);
  renderAllNotes();
}

async function saveNotes() {
  if (state.config.readOnly || !state.paper) {
    return;
  }
  const response = await fetch(`/api/papers/${state.paper.slug}/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.notes),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  state.notes = await response.json();
  setDirty(false);
  renderAllNotes();
}

function jumpToNote(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) {
    return;
  }
  state.pageViews.get(note.page)?.pageView.scrollIntoView({ block: "center", behavior: "smooth" });
}

function fillPaperForm(paper) {
  els.paperSlug.value = paper?.slug || "";
  els.paperTitleInput.value = paper?.title || "";
  els.paperSubtitleInput.value = paper?.subtitle || "";
  els.paperAuthorInput.value = paper?.author || "";
  els.paperYearInput.value = paper?.year || "";
  els.paperSourceInput.value = paper?.source || "";
  els.paperIntroInput.value = paper?.intro || "";
  els.paperPdfUrlInput.value = paper?.pdfUrl || "";
}

function openPaperEditor(mode) {
  state.editingPaperMode = mode;
  const editing = mode === "edit";
  els.paperDialogTitle.textContent = editing ? "Edit Paper" : "Add Paper";
  fillPaperForm(editing ? state.paper : null);
  els.paperSlug.readOnly = editing;
  els.paperDialog.showModal();
  (editing ? els.paperPdfUrlInput : els.paperSlug).focus();
}

async function savePaper() {
  const payload = {
    originalSlug: state.editingPaperMode === "edit" ? state.paper?.slug : "",
    slug: els.paperSlug.value.trim(),
    title: els.paperTitleInput.value.trim(),
    subtitle: els.paperSubtitleInput.value.trim(),
    author: els.paperAuthorInput.value.trim(),
    year: els.paperYearInput.value.trim(),
    source: els.paperSourceInput.value.trim(),
    intro: els.paperIntroInput.value.trim(),
    pdfUrl: els.paperPdfUrlInput.value.trim(),
  };
  const response = await fetch("/api/papers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const saved = await response.json();
  await loadPapers();
  await loadPaper(saved.slug);
}

els.paperSelect.addEventListener("change", () => {
  const slug = els.paperSelect.value;
  const url = new URL(location.href);
  url.searchParams.set("paper", slug);
  history.replaceState(null, "", url);
  loadPaper(slug).catch((error) => status(error.message));
});

els.addNote.addEventListener("click", () => {
  state.addMode = !state.addMode;
  renderChrome();
  for (const view of state.pageViews.values()) {
    view.pageView.classList.toggle("adding", state.addMode);
  }
});

els.saveNotes.addEventListener("click", () => {
  saveNotes().catch((error) => alert(error.message));
});

els.addPaper.addEventListener("click", () => openPaperEditor("new"));
els.editPaper.addEventListener("click", () => openPaperEditor("edit"));

els.paperTitleInput.addEventListener("input", () => {
  if (state.editingPaperMode === "new" && !els.paperSlug.value.trim()) {
    els.paperSlug.value = slugify(els.paperTitleInput.value);
  }
});

els.noteForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") {
    state.editingNote = null;
    return;
  }
  event.preventDefault();
  applyNoteEditor();
  els.noteDialog.close();
});

els.paperForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") {
    return;
  }
  event.preventDefault();
  savePaper()
    .then(() => els.paperDialog.close())
    .catch((error) => alert(error.message));
});

els.deleteNote.addEventListener("click", deleteEditingNote);

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) {
    return;
  }
  event.preventDefault();
});

async function init() {
  state.config = await fetchJson("app-config.json");
  await loadPapers();
  if (!state.papers.length) {
    status("No papers");
    renderChrome();
    return;
  }
  if (state.config.readOnly) {
    els.addNote.remove();
    els.saveNotes.remove();
    els.addPaper.remove();
    els.editPaper.remove();
  }
  renderChrome();
  const requested = new URLSearchParams(location.search).get("paper");
  const slug = state.papers.some((paper) => paper.slug === requested)
    ? requested
    : state.papers[0].slug;
  await loadPaper(slug);
}

init().catch((error) => status(error.message));

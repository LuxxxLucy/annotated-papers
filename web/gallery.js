import { escapeHtml, fetchJson, slugify } from "./lib.js";

const els = {
  toolbar: document.querySelector("#gallery-toolbar"),
  title: document.querySelector("#collection-title"),
  desc: document.querySelector("#collection-desc"),
  list: document.querySelector("#gallery-list"),
  status: document.querySelector("#gallery-status"),
  addPaper: document.querySelector("#add-paper"),
  editCollection: document.querySelector("#edit-collection"),
  paperDialog: document.querySelector("#paper-dialog"),
  paperForm: document.querySelector("#paper-form"),
  paperSlug: document.querySelector("#paper-slug"),
  paperTitleInput: document.querySelector("#paper-title-input"),
  paperSubtitleInput: document.querySelector("#paper-subtitle-input"),
  paperAuthorInput: document.querySelector("#paper-author-input"),
  paperYearInput: document.querySelector("#paper-year-input"),
  paperSourceInput: document.querySelector("#paper-source-input"),
  paperIntroInput: document.querySelector("#paper-intro-input"),
  paperPdfUrlInput: document.querySelector("#paper-pdf-url-input"),
  collectionDialog: document.querySelector("#collection-dialog"),
  collectionForm: document.querySelector("#collection-form"),
  collectionTitleInput: document.querySelector("#collection-title-input"),
  collectionDescInput: document.querySelector("#collection-desc-input"),
};

const state = {
  readOnly: true,
  collection: { title: "Annotated Papers", description: "" },
};

function showStatus(message) {
  els.status.hidden = false;
  els.status.textContent = message;
}

function renderCollection() {
  els.title.textContent = state.collection.title || "Annotated Papers";
  els.desc.textContent = state.collection.description || "";
  els.desc.hidden = !state.collection.description;
}

function renderList(papers) {
  if (!papers.length) {
    els.list.innerHTML = "";
    showStatus("No papers yet.");
    return;
  }
  els.status.hidden = true;
  els.list.innerHTML = papers
    .map((paper) => {
      const meta = [paper.author, paper.year].filter(Boolean).map(escapeHtml).join(", ");
      return `<li class="gallery-item"><a href="reader.html?paper=${encodeURIComponent(paper.slug)}">`
        + `<span class="gallery-item-title">${escapeHtml(paper.title)}</span>`
        + (meta ? `<span class="gallery-item-meta">${meta}</span>` : "")
        + `</a></li>`;
    })
    .join("");
}

async function refreshList() {
  renderList(await fetchJson("papers.json"));
}

function openPaperEditor() {
  els.paperForm.reset();
  els.paperDialog.showModal();
  els.paperTitleInput.focus();
}

async function savePaper() {
  const payload = {
    originalSlug: "",
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
  await response.json();
  await refreshList();
}

function openCollectionEditor() {
  els.collectionTitleInput.value = state.collection.title || "";
  els.collectionDescInput.value = state.collection.description || "";
  els.collectionDialog.showModal();
  els.collectionDescInput.focus();
}

async function saveCollection() {
  const payload = {
    title: els.collectionTitleInput.value.trim(),
    description: els.collectionDescInput.value.trim(),
  };
  const response = await fetch("/api/collection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  state.collection = await response.json();
  renderCollection();
}

els.paperTitleInput.addEventListener("input", () => {
  if (!els.paperSlug.value.trim()) {
    els.paperSlug.value = slugify(els.paperTitleInput.value);
  }
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

els.collectionForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") {
    return;
  }
  event.preventDefault();
  saveCollection()
    .then(() => els.collectionDialog.close())
    .catch((error) => alert(error.message));
});

els.addPaper.addEventListener("click", openPaperEditor);
els.editCollection.addEventListener("click", openCollectionEditor);

async function init() {
  try {
    const config = await fetchJson("app-config.json");
    state.readOnly = Boolean(config.readOnly);
  } catch {
    state.readOnly = true;
  }
  try {
    state.collection = await fetchJson("collection.json");
  } catch {
    // keep default collection
  }
  renderCollection();
  els.toolbar.hidden = state.readOnly;
  try {
    await refreshList();
  } catch (error) {
    showStatus(error.message);
  }
}

init();

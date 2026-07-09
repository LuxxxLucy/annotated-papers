# annotated-papers

## Edit

Run a read-only local preview:

```sh
./build.sh serve
```

Run the local editor:

```sh
./build.sh serve --edit
```

Edit mode enables `Add note`, `Save`, `Add paper`, and `Edit paper`.
It writes `notes.json` and `paper.json` into `papers/<slug>/`.
## Data

Each paper lives under `papers/<slug>/`.
`paper.json` stores the title, source fields, intro text, and PDF link.
`notes.json` stores margin notes as page plus normalized page coordinates.

```json
{
  "id": "uuid",
  "page": 3,
  "x": 0.42,
  "y": 0.67,
  "text": "Margin note text.",
  "quote": "",
  "createdAt": "2026-07-01T00:00:00.000Z",
  "updatedAt": "2026-07-01T00:00:00.000Z"
}
```

PDF files are not tracked.
The build and local preview fetch each PDF from `paper.json` and serve it as a same-origin file for PDF.js.

## Pages

`index.html` is the gallery: it lists every paper and links to the reader.
`reader.html?paper=<slug>` opens one paper in the annotated viewer.
The reader's paper dropdown keeps `?paper=` in sync, so any paper has a shareable URL.

`collection.json` holds the gallery title and description.
In edit mode (`./build.sh serve --edit`) the gallery shows `Add paper` and `Edit collection`; both write to disk.
The published site renders the gallery read-only.

## Build

Build the read-only site:

```sh
./build.sh
```

The build writes `_site/`.
GitHub Pages runs the same command on pushes to `main`.

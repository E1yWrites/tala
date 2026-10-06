# 0001 — Pages own their text and Ink

One Note kind; each Page holds its own Tiptap text and its own Ink. Existing single-document text moves to page 1 (page 1's id equals the note id, so Ink needs no rewrite).

**Why:** today one Tiptap doc belongs to the whole Note and only Ink is per Page, so every non-PDF page shows the same typed text. Students expect each sheet to be its own sheet.

**Rejected:** a Notebook/Document split (two kinds of thing to explain and migrate); shared text across pages (the current bug).

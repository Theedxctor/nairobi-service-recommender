# Academic document formatting report

Source: `164003_Dr.Deperias_documentation_draft.docx`

Deliverable: `164003_Dr.Deperias_documentation_formatted.docx`

Preview: `164003_Dr.Deperias_documentation_formatted_preview.pdf`

## Completed and functional

- Times New Roman 12 pt specified, justified body paragraphs, 1.5 body line spacing, consistent spacing and one-inch margins on the existing Letter paper size. Image paragraphs use single spacing so large drawings and captions stay together. Bibliography paragraphs use hanging indents.
- Native Heading 1, Heading 2 and Heading 3 styles with multilevel numbering. Chapter headings use `1 Introduction`, `2 Literature Review`, etc., for reliable numeric cross-references in both Word and LibreOffice. Previously omitted Background, Gaps in the Existing Applications, and Conceptual Framework headings are included.
- One field-based Table of Contents, one List of Figures, and one List of Tables, with clickable bookmark links and 156 native PAGEREF fields in their cached entries.
- 30 figure captions and 21 table captions using native SEQ fields. Existing captions were converted rather than duplicated; a caption was added for the appendix time schedule. Figure numbering is chapter-based, with A1/A2 prefixes in the appendices. Caption numbers reset explicitly at each chapter/appendix boundary.
- 103 identified typed numeric cross-references converted to REF fields; caption chapter prefixes also use REF fields. All generated field targets and list hyperlink targets resolve to existing bookmarks.
- Unnumbered cover, lower-case Roman preliminary numbering starting at i, and Arabic numbering restarting at 1 at the first chapter.
- All 30 image placements and 21 tables retained. All 29 embedded media payloads are byte-identical to the source. Image aspect ratios are retained; floating diagrams were placed inline and scaled to fit the page where necessary.
- No unmatched original substantive paragraphs in the preservation check. Bibliography text was preserved. The only text changes detected inside tables were two figure references updated to their new numbers.
- The original file was not overwritten; its SHA-256 matches the pre-edit checksum.

## Validation and field refresh

KitchenSink4Word MCP was used for inspection, copying, formatting operations, generated-list insertion, validation, and structural diagnosis. Targeted OOXML repairs supplemented the MCP operations for numbering, bulk cross-reference conversion, bookmark portability and layout preservation.

KitchenSink4Word checks passed: core, captions, cross_references and reference_fields. Its deeper `diagnose_document` report returned `healthy: true` with no problems. No Microsoft Word COM automation was used or assumed.

Fields and all three indexes were refreshed using LibreOffice 25.8.2.2. After correcting LibreOffice-exported list links and adding explicit PAGEREF fields, the final saved DOCX was rendered again without overwriting it. All 156 list page references matched the engine's measured bookmark pages; there were zero mismatches. The final PDF contains 94 pages: the cover, i–ix, and 1–84. Sample figure and table pages were visually checked.

Detailed records are in `formatting_work/kitchensink_validation.json`, `preservation_report.json` and `pagination_validation.json`.

## Refresh requirements and limitations

- The delivered lists and fields have populated results; an initial refresh is not needed to see their entries. Refresh all fields/indexes after subsequent content, numbering, font or layout changes. This is especially important if captions are inserted before an existing sequence-reset caption or moved between chapters.
- Times New Roman is not installed on this Ubuntu machine. The DOCX specifies it, but the local preview uses Liberation Serif. Pagination was verified for this LibreOffice rendering only; refresh and check pagination on a machine with Times New Roman before submission.
- LibreOffice can rewrite Word-generated list links when regenerating and saving them. The delivered DOCX has repaired portable bookmark links and native Word field codes. Recheck links after a future LibreOffice round-trip.
- The source refers to Chapter 6, but contains only Chapters 1–5. That reference remains unchanged and is intentionally not linked to a nonexistent target. No missing chapter content was invented.
- Existing author–year citations and bibliography remain plain text, as in the source. They were preserved rather than converted to a citation-manager database or fact-checked.
- Structural validation and LibreOffice rendering passed; opening and refreshing in Microsoft Word itself was not tested.

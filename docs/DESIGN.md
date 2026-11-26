# Design Contract — WorkCheck Kachchh

- **Visual Surface**: Light slate canvas (`#E7E9F3` / `#F3F4F9`), elevated solid white cards (`#FFFFFF`), 1px structural hairline borders (`var(--line)`), semantic status pills (`action` `#E5484D`, `due` `#F5A524`, `watch`/`indigo` `#4656E6`, `clear` `#12A0A4`/`#34C48B`).
- **Typography**: Self-hosted `Plus Jakarta Sans` (`assets/fonts/jakarta.woff2`), tabular numerals for KPI counters and exposure tables.
- **Accessibility & Responsiveness**:
  - WCAG 2.1 AA contrast, visible `:focus` skip-to-content link, Escape-dismissible modal focus restoration, `role="tablist"` + arrow-key navigation across segmented controls.
  - Responsive breakpoint at `<=760px`: bottom mobile nav bar, single-column stacking for `.wk-part-row` and `.map-body`, `>=44px` touch targets, `overflow-x: clip` zero horizontal scroll.

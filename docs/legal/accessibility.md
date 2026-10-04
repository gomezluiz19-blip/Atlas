# Accessibility

{{COMPANY}} wants {{PRODUCT}} to be usable by everyone, including people who use screen readers, keyboards,
magnification or voice control. Our target is the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA,
which is also the technical standard for Section 508 in US federal procurement and for the US Department of
Justice's 2024 rule for state and local government websites.

## What we do

- Automated checks with axe-core against WCAG 2.0 and 2.1 A and AA on the main screens and every screen of the
  Pro tools (Education Pro, Construction Pro, City Ops), as part of release testing.
- Controls are real buttons and form fields with accessible names; tabs announce which is selected; status
  messages are announced.
- Text and filled buttons meet AA contrast in light and dark modes; layouts work from phone widths up and with
  text enlarged.
- Keyboard: 1–9 switch themes, / searches, + and − zoom, Esc closes.
- People who've asked their device for less motion get shorter animations.
- Every map view also has a list or table of the same information, so nothing is available only as a picture.

## Known limitations

- **The 3D globe itself** is a visual canvas. What it shows is also available as lists, tables and text in the
  side panel (sites, facilities, schools, incidents, 311 requests), but some purely visual exploration (spinning
  the Earth, looking at terrain) has no complete non-visual equivalent.
- **Drawing on the map** (outlining a field, paddock or area) needs a pointer; typed coordinates are a partial
  alternative.
- **Third-party content** (imagery, external links, data portals) is outside our control.
- Automated testing finds only part of what matters; a full manual audit with assistive technology users is
  planned before our first government contract, and we'll publish an Accessibility Conformance Report (VPAT)
  then.

Last automated check: every screen of the Pro tools and the home screen, with no WCAG A or AA violations found.

## Feedback

If something is hard to use, tell us at {{CONTACT_EMAIL}} and we'll respond within 5 business days and offer the
information another way while we fix it.

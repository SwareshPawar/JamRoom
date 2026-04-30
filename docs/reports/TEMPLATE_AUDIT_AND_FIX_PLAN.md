# Email and PDF Template Audit

Date: 2026-05-01

## Scope

This audit covers the current email and PDF template surface in JamRoom, including:

- Server-side email sending and HTML email builders
- Server-side PDF generation for invoices and quotations
- Browser-side PDF generation and fallback templates
- Test and preview files related to PDF generation

The goal is to identify the current template inventory, highlight maintainability and reliability issues, and propose a practical fix plan.

## Template Inventory

### Core delivery infrastructure

- `utils/email.js`
  Purpose: central Nodemailer transport and send wrapper.
  Notes: appends a JamRoom site link to outgoing HTML/text automatically.

- `utils/billGenerator.js`
  Purpose: server-side PDF orchestration for invoices and quotations using Puppeteer.
  Notes: contains `generateBill`, `generateBillForDownload`, `generateBillForDownloadWithFilename`, and quotation PDF generation.

### Server-side PDF templates

- `utils/pdfHTMLTemplate.js`
  Purpose: canonical server invoice HTML template used by Puppeteer.
  Current state: quotation-style redesign applied; payment block included.

- `utils/billGenerator.js`
  Purpose: contains `generateQuotationHTML` for quotation PDF markup.
  Current state: separate standalone quotation template with its own presentation helpers.

### Browser-side PDF templates

- `public/js/pdfHTMLTemplate.js`
  Purpose: browser-compatible invoice HTML template intended to mirror the server invoice PDF.
  Current state: updated to match the redesigned server invoice template.

- `public/js/client-pdf-generator.js`
  Purpose: client-side PDF generation using `html2pdf`.
  Current state: contains both the new unified-template path and a second legacy invoice generator path.

- `public/test-pdf-working.html`
  Purpose: manual test harness for client-side PDF generation with mock data.
  Current state: still describes the old invoice styling and old assumptions in parts of the page copy.

### Server-side email templates

- `routes/admin.routes.js`
  Purpose: contains the most important branded email builders.
  Notable templates:
  - eBill invoice email for `POST /api/admin/bookings/:id/send-ebill`
  - quotation email builder near quotation send flow
  - multiple additional inline administrative emails spread through the file

- `routes/booking.routes.js`
  Purpose: booking request lifecycle emails.
  Notable templates:
  - booking request received email to customer
  - new booking request email to admins
  - additional booking lifecycle emails elsewhere in the file

- `routes/auth.routes.js`
  Purpose: authentication-related emails.
  Notable templates:
  - welcome email on registration
  - password reset email

### Frontend integration surfaces

- `public/admin.html`
  Purpose: quotation form UI and eBill send UI.
  Notes: not a template file itself, but it drives quotation and invoice sending flows.

- `public/booking.html`
  Purpose: customer booking UI.
  Notes: loads `client-pdf-generator.js`, so client PDF code remains part of the public runtime surface.

## Main Findings

### 1. Too many template sources for invoices

Current invoice rendering exists in three places:

- `utils/pdfHTMLTemplate.js`
- `public/js/pdfHTMLTemplate.js`
- `public/js/client-pdf-generator.js`

Issue:

- The first two are intended mirrors.
- The third still contains a full legacy invoice HTML generator plus a duplicate `generatePDFClient` definition.
- This creates drift risk and makes future invoice changes easy to miss in one code path.

Impact:

- High maintainability risk
- High regression risk for client-side downloads
- Confusing ownership of the invoice template

### 2. `public/js/client-pdf-generator.js` contains duplicate runtime logic

Observed problems:

- `generatePDFClient` is defined once near the top and again near the bottom.
- `generateBillHTML` still exists as a large legacy invoice renderer even though the file already loads `js/pdfHTMLTemplate.js` and uses `generateUnifiedPDFHTML`.

Impact:

- Function redefinition makes behavior order-dependent.
- A future edit may update only one of the two implementations.
- This file is currently the highest-risk PDF-related file in the repo.

Recommended priority: immediate.

### 3. Email HTML is heavily embedded inline inside route handlers

Observed in:

- `routes/admin.routes.js`
- `routes/booking.routes.js`
- `routes/auth.routes.js`

Issue:

- Long HTML template strings live directly inside business logic.
- Route files now mix validation, persistence, email composition, PDF logic, and delivery concerns.
- Even good templates become difficult to review because the surrounding file is very large.

Impact:

- Harder debugging
- Harder reuse of consistent branding
- Higher chance of breaking logic when editing layout

### 4. Email styling quality is inconsistent across flows

Current quality split:

- eBill email: polished, branded, responsive, card-based
- quotation email: polished, branded, responsive
- auth emails: very basic
- booking request emails: mostly basic unordered-list HTML

Issue:

- Customer-facing communication is inconsistent depending on which flow triggered the email.
- Some emails look production-ready while others still feel transactional and unstyled.

Impact:

- Inconsistent brand perception
- More support friction if users trust some emails less than others

### 5. Escaping and HTML-safety are not standardized

Observed pattern:

- Template strings interpolate values like `booking.userName`, `booking.paymentNote`, `settings.studioAddress`, and quote notes directly into HTML.
- Some frontend contexts use `escapeHtml`, but the server template builders do not appear to use a central escape helper.

Issue:

- Even trusted admin/user input can break layout if it contains unexpected HTML characters.
- Rich strings like notes, addresses, or free-text references are especially risky.

Impact:

- Medium reliability risk
- Medium security-hardening gap

### 6. Formatting rules are duplicated across templates

Examples:

- Currency formatting is implemented in more than one style.
- Time formatting exists in multiple files.
- GST and adjustment display logic is duplicated between server and browser variants.

Issue:

- Repeated formatting logic creates subtle differences between email, PDF, and browser preview output.

Impact:

- Medium correctness risk
- Higher effort for future pricing changes

### 7. `utils/email.js` mutates outgoing HTML globally

Observed behavior:

- If outgoing HTML does not already include the site URL, `utils/email.js` appends a site-link block before `</body>` or at the end.

Issue:

- This is convenient, but it is implicit behavior.
- Template authors may not realize the final email differs from the HTML they wrote.
- It can also produce layout inconsistencies if a template already has a carefully balanced footer.

Impact:

- Medium maintainability issue
- Low-to-medium layout predictability issue

### 8. PDF generation reliability is better, but orchestration is still complex

Observed in `utils/billGenerator.js`:

- repeated browser-launch logic
- serverless-specific database reconnects inside PDF generation path
- retry handling only in some functions

Issue:

- The file mixes template selection, database connection handling, Puppeteer config, retry behavior, and naming.
- It works, but it is a lot of responsibility in one module.

Impact:

- Medium operational risk
- Harder to reason about production PDF failures quickly

### 9. Test coverage is mostly manual

Current situation:

- manual verification was needed for recent invoice PDF and email changes
- `public/test-pdf-working.html` provides a manual path only
- there is no visible snapshot or structural validation for email/PDF HTML builders

Issue:

- Template regressions are discovered after sending emails or generating real PDFs.

Impact:

- High regression risk for visual/template work

## File-by-File Notes

### `utils/email.js`

Strengths:

- single send abstraction
- simple bulk-send helper

Issues:

- implicit HTML/footer mutation
- no central HTML escaping helpers exposed for template builders
- no template registry or named-template rendering layer

### `utils/billGenerator.js`

Strengths:

- good serverless awareness
- retry logic for transient Puppeteer failures
- quotation presentation helpers are more structured than most email code

Issues:

- invoice and quotation generation responsibilities share one large utility
- connection setup and Puppeteer setup are intertwined with rendering flow
- would benefit from smaller dedicated modules

### `utils/pdfHTMLTemplate.js`

Strengths:

- now has a stronger invoice visual design
- pricing and payment display are clearer

Issues:

- still duplicates browser-side invoice template logic conceptually
- formatting helpers are local rather than shared with email renderers

### `public/js/pdfHTMLTemplate.js`

Strengths:

- browser version now mirrors server invoice better

Issues:

- still requires manual sync with server file
- drift will happen again unless these two files are generated from the same source or backed by tests

### `public/js/client-pdf-generator.js`

Strengths:

- provides browser fallback generation

Issues:

- duplicate `generatePDFClient`
- legacy `generateBillHTML` remains in active runtime file
- mixed old and new approaches in one file

This is the clearest concrete cleanup candidate in the audit.

### `routes/admin.routes.js`

Strengths:

- eBill and quotation emails are currently the strongest branded templates in the repo

Issues:

- template strings are too large for a route file
- invoice email still displays booking status even though billing flow treats confirmation as assumed state
- file is carrying too much presentation responsibility

### `routes/booking.routes.js`

Strengths:

- sends useful booking lifecycle information

Issues:

- customer and admin emails are structurally basic
- visual design does not match invoice/quotation emails
- content rendering is inline and repetitive

### `routes/auth.routes.js`

Strengths:

- minimal and functional

Issues:

- welcome/reset emails are extremely basic compared to the rest of the product
- no consistent JamRoom brand wrapper

### `public/test-pdf-working.html`

Strengths:

- useful for manual validation

Issues:

- content appears to describe the older invoice style in places
- should be updated or replaced with a more formal preview/test harness

## Recommended Fix Plan

### Phase 1: Stabilize and simplify invoice PDF rendering

Priority: high

Actions:

1. Remove the legacy invoice renderer from `public/js/client-pdf-generator.js`.
2. Keep only one `generatePDFClient` definition.
3. Make `public/js/client-pdf-generator.js` depend only on `generateUnifiedPDFHTML` from `public/js/pdfHTMLTemplate.js`.
4. Add one small runtime assertion that `.sheet` or the expected root element exists before generating the PDF.

Expected outcome:

- one browser PDF path
- far lower drift risk
- easier debugging

### Phase 2: Extract email templates out of route files

Priority: high

Actions:

1. Create a dedicated template layer, for example:
   - `utils/templates/email/invoiceEmail.js`
   - `utils/templates/email/quotationEmail.js`
   - `utils/templates/email/bookingEmails.js`
   - `utils/templates/email/authEmails.js`
2. Move HTML builders out of `routes/admin.routes.js`, `routes/booking.routes.js`, and `routes/auth.routes.js`.
3. Keep route handlers responsible only for data preparation and delivery.

Expected outcome:

- smaller route files
- easier review of template-only changes
- better branding consistency

### Phase 3: Introduce shared formatting and escaping helpers

Priority: high

Actions:

1. Add a shared server-safe helper module for:
   - HTML escaping
   - currency formatting
   - time formatting
   - newline-to-`<br>` conversion where needed
2. Use those helpers across email and PDF builders.

Expected outcome:

- safer interpolation
- consistent output across invoice, quotation, and booking emails

### Phase 4: Standardize customer-facing email design

Priority: medium

Actions:

1. Create a base email shell with shared header, footer, spacing, and typography.
2. Apply it to:
   - welcome email
   - password reset email
   - booking request received email
   - admin booking notification email where appropriate
3. Keep content tone different per use case, but make structure consistent.

Expected outcome:

- stronger brand consistency
- improved trust and readability across all customer emails

### Phase 5: Reduce hidden side effects in `utils/email.js`

Priority: medium

Actions:

1. Replace automatic site-link injection with an explicit opt-in footer helper.
2. Let templates decide whether to include the site block.
3. Keep `sendEmail` focused on transport concerns.

Expected outcome:

- more predictable final HTML
- easier template debugging

### Phase 6: Add template validation and preview tooling

Priority: medium

Actions:

1. Add lightweight render tests for key templates.
2. Add snapshot-style checks for:
   - invoice email HTML
   - quotation email HTML
   - invoice PDF HTML
   - quotation PDF HTML
3. Add a small preview script or dev route for local inspection.

Expected outcome:

- faster validation for future UI/template changes
- fewer production regressions

## Suggested Execution Order

If this work is picked up as implementation, the most pragmatic order is:

1. Clean `public/js/client-pdf-generator.js`
2. Extract invoice and quotation email builders from `routes/admin.routes.js`
3. Add shared formatting and escaping helpers
4. Standardize auth and booking emails under a shared email shell
5. Add tests/previews

## Highest-Value Immediate Fixes

If only a few changes are made right now, these will deliver the most value:

1. Remove duplicate legacy logic from `public/js/client-pdf-generator.js`
2. Extract `buildQuotationEmailHtml` and the eBill invoice email HTML into dedicated template modules
3. Add shared HTML escaping for all template interpolation

## Conclusion

The current system works, and the eBill invoice plus quotation templates are already moving in the right direction. The main problem is no longer visual quality; it is template sprawl.

The most important structural risks are:

- duplicated invoice rendering logic
- inline HTML inside large route files
- lack of shared escaping/formatting helpers
- limited automated validation for template output

Addressing those four areas will make future email and PDF work faster, safer, and much easier to maintain.
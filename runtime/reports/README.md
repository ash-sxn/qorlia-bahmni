# Native Reports review adapter

This directory is AGPL 3.0, with the full license in `LICENSE`. The rest of
the frontend retains its existing licenses. The original Reports application,
changelogs and notices remain in the pinned upstream image. See the root NOTICE.

The adapter uses `bahmni/reports` at digest
`sha256:3af8e248ae7603126fecb1efacb583e8b6b2bd4e9df0254fc198e8e4a2d63877`.
`start-staging.sh` replaces its startup script and compiles the reviewed
`MainReportController.java`, `TemplateUploadController.java` and
`JasperResponseConverter.java` over their matching native classes. The converter
changes supply the correct custom XLS MIME type and per-report Qorlia styles;
workbook generation remains native. SQL, report definitions and generation classes remain upstream.
It validates environment inputs, writes private configuration, uses the bundled
clinical and Reports Liquibase changelogs without shell tracing, then starts
the bundled embedded Tomcat without a debugger. Database arguments remain
visible inside that container's process namespace, so do not grant untrusted
container/host access. This is not a production credential-management design.

## Compatible native exporter candidate

### Report design tokens

Wide printable tables now receive derived per-column title/value styles so
explicit native column styles cannot bypass padding. Tables over twelve columns
use 9-point type; other generated tables retain 10-point type. Automatic
static-title text columns use heading-word metrics for width, while configured
widths/character counts, dynamic headings and value formatting remain native.
Default printable detail/header bands prevent ordinary row splits without
overriding explicit report/template split policies. Native checks retain all
65 full identifiers/birthdates in a multi-page fixture; all three rendered pages
and a real React queued Visit Report PDF were inspected. The late-arriving direct
HTML result also shows the updated spacing. Other definitions, long body values,
paper sizes, crosstabs and Unicode/font embedding are not accepted as complete.

The converter derives styles from the native template through DynamicReports'
public API. It never modifies or copies the shared `Templates.java` class, whose
existing LGPL header and notices remain upstream. HTML/PDF add a readable
product name and Built on Bahmni page header. Generated spreadsheet headers use
the brand color, with readable white text and sage alternating rows. Existing
report titles, data queries, calculations, locale and currency rules are retained.
CSV receives no design changes. Supplied XLS template sheets are not restyled.

Optionally mount the same `branding.json` used by the frontend read-only and set
`QORLIA_BRANDING_FILE` to its absolute container path. Reports currently consumes
only `name` and `primary`; logo, background and hover tokens remain frontend-only.
The name must be a non-empty string up to 60 characters without control characters
or em dashes. The primary must be a six-digit hex color with 4.5:1 white contrast.
Invalid, missing or larger-than-16-KiB files fall back to Qorlia defaults. Values
are read once at startup. No external assets, scripts or CSS are loaded.

Native fixtures verify HTML/PDF credit, generated XLSX header color, alternative
hospital name/color, invalid/missing token fallback, unchanged native shared
styles, byte-identical CSV and retained hospital XLS sheet styling/formula/name
and non-executable OLE marker. These checks do not establish every report's
layout, Unicode font embedding or real VBA compatibility. The runtime currently
uses its available SansSerif font; the brand web fonts are not installed in it.

The exact pinned image's DynamicReports 4.0.0 / JasperReports 6.0.0 exporter calls
an HSSF colour class absent from its POI 5.2.1. The candidate instead uses
DynamicReports 6.12.1, JasperReports 6.21.5 and POI 5.4.1, with thirty matching
Maven Central artifacts listed in `exporter-libraries.lock`. Java 11 compatibility
and six native formats are tested; a full production vulnerability/license
inventory and every report/template remain release gates.

Run `sh runtime/reports/fetch-exporter-libraries.sh /absolute/empty/private-directory`
on the operator's machine. It downloads only HTTPS Maven Central paths and checks
each SHA-256. Mount that directory read-only at `/staging/reports-libraries` and
this source directory read-only at `/staging/reports-source`. Keep dependency
binaries outside the public source repository. Startup validates the complete
set before installation and never downloads dependencies. Exact replaced JARs
are moved to `/var/run/bahmni-reports/original-exporter-libraries`; take a separate
recoverable backup of the container's runtime, source and database before changing
an existing installation. Do not promote this adapter to production by copying
private staging configuration.

The queue's JSON response type is explicit because XML libraries are needed by
native templates. File downloads use an explicit `ResponseEntity` content type
with Spring's native Resource body/range handling, not XML negotiation. Custom
XLS carries `application/vnd.ms-excel`, while keeping the original workbook
template conversion and `.xls` extension.

Startup runs `check-controller.sh` before serving HTTP. Latest native results:
46 controller checks, 49 template checks and all six formats. Converter checks
read populated outputs and preserve a template sheet, formula, named range,
unchanged input bytes and a non-executable OLE marker. No formulas/macros execute;
the marker is not proof of real VBA preservation.

Actual direct/queued custom XLS and React upload/schedule/download passed using
an isolated synthetic Visit Report. All six queued formats have correct MIME,
stored-file hashes and 206 ranges. Cancel kept the seven reports unchanged,
including the five original reports; native audit count is eleven. Confirmed
React deletion, configured templates/real macro workbooks, other definitions,
concurrency/failure/restart recovery, further output layout/branding and CSRF/method migration
remain open. The dated observations below are historical checkpoints.

The React confirmation identifies the requested time, format and filename and
retains the shared modal's safe initial focus and restoration on Cancel. Reports
regressions passed 56 tests in India and US Pacific time, including upload and
acknowledgement control-character rejection. An optional missing translation
override uses the bundled labels; required-file and authorization/server failures
remain logged. Translation/client checks, changed-source lint, type checks and
dependency-first builds passed. No confirmed browser deletion was performed.

Before startup, take a recoverable clinical database backup. The migration
creates reporting views, an age-group table and a SQL function in OpenMRS,
and may create the upstream seeded reports service user if missing. Its second
changelog creates the Quartz and scheduled-report tables in a separate schema.
Do not run it against a hospital or public-demo database without a separate
approved migration/release gate.

The private container uses the staging database, a separate `bahmni_reports`
schema, persistent `/home/bahmni/reports` storage, an internal Docker network,
no published ports, a 1 GiB container cap and a 512 MiB heap. Required inputs
are checked in the script. `REPORTS_CONFIG_URL` points to the private proxy's
existing report catalogue. The seed service credentials are those bundled by
upstream; review and replace that setup before any non-synthetic deployment.

`proxy-staging.conf` is the tested private proxy configuration. It supplies
the existing authenticated OpenMRS session as an HttpOnly, Secure, same-site
`reporting_session` cookie, matching upstream's Reports authentication contract.
It does not turn an anonymous request into an authenticated one. The Reports
service validates the session. No raw report storage or database port is exposed.
Loopback browser testing verified this bridge; it is not a TLS production proxy.

Verification: `sh -n start-staging.sh`, Nginx syntax check in the actual staging
container, native startup/migrations, anonymous and invalid-session denial,
and populated synthetic browser queue/generation/read-back. The full frontend
suite and HTML-versus-download control regression are in `apps/reports`.

5 October checkpoint: queued Visit Reports completed in HTML and CSV. The
CSV browser download matched the stored report's SHA-256; its rows included the
synthetic QA patient. Both requests produced native RUN_REPORT audit events.
Cancellation of the removal dialog preserved both reports. A later actual
React checkpoint generated populated PDF, Excel and OpenDocument files;
read-only content checks passed and all three downloads matched native storage
hashes. The HTML output also rendered in its separate tab. Native output
templates still need Qorlia branding/layout review, and download filenames
duplicate extensions. Actual deletion, custom XLS upload, direct Run now,
server-side limited-role/ownership checks, restart recovery and other report
definitions remain unverified. OpenELIS and Odoo report datasets are not
available in this isolated staging backend.

## 5 October native authorization correction

This supersedes the explicit ownership gap above, not full Reports readiness.
Mount this directory read-only at `/staging/reports-source` in the Reports
container. Startup requires the pinned image's Java 11 compiler and native
classpath; compilation failure stops startup. Only the reviewed classes are compiled
into the application. The test harness is never included in the running WAR.

The controller obtains the username from the authenticated OpenMRS session,
not a queue query parameter. It rejects another user's queue or schedule,
returns 404 for another user's download/deletion ID, and checks the report's
configured privilege before scheduling, downloading, deleting or direct
generation. Permission verification failures deny access rather than returning
queue records. A direct denial returns before generation. Processing reports
cannot be downloaded or deleted; queued downloads have a single extension.
The existing global authentication interceptor remains enabled.

Frontend Reports checks passed (50) in India and US Pacific time, and its type
check passed. Adapter/check shell syntax and repository diff checks passed.

Run `sh /staging/reports-source/check-controller.sh` inside the pinned container
after its private configuration exists. All 33 checks passed against the actual
Spring, servlet and Reports classes, including a synthetic local session HTTP
stub. These are controller-level checks, not live limited-role proof by themselves.

After a Reports-only rollback backup and recreation, native HTTP verification
passed 16 checks: the owner's populated queue and CSV download, foreign queue
and schedule denial, missing IDs, invalid/anonymous sessions, and a synthetic
Reports-only user's denied access to the admin's queue/download/deletion IDs.
The synthetic account was retired afterward. Independent SQL retained five
Completed reports and ten RUN_REPORT audits, unchanged by these read/denial
checks. The separate source mount, 1 GiB cap and no-published-port boundary
remain intact; no clinical application container was recreated.

Live per-report restricted definitions, actual deletion, custom XLS upload and
generation, concurrent actions, failed-job/restart recovery, output styling and
other report definitions remain. Mutating GET endpoints are retained for the
legacy client contract; CSRF and method migration require a separate compatible
review. Original template-path validation remains in ReportGenerator. The
initial ASCII-only filename guard was removed before deployment because it
would reject legitimate configured subdirectories or non-English filenames.

## 5 October limited-role lifecycle and template upload checkpoint

A subsequent native HTTP check passed 27 assertions using one temporary
synthetic report definition and a Reports-only test user. Revoking the report's
privilege hid its queue row and denied direct generation, scheduling, download
and deletion. An unparseable catalogue returned 503 on all five paths. Restoring
permission retained the original row/file; confirmed deletion removed both.
Independent SQL/storage checks retained the original five reports and ten audit
events. The test account was retired and the catalogue restored byte-for-byte.
These are native API checks, not React browser deletion proof.

The upload controller now validates real BIFF XLS workbooks with the image's
existing POI library before writing, rejects unsafe paths/control characters,
retains valid Unicode names and original bytes, uses unique CREATE_NEW writes,
and cleans partial copies. Its acknowledgement explicitly uses UTF-8; live
testing found and corrected the original converter's lossy Hindi response.
The existing configured multipart limit remains unchanged. Global Reports
authentication still guards uploads. No macros are executed during validation.

The pinned image passed 49 upload/controller checks plus the 33 existing
authorization checks. Live native HTTP upload checks passed six assertions:
anonymous denial, wrong extension, empty/HTML/truncated rejection and a valid
Hindi-named XLS. Storage SHA-256 matched the 4096-byte native test fixture.
Only private Reports restarted, after a Reports-only rollback backup.

Custom XLS generation is NOT passed: the pinned image's JasperReports 6.0.0
exporter requires `org.apache.poi.hssf.util.HSSFColor$WHITE`, absent from its
POI 5.2.1. The actual direct generation returned 500 with that class-loading
failure; no scheduled report was created. Dependency compatibility must be
corrected before verifying template/formula preservation, configured templates,
scheduled custom exports or macro-bearing workbooks. The ordinary five export
formats are not proof of this sixth format. The official workflow is described
in [Reporting Overview](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/2270265367).

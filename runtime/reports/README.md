# Native Reports review adapter

This directory is AGPL 3.0, with the full license in `LICENSE`. The rest of
the frontend retains its existing licenses. The original Reports application,
changelogs and notices remain in the pinned upstream image. See the root NOTICE.

The adapter uses `bahmni/reports` at digest
`sha256:3af8e248ae7603126fecb1efacb583e8b6b2bd4e9df0254fc198e8e4a2d63877`.
`start-staging.sh` replaces its startup script, not its Java application or SQL.
It validates environment inputs, writes private configuration, uses the bundled
clinical and Reports Liquibase changelogs without shell tracing, then starts
the bundled embedded Tomcat without a debugger. Database arguments remain
visible inside that container's process namespace, so do not grant untrusted
container/host access. This is not a production credential-management design.

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

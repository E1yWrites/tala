# Security policy

Tala is local-first: there is no server, account or telemetry, and notes stay in the browser's IndexedDB. The main risks are therefore in the web app itself (XSS through imported content, malformed `.tala`/`.json` backups or PDFs) and in the release pipeline.

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private reporting: **Security → Report a vulnerability** on <https://github.com/E1yWrites/tala>. Include steps to reproduce and the version. You can expect a first reply within a week.

## Supported versions

Only the latest release and the live web app receive fixes.

## Release integrity

Windows installers are not code-signed. Each release attaches a `SHA256SUMS` file; verify downloads against it.

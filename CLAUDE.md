```markdown
# CLAUDE.md — Public Customer Website

## Mission

Build and maintain a clear, trustworthy, accessible public website for the product identified in this repository’s README and existing brand assets.

The website may include product information, privacy and legal pages, and customer support. Treat the README as the source of truth for required pages and behavior. Do not copy another project’s name, branding, assets, or claims. If the product identity or requirements are unclear, ask before inventing them.

## Technology

- Python 3.12
- FastHTML on Starlette/ASGI
- Uvicorn
- Server-rendered HTML with custom CSS and minimal JavaScript
- SQLite for local support-ticket storage
- Optional Supabase integration for production support data
- Dependencies managed with `uv`, pinned in `uv.lock`
- Docker deployment suitable for Railway
- pytest for automated tests

Follow the versions and setup already present in the repository. Do not upgrade or replace the stack without a clear need and approval.

## Engineering principles

1. **Inspect first.** Read the README, source, tests, configuration, and existing assets before changing anything. Preserve unrelated work and follow existing project conventions.
2. **Be accurate.** Do not invent product features, company details, contact information, privacy practices, legal terms, or security guarantees. Mark unknown facts clearly and ask for confirmation before publishing them.
3. **Protect privacy.** Keep secrets in environment variables. Never commit credentials or log support-ticket contents or other personal data.
4. **Fail visibly.** Report configuration, database, and integration failures clearly. Do not silently hide errors or return success when an operation failed.
5. **Keep local operation practical.** The app should work locally with SQLite and without Supabase. Use Supabase only when explicitly configured.
6. **Build accessibly.** Use semantic HTML, keyboard-accessible controls, visible focus, readable contrast, responsive layouts, and clear form labels and errors.
7. **Keep scope focused.** Do not add analytics, advertising, payment flows, user accounts, or unrelated features unless explicitly requested.
8. **Verify changes.** Add or update tests for behavior you change. Run the relevant tests and checks before reporting completion.

## Privacy and legal content

- Treat privacy policies, terms, and other legal text as publisher-approved content.
- Do not claim that data is never collected, shared, retained, or processed unless that is verified.
- For any unknown legal or data-handling details, use a clearly marked placeholder such as `[NEEDS CONFIRMATION]`; do not publish placeholders as final policy text.
- Confirm the actual data flow for support forms and any configured Supabase integration before describing it publicly.
- Do not make regulatory-compliance claims without explicit, verified requirements and evidence.
- Keep legal content easy for the publisher to review and update.

## Support forms and data storage

If the README requires a support form:

- Validate inputs on the server and provide accessible, understandable validation feedback.
- Store only the information needed to respond to the request.
- Use SQLite locally. Enable Supabase storage only when explicitly configured.
- Do not store credentials or unnecessary sensitive financial or personal details in support tickets.
- Handle database and service errors explicitly; never display raw stack traces or secrets to visitors.
- Add tests for valid submissions, invalid input, storage failures, and the configured local/Supabase behavior.

## Workflow for changes

1. Inspect the repository and identify the relevant files and current behavior.
2. For substantial work, provide a concise plan covering pages, data handling, configuration, tests, and acceptance criteria.
3. Make small, focused changes that follow the project’s existing patterns.
4. Update the README and tests when behavior, setup, environment variables, or deployment steps change.
5. Run formatting/linting, pytest, and any available build or container checks.
6. Report files changed, checks run, results, configuration still required, and known gaps.

## Deployment and configuration

- Document local development and production deployment in the README.
- Document every required environment variable, its purpose, and whether it is secret.
- Never put secret values in examples; use safe placeholders.
- Keep Docker images and Railway configuration reproducible and aligned with the documented startup command.
- Ensure production configuration errors are detected at startup or surfaced clearly.

## Definition of done

A change is complete when it meets the requested behavior, preserves unrelated existing functionality, has appropriate tests and documentation, passes the available relevant checks, and does not introduce unverified public claims or expose sensitive data.
```
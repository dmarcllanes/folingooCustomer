# Folingoo beta signup site

The site uses FastHTML (Starlette/ASGI) for its server and MongoDB-backed API.
The existing branded HTML, CSS, JavaScript, and image assets are served by the
FastHTML app. Beta access instructions are sent manually; the site does not
send email.

## Run locally

Use Python 3.12 and `uv`:

```sh
uv sync
uv run uvicorn main:app --reload
```

Open [http://localhost:8000](http://localhost:8000). To test submissions and
admin login locally, create `.env.local` in the project root and set:

```dotenv
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>
MONGODB_DB=<database>
ADMIN_USERNAME=<your-admin-username>
ADMIN_PASSWORD=<long-random-admin-password>
ADMIN_SESSION_SECRET=<random-secret-at-least-32-characters>
```

Run locally with `uv run --env-file .env.local uvicorn main:app --reload`.
All variables except `MONGODB_DB` are secrets. Generate an admin session
secret with `openssl rand -base64 32`. Never commit `.env.local` or share
these secrets.
Run tests with `uv run pytest`.

## Deploy to Vercel

Connect this repository to Vercel with the repository root (`./`) as the root
directory and the **Python** framework preset. Do not set `main.py` as the root
directory. `pyproject.toml` identifies `main:app` as the Python ASGI entrypoint;
the Python app serves the landing and admin pages plus their assets, so no
separate output directory is needed.

Add these project environment variables for Production (and Preview if you use
preview deployments):

- `MONGODB_URI`: Atlas connection string; secret.
- `MONGODB_DB`: database name; not secret.
- `ADMIN_USERNAME`: admin login name; secret.
- `ADMIN_PASSWORD`: admin login password; secret.
- `ADMIN_SESSION_SECRET`: random signing key of at least 32 bytes; secret.

After adding or changing variables, redeploy so they take effect.

## Beta signup and admin

The signup form accepts an email address, `ios` or `android`, and the required
contact acknowledgment. Email addresses are normalized and unique. Repeating
a signup updates that email's device selection. MongoDB stores the email,
device, and signup creation time in the `beta_signups` collection. The app
does not send email.

Open `/admin` or `/admin.html` on the deployed site to view tester email,
device, and signup date. Sign in with `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
Admin sessions use an HTTP-only, same-site cookie that expires after eight
hours; `ADMIN_SESSION_SECRET` signs it. Changing that secret invalidates
existing sessions.

## Before publishing

- Replace `[NEEDS CONFIRMATION: support email]` with the approved support
  contact.
- Confirm and publish the retention and deletion-request details shown next to
  the signup form. The marked wording is not final privacy text.
- Review the product and privacy wording against the current app and actual
  data-handling practices.

The sample lesson is fixed and local; it does not collect visitor input or
connect to the live coach.

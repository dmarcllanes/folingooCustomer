# Folingoo beta signup site

The site in `site/` introduces Folingoo and lets beta testers request access
with their email address and device platform. The Vercel function in `api/`
stores signup details in MongoDB. Beta access instructions are sent manually;
the site does not send email.

## Run locally

Use Node.js 20 or later and install dependencies:

```sh
npm install
npm test
```

For a static-only preview, run:

```sh
python3 -m http.server 8000 --directory site
```

The signup endpoint is not available from the static preview. To test the full
flow, install the Vercel CLI, create a `.env.local` file in the project root,
and run `vercel dev`:

```dotenv
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>
MONGODB_DB=<database>
```

`MONGODB_URI` is secret. `MONGODB_DB` is the MongoDB database name and is not
secret. Do not commit `.env.local` or share database credentials.

## Deploy to Vercel

Import this project into Vercel with the project root as the root directory.
The included `vercel.json` publishes `site/`, and Vercel deploys
`api/beta-signups.js` as `/api/beta-signups`. Add `MONGODB_URI` and
`MONGODB_DB` to the Vercel project's environment variables for each environment
you use. Configure the MongoDB deployment's network access and credentials so
the Vercel function can connect.

The signup API accepts an email address, `ios` or `android`, and the required
contact acknowledgment. It normalizes email addresses, keeps one signup per
email, and updates the device choice if that email submits again. Each document
stores the email, device, and signup creation time in the `beta_signups`
collection. The MongoDB email index is created automatically. The function
does not send mail.

## Before publishing

- Replace `[NEEDS CONFIRMATION: support email]` with the approved support
  contact.
- Confirm and publish the retention and deletion-request details shown next to
  the signup form. The marked wording is not final privacy text.
- Review the product and privacy wording against the current app and actual
  data-handling practices.

The sample lesson is fixed and local; it does not collect visitor input or
connect to the live coach.

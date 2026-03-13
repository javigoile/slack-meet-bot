# Slack Meet Bot — Setup Guide

## Prerequisites
- Node.js 18+
- A public HTTPS URL for your server (use [ngrok](https://ngrok.com) for local development)

---

## Step 1 — Install dependencies

```bash
cd slack-meet-bot
npm install
```

---

## Step 2 — Create the Slack App

1. Go to https://api.slack.com/apps and click **Create New App → From scratch**.
2. Give it a name (e.g. `Meet Bot`) and pick your workspace.
3. In the left sidebar, go to **Slash Commands → Create New Command**:
   - **Command:** `/meet`
   - **Request URL:** `https://<your-server>/meet`
   - **Short Description:** `Create a Google Meet link`
   - **Usage Hint:** _(leave blank)_
   - Click **Save**.
4. In the left sidebar, go to **OAuth & Permissions** and add these **Bot Token Scopes**:
   - `commands`
5. Click **Install to Workspace** and authorize.
6. Go to **Basic Information → Signing Secret** and copy the value.

---

## Step 3 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:
```
SLACK_SIGNING_SECRET=<value from step 2.6>
MEET_URL=https://meet.google.com/getalink
PORT=3000
```

---

## Step 4 — Run the server

```bash
# Production
npm start

# Development (auto-restarts on changes)
npm run dev
```

For local testing, expose the server with ngrok:
```bash
ngrok http 3000
```
Use the `https://xxxx.ngrok.io` URL as your Slack slash command Request URL.

---

## How it works

1. User types `/meet` in any channel or DM.
2. Slack POSTs to `https://<your-server>/meet`.
3. The bot immediately acknowledges (required within 3 s).
4. Asynchronously fetches `MEET_URL` and extracts the Google Meet link by:
   - Following redirects (if the URL redirects to a meet room URL)
   - Parsing a JSON body (`link`, `url`, `meetLink`, or `hangoutLink` fields)
   - Extracting a `meet.google.com/xxx-xxxx-xxx` pattern from HTML/text
5. Sends an `in_channel` message with a clickable **Join Meeting** button visible to everyone in the conversation.

---

## Deploying to production

Any Node.js host works. Quick options:
- **Railway:** `railway up`
- **Render:** connect your repo, set env vars in dashboard
- **Fly.io:** `fly launch`
- **Heroku:** `git push heroku main`

Make sure to set the same env vars on your hosting platform.

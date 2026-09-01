# Slack Quick Meet — Setup Guide

## Prerequisites
- Node.js 18+
- A public HTTPS URL for your server (use [ngrok](https://ngrok.com) for local development)

---

## Step 1 — Install dependencies

```bash
cd slack-quick-meet
npm install
```

---

## Step 2 — Create the Slack App

1. Go to https://api.slack.com/apps and click **Create New App → From scratch**.
2. Give it a name (e.g. `Quick Meet`) and pick your workspace.
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

## Step 3 — Create Google OAuth credentials

1. Go to https://console.cloud.google.com and create (or select) a project.
2. Under **APIs & Services → Library**, enable the **Google Calendar API**.
3. Under **APIs & Services → Credentials**, click **Create Credentials → OAuth client ID**.
   - **Application type:** Web application
   - **Authorized redirect URI:** `https://<your-server>/auth/google/callback`
4. Copy the generated **Client ID** and **Client Secret**.

Each teammate authorizes their own Google account the first time they use `/meet` — nothing here is shared across users.

---

## Step 4 — Create a Redis database (Upstash)

1. Go to https://upstash.com and create a free account.
2. Create a new Redis database (any region close to your server works).
3. From the database dashboard, copy the **REST URL** and **REST Token** — this is where each user's Google tokens are stored.

---

## Step 5 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:
```
SLACK_SIGNING_SECRET=<value from step 2.6>
GOOGLE_CLIENT_ID=<value from step 3.4>
GOOGLE_CLIENT_SECRET=<value from step 3.4>
GOOGLE_REDIRECT_URI=https://<your-server>/auth/google/callback
UPSTASH_REDIS_REST_URL=<value from step 4.3>
UPSTASH_REDIS_REST_TOKEN=<value from step 4.3>
PORT=3000
```

---

## Step 6 — Run the server

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
Use the `https://xxxx.ngrok.io` URL as both your Slack slash command Request URL and your Google OAuth redirect URI.

---

## How it works

1. User types `/meet` in any channel or DM.
2. Slack POSTs to `https://<your-server>/meet`, and the bot verifies the request signature.
3. **First time:** the bot replies privately with a link to connect their Google account (OAuth2, Calendar scope only). Once they authorize, their tokens are stored in Redis, keyed to their Slack user ID.
4. **Every time after that:** the bot immediately acknowledges (required within 3s), then creates a short-lived Calendar event with Google Meet conferencing enabled, extracts the Meet link, and deletes the placeholder event.
5. The bot posts an `in_channel` message with a clickable **Join Meeting** button, visible to everyone in the conversation.
6. Expired Google tokens are refreshed automatically and the new tokens are persisted back to Redis; if a refresh ever fails, the user is prompted to reconnect.

---

## Deploying to production

This project is currently deployed on **Koyeb**, but any Node.js host works:
- **Koyeb:** connect your repo, set env vars in the dashboard
- **Railway:** `railway up`
- **Render:** connect your repo, set env vars in the dashboard
- **Fly.io:** `fly launch`

Make sure to set the same env vars from Step 5 on your hosting platform, and update `GOOGLE_REDIRECT_URI` (and the Google OAuth client's authorized redirect URI) to match your production URL.

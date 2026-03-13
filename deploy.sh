#!/usr/bin/env bash
# deploy.sh — Railway deployment for Slack Meet Bot
set -e
export PATH="/opt/homebrew/bin:$PATH"
SERVICE="slack-meet-bot"

# ─── 1. Login ────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 1/4  Login to Railway"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
railway login

# ─── 2. Create project ───────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 2/4  Create Railway project"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
railway init --name "$SERVICE"

# ─── 3. First deploy — this creates the service ──────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 3/4  Initial deploy (creates service)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
railway up --service "$SERVICE" --ci

# ─── 4. Set env vars using -s flag (no linking needed) ───────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 4/4  Configure & redeploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -rp "Paste your Slack Signing Secret: " SLACK_SECRET

railway variable set -s "$SERVICE" \
  "SLACK_SIGNING_SECRET=$SLACK_SECRET" \
  "MEET_URL=https://meet.google.com/getalink" \
  "PORT=3000"

echo "✓ Variables set. Redeploying with them..."
railway up --service "$SERVICE" --ci

# ─── 5. Generate public domain ───────────────────────────────────────────────
echo ""
echo "Generating public URL..."
railway service link "$SERVICE"
railway domain

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " DONE — use the URL above in Slack:"
echo "   api.slack.com/apps → Slash Commands"
echo "   → /meet → Request URL:"
echo "   https://<railway-url>/meet"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

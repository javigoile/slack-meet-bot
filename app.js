require("dotenv").config();

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const { google } = require("googleapis");
const { Redis } = require("@upstash/redis");

const app = express();
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  express.urlencoded({
    extended: true,
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })
);
app.use(
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })
);

// ── Slack signature verification ──────────────────────────────────────────────
function verifySlackSignature(req, res, next) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return next();

  const sig = req.headers["x-slack-signature"];
  const ts = req.headers["x-slack-request-timestamp"];
  if (!sig || !ts) return res.status(400).send("Missing headers");
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300)
    return res.status(400).send("Stale request");

  const raw =
    req.rawBody?.toString("utf8") ||
    new URLSearchParams(req.body).toString();
  const expected =
    "v0=" +
    crypto
      .createHmac("sha256", secret)
      .update(`v0:${ts}:${raw}`)
      .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig)))
    return res.status(403).send("Invalid signature");

  next();
}

// ── OAuth2 client factory ─────────────────────────────────────────────────────
function makeOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// ── Build the Google auth URL, encoding Slack context in state ────────────────
function getAuthUrl(slackUserId, responseUrl) {
  const oauth2 = makeOAuth2Client();
  const state = Buffer.from(
    JSON.stringify({ slackUserId, responseUrl })
  ).toString("base64url");

  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
    prompt: "consent",
  });
}

// ── Create a Meet link via Calendar API, then delete the placeholder event ────
async function createMeetLink(userId) {
  const tokens = await redis.get(userId);
  if (!tokens) throw new Error("NOT_AUTHENTICATED");

  const oauth2 = makeOAuth2Client();
  oauth2.setCredentials(tokens);

  // Persist refreshed tokens automatically
  oauth2.on("tokens", (refreshed) => {
    redis.set(userId, { ...tokens, ...refreshed }).catch(() => {});
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const now = new Date();
  const later = new Date(now.getTime() + 3600000);

  const { data: event } = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    resource: {
      summary: "Meeting",
      start: { dateTime: now.toISOString() },
      end: { dateTime: later.toISOString() },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const meetLink = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video"
  )?.uri;

  if (!meetLink) throw new Error("Google did not return a Meet link");

  // Clean up — delete the placeholder event immediately
  await calendar.events
    .delete({ calendarId: "primary", eventId: event.id })
    .catch(() => {});

  return meetLink;
}

// ── POST /meet — Slack slash command ─────────────────────────────────────────
app.post("/meet", verifySlackSignature, async (req, res) => {
  const { user_id, user_name, response_url } = req.body;

  // If user hasn't connected Google yet, send them the auth link privately
  if (!(await redis.get(user_id))) {
    const authUrl = getAuthUrl(user_id, response_url);
    return res.json({
      response_type: "ephemeral",
      text: `:wave: Before using \`/meet\`, connect your Google account (one-time):\n<${authUrl}|*Click here to connect Google*>`,
    });
  }

  // Acknowledge immediately (Slack requires a response within 3 s)
  res.json({
    response_type: "in_channel",
    text: "_Creating Google Meet link..._",
  });

  try {
    const meetLink = await createMeetLink(user_id);

    await axios.post(response_url, {
      response_type: "in_channel",
      replace_original: true,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:video_camera: *Google Meet started by <@${user_name || user_id}>*\n<${meetLink}|Join the meeting>`,
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "Join Meeting" },
            url: meetLink,
            action_id: "join_meeting",
          },
        },
      ],
    });
  } catch (err) {
    if (err.message === "NOT_AUTHENTICATED") {
      const authUrl = getAuthUrl(user_id, response_url);
      await axios
        .post(response_url, {
          response_type: "ephemeral",
          replace_original: true,
          text: `:wave: Your Google session expired. Reconnect here:\n<${authUrl}|*Reconnect Google*>`,
        })
        .catch(() => {});
    } else {
      console.error("Meet link error:", err.message);
      await axios
        .post(response_url, {
          response_type: "ephemeral",
          replace_original: true,
          text: `:x: Couldn't create Meet link: ${err.message}`,
        })
        .catch(() => {});
    }
  }
});

// ── GET /auth/google/callback — OAuth redirect handler ───────────────────────
app.get("/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.send(
      `<h2 style="font-family:sans-serif">Auth cancelled: ${error}</h2><p>Close this tab and try again.</p>`
    );
  }

  try {
    const { slackUserId, responseUrl } = JSON.parse(
      Buffer.from(state, "base64url").toString()
    );

    const oauth2 = makeOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    await redis.set(slackUserId, tokens);

    // Notify the user in Slack that they're connected
    await axios
      .post(responseUrl, {
        response_type: "ephemeral",
        text: ":white_check_mark: Google account connected! Type `/meet` to create a meeting link.",
      })
      .catch(() => {});

    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#333">
        <h2>✅ Google account connected!</h2>
        <p>You can close this tab and go back to Slack.</p>
        <p>Type <strong>/meet</strong> to get your meeting link.</p>
      </body></html>
    `);
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    res.status(500).send(`<h2>Error: ${err.message}</h2><p>Close this tab and try again.</p>`);
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`Slack Meet Bot listening on port ${PORT}`));

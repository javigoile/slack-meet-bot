require("dotenv").config();

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Parse URL-encoded bodies (Slack sends slash commands as application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));

// Raw body needed for signature verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Middleware: verify the request actually came from Slack
function verifySlackSignature(req, res, next) {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;

  if (!slackSigningSecret) {
    console.warn("SLACK_SIGNING_SECRET not set — skipping signature check");
    return next();
  }

  const slackSignature = req.headers["x-slack-signature"];
  const slackTimestamp = req.headers["x-slack-request-timestamp"];

  if (!slackSignature || !slackTimestamp) {
    return res.status(400).send("Missing Slack signature headers");
  }

  // Reject requests older than 5 minutes (replay attack protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(slackTimestamp, 10)) > 300) {
    return res.status(400).send("Request timestamp too old");
  }

  const rawBody = req.rawBody
    ? req.rawBody.toString("utf8")
    : new URLSearchParams(req.body).toString();

  const sigBase = `v0:${slackTimestamp}:${rawBody}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", slackSigningSecret)
      .update(sigBase, "utf8")
      .digest("hex");

  if (
    !crypto.timingSafeEqual(
      Buffer.from(mySignature, "utf8"),
      Buffer.from(slackSignature, "utf8")
    )
  ) {
    return res.status(403).send("Invalid Slack signature");
  }

  next();
}

// Fetch the Google Meet link from the configured URL
async function getGoogleMeetLink() {
  const meetUrl = process.env.MEET_URL || "https://meet.google.com/getalink";

  const response = await axios.get(meetUrl, {
    maxRedirects: 10,
    // If the endpoint redirects to the actual meet room URL, capture that final URL
    validateStatus: (status) => status < 400,
  });

  // 1. If we were redirected to a meet.google.com room URL, use that
  if (
    response.request?.res?.responseUrl &&
    response.request.res.responseUrl !== meetUrl
  ) {
    const finalUrl = response.request.res.responseUrl;
    if (/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/.test(finalUrl)) {
      return finalUrl;
    }
  }

  // 2. Try to parse a meet link out of a JSON response body
  if (typeof response.data === "object" && response.data !== null) {
    const candidates = [
      response.data.link,
      response.data.url,
      response.data.meetLink,
      response.data.hangoutLink,
    ];
    for (const c of candidates) {
      if (c && c.startsWith("https://meet.google.com/")) return c;
    }
  }

  // 3. Try to extract a meet link from an HTML/text response
  if (typeof response.data === "string") {
    const match = response.data.match(
      /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/
    );
    if (match) return match[0];
  }

  throw new Error(
    `Could not extract a Google Meet link from the response. Raw response: ${JSON.stringify(response.data).slice(0, 300)}`
  );
}

// POST /meet — Slack slash command endpoint
app.post("/meet", verifySlackSignature, async (req, res) => {
  const { user_name, channel_name, channel_id } = req.body;

  // Immediately acknowledge to Slack (must respond within 3 seconds)
  res.status(200).json({
    response_type: "in_channel",
    text: `_Generating a Google Meet link..._`,
  });

  // Fetch the meet link asynchronously and send a follow-up message
  try {
    const meetLink = await getGoogleMeetLink();

    await axios.post(req.body.response_url, {
      response_type: "in_channel",
      replace_original: true,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:video_camera: *Google Meet link created by <@${user_name || "someone"}>*\n<${meetLink}|Join the meeting>`,
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
    console.error("Error fetching meet link:", err.message);

    await axios
      .post(req.body.response_url, {
        response_type: "ephemeral",
        replace_original: true,
        text: `:x: Sorry, I couldn't generate a Google Meet link. Please try again.\n\`${err.message}\``,
      })
      .catch(console.error);
  }
});

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Slack Meet Bot listening on port ${PORT}`);
});

# Slack Quick Meet

A Slack bot that creates a real Google Meet link with a single command: `/meet`.

---

## 🇦🇷 Español

**Slack Quick Meet** es un bot de Slack que crea un link de Google Meet real con el comando `/meet`, sin depender de un link fijo ni de una cuenta de Google compartida.

### ¿Qué hace?

- Escribís `/meet` en cualquier canal o DM de Slack.
- La primera vez, te pide conectar tu cuenta de Google (OAuth2, solo con permiso sobre Calendar).
- A partir de ahí, cada `/meet` crea una reunión de Google Meet a tu nombre usando la Calendar API, y devuelve el link con un botón de **Join Meeting** visible para todo el canal.
- Los tokens de cada usuario se guardan de forma segura y se refrescan automáticamente — no hay que volver a conectar la cuenta salvo que la sesión expire.

### Stack

- **Node.js + Express** — servidor y slash command
- **Slack API** — slash commands, verificación de firma de requests
- **Google Calendar API** — generación real de reuniones de Meet
- **Redis (Upstash)** — almacenamiento de tokens OAuth por usuario
- Deployado en **Koyeb** (aunque cualquier host de Node.js funciona)

### Instalación

Los pasos completos para levantarlo en tu propio Slack están en [SETUP.md](./SETUP.md).

---

## 🇬🇧 English

**Slack Quick Meet** is a Slack bot that creates a real Google Meet link with the `/meet` command — no fixed link, no shared Google account.

### What it does

- Type `/meet` in any Slack channel or DM.
- The first time, it asks you to connect your Google account (OAuth2, Calendar scope only).
- After that, every `/meet` creates a Google Meet meeting under your own name via the Calendar API, and returns the link with a **Join Meeting** button visible to the whole channel.
- Each user's tokens are stored securely and refreshed automatically — no need to reconnect unless the session expires.

### Stack

- **Node.js + Express** — server and slash command handling
- **Slack API** — slash commands, request signature verification
- **Google Calendar API** — real Meet link generation
- **Redis (Upstash)** — per-user OAuth token storage
- Deployed on **Koyeb** (any Node.js host works)

### Installation

Full setup instructions to run it on your own Slack workspace are in [SETUP.md](./SETUP.md).

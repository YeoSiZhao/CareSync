import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

// ===== Firebase Admin Initialization =====
const serviceAccount = JSON.parse(
  fs.readFileSync("./serviceAccountKey.json", "utf8")
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const sseClients = new Set();
const deviceClients = new Set();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API_BASE = "https://api.telegram.org";

const normalizeTelegramUsername = (username = "") =>
  username.trim().replace(/^@/, "").toLowerCase();

const findTelegramChatId = async (username) => {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram bot token missing.");
  }
  const response = await fetch(
    `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/getUpdates`
  );
  if (!response.ok) {
    throw new Error("Failed to reach Telegram.");
  }
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || "Telegram API error.");
  }
  const updates = Array.isArray(data.result) ? data.result : [];
  const match = updates
    .map((update) => update.message || update.edited_message)
    .filter(Boolean)
    .reverse()
    .find((message) => {
      const fromUser = normalizeTelegramUsername(message.from?.username || "");
      const chatUser = normalizeTelegramUsername(message.chat?.username || "");
      return fromUser === username || chatUser === username;
    });

  if (!match) return null;
  return match.chat?.id || null;
};

const sendTelegramToAll = async (text) => {
  if (!TELEGRAM_BOT_TOKEN) return;
  const snapshot = await db.collection("telegram_subscriptions").get();
  if (snapshot.empty) return;

  console.log("[telegram] sending alert", {
    text,
    subscribers: snapshot.size,
  });

  try {
    await db.collection("telegram_alerts").add({
      text,
      subscriber_count: snapshot.size,
      sent_at: Timestamp.now(),
    });
  } catch (error) {
    console.error("Telegram alert log failed:", error?.message || error);
  }

  await Promise.all(
    snapshot.docs.map(async (doc) => {
      const data = doc.data();
      const chatId = data?.chat_id;
      if (!chatId) return;
      try {
        await fetch(
          `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text }),
          }
        );
      } catch (error) {
        console.error("Telegram send failed:", error?.message || error);
      }
    })
  );
};

const ALERT_WINDOW_MS = 60 * 1000;
const ALERT_THRESHOLD = 3;
let recentEventTimestamps = [];

// ===== Express Setup =====
const app = express();
app.use(cors());
app.use(express.json());

// ===== POST /api/event =====
app.post("/api/event", async (req, res) => {
  try {
    console.log("EVENT BODY", req.body);
    const { device_id, label, timestamp } = req.body;
    const eventRef = await db.collection("events").add({
      device_id,
      label,
      timestamp: Timestamp.fromDate(new Date(timestamp)),
    });

    // Update heartbeat
    const nowTimestamp = Timestamp.now();
    await db
      .collection("devices")
      .doc(device_id)
      .set({ last_seen: nowTimestamp }, { merge: true });

    const devicePayload = {
      id: device_id,
      last_seen: nowTimestamp.toDate().toISOString(),
    };
    for (const client of deviceClients) {
      client.write(`data: ${JSON.stringify(devicePayload)}\n\n`);
    }

    const payload = {
      id: eventRef.id,
      device_id,
      label,
      timestamp: new Date(timestamp).toISOString(),
    };
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    const now = Date.now();
    recentEventTimestamps = recentEventTimestamps.filter(
      (ts) => now - ts <= ALERT_WINDOW_MS
    );
    recentEventTimestamps.push(now);
    const windowCount = recentEventTimestamps.length;

    if (windowCount > ALERT_THRESHOLD) {
      sendTelegramToAll(
        `🚨 Multiple requests detected in the last minute. Latest: “${label}”. Please review activity immediately.`
      ).catch((error) => console.error("Telegram error:", error?.message || error));
      recentEventTimestamps = [];
    }

    res.status(200).send({ message: "Event logged" });
  } catch (err) {
    console.error("Error logging event:", err);
    res.status(500).send({ error: "Failed to log event" });
  }
});

// ===== POST /api/heartbeat =====
app.post("/api/heartbeat", async (req, res) => {
  try {
    const { device_id } = req.body;
    const nowTimestamp = Timestamp.now();
    await db.collection("devices").doc(device_id).set(
      {
        last_seen: nowTimestamp,
      },
      { merge: true }
    );
    const devicePayload = {
      id: device_id,
      last_seen: nowTimestamp.toDate().toISOString(),
    };
    for (const client of deviceClients) {
      client.write(`data: ${JSON.stringify(devicePayload)}\n\n`);
    }
    res.status(200).send({ message: "Device heartbeat received" });
  } catch (err) {
    console.error("Error updating heartbeat:", err);
    res.status(500).send({ error: "Failed to update heartbeat" });
  }
});

// ===== GET /api/events =====
app.get("/api/events", async (req, res) => {
  try {
    const snapshot = await db.collection("events").get();
    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      const ts =
        data.timestamp && typeof data.timestamp.toDate === "function"
          ? data.timestamp.toDate()
          : new Date(data.timestamp);
      return {
        id: doc.id,
        device_id: data.device_id,
        label: data.label,
        timestamp: ts.toISOString(),
      };
    });
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.status(200).json(events);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ===== GET /api/events/stream =====
app.get("/api/events/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write("event: ready\ndata: connected\n\n");
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    res.write("event: ping\ndata: keep-alive\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ===== GET /api/devices =====
app.get("/api/devices", async (req, res) => {
  try {
    const snapshot = await db.collection("devices").get();
    const devices = snapshot.docs.map((doc) => {
      const data = doc.data();
      const lastSeen =
        data.last_seen && typeof data.last_seen.toDate === "function"
          ? data.last_seen.toDate()
          : new Date(data.last_seen);
      return { id: doc.id, last_seen: lastSeen.toISOString() };
    });
    res.status(200).json(devices);
  } catch (err) {
    console.error("Error fetching devices:", err);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

// ===== GET /api/devices/stream =====
app.get("/api/devices/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write("event: ready\ndata: connected\n\n");
  deviceClients.add(res);

  const heartbeat = setInterval(() => {
    res.write("event: ping\ndata: keep-alive\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    deviceClients.delete(res);
  });
});

// ===== Telegram Notification Endpoints =====
app.post("/api/telegram/subscribe", async (req, res) => {
  try {
    const rawUsername = req.body?.username || "";
    const username = normalizeTelegramUsername(rawUsername);
    if (!username) {
      res.status(400).json({ error: "Missing username" });
      return;
    }
    if (!TELEGRAM_BOT_TOKEN) {
      res.status(500).json({ error: "Telegram bot not configured" });
      return;
    }

    const chatId = await findTelegramChatId(username);
    if (!chatId) {
      res.status(404).json({
        error:
          "User not found. Open the bot in Telegram and send /start, then try again.",
      });
      return;
    }

    await db
      .collection("telegram_subscriptions")
      .doc(username)
      .set({ username, chat_id: chatId, updated_at: Timestamp.now() }, { merge: true });

    res.status(201).json({ message: "Telegram linked", username });
  } catch (err) {
    console.error("Telegram subscribe error:", err);
    res.status(500).json({ error: "Failed to link Telegram" });
  }
});

app.post("/api/telegram/test", async (req, res) => {
  try {
    await sendTelegramToAll("CareSync test notification.");
    res.json({ message: "Telegram test sent" });
  } catch (err) {
    console.error("Telegram test error:", err);
    res.status(500).json({ error: "Failed to send Telegram test" });
  }
});

app.post("/api/telegram/unsubscribe", async (req, res) => {
  try {
    const rawUsername = req.body?.username || "";
    const username = normalizeTelegramUsername(rawUsername);
    if (!username) {
      res.status(400).json({ error: "Missing username" });
      return;
    }
    if (!TELEGRAM_BOT_TOKEN) {
      res.status(500).json({ error: "Telegram bot not configured" });
      return;
    }

    await db.collection("telegram_subscriptions").doc(username).delete();
    res.status(200).json({ message: "Telegram unlinked", username });
  } catch (err) {
    console.error("Telegram unsubscribe error:", err);
    res.status(500).json({ error: "Failed to unlink Telegram" });
  }
});

app.get("/api/telegram/alerts", async (req, res) => {
  try {
    const snapshot = await db
      .collection("telegram_alerts")
      .orderBy("sent_at", "desc")
      .limit(50)
      .get();

    const alerts = snapshot.docs.map((doc) => {
      const data = doc.data();
      const sentAt =
        data.sent_at && typeof data.sent_at.toDate === "function"
          ? data.sent_at.toDate()
          : new Date(data.sent_at);
      return {
        id: doc.id,
        text: data.text || "",
        subscriber_count: data.subscriber_count || 0,
        sent_at: sentAt.toISOString(),
      };
    });

    res.status(200).json(alerts);
  } catch (err) {
    console.error("Telegram alerts fetch error:", err);
    res.status(500).json({ error: "Failed to fetch Telegram alerts" });
  }
});

// ===== POST /api/ml/train =====
app.post("/api/ml/train", async (req, res) => {
  try {
    const snapshot = await db.collection("events").get();
    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      const ts =
        data.timestamp && typeof data.timestamp.toDate === "function"
          ? data.timestamp.toDate()
          : new Date(data.timestamp);
      return {
        id: doc.id,
        type: data.label,
        timestamp: ts,
      };
    });

    events.sort((a, b) => a.timestamp - b.timestamp);

    // Save to temporary JSON file
    const tempFile = path.join(__dirname, "temp_events.json");
    fs.writeFileSync(tempFile, JSON.stringify(events));

    // Spawn Python process
    const pythonProcess = spawn("python", ["ml_train.py", tempFile], {
      cwd: __dirname,
    });

    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      fs.unlinkSync(tempFile);
      if (code !== 0) {
        console.error("Python error:", stderr);
        res.status(500).json({ error: "ML training failed" });
      } else {
        try {
          const result = JSON.parse(stdout);
          res.json(result);
        } catch {
          res.status(500).json({ error: "Invalid ML output" });
        }
      }
    });
  } catch (err) {
    console.error("Error in ML endpoint:", err);
    res.status(500).json({ error: "Failed to run ML pipeline" });
  }
});

// ===== Start Server =====
app.listen(8080, "0.0.0.0", () => console.log("Backend running on port 8080"));


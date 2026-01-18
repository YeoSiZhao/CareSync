import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ===== Express Setup =====
const app = express();
app.use(cors());
app.use(express.json());

// ===== POST /api/event =====
app.post("/api/event", async (req, res) => {
  try {
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
app.listen(8080, () => console.log("Backend running on port 8080"));

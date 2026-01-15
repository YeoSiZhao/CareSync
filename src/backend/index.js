import express from "express";
import cors from "cors";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./src/backend/serviceAccountKey.json", "utf8"));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const app = express();
app.use(cors());
app.use(express.json());

// Upload data to Firebase from ESP32
app.post("/api/event", async (req, res) => {
  const { device_id, label, timestamp } = req.body;
  await db.collection("events").add({ device_id, label, timestamp: Timestamp.fromDate(new Date(timestamp)) });
  res.status(200).send({ message: "Event logged" });
});

// Retrieve data from Firebase to show on app
app.get("/api/events", async (req, res) => {
  try {
    const eventsRef = db.collection("events");
    const snapshot = await eventsRef.get();
    const events = snapshot.docs.map(doc => {
      const data = doc.data();
      const timestamp = data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate() : new Date(data.timestamp);
      return { id: doc.id, device_id: data.device_id, label: data.label, timestamp: timestamp.toISOString() };
    });
    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.status(200).json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.listen(8080, () => console.log("Backend running on port 8080"));

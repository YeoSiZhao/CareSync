# CareSync

CareSync is a real-time companion dashboard for caregiver support. It takes in device feedback events, streams live updates to the UI, and uses a lightweight ML pipeline to predict the next likely need.

## Problem Statement
Develop a solution that improve relationships between caregiver and the care recipient so that caregivers can provide the care that the care recipients want/need in a mutually respectful, meaningful, and joyful way?

## Features

- Live dashboard with latest events recorded
- Analytics view with risk score, activity summaries, and trend visuals
- Logs view with daily and weekly rhythm summaries
- Real-time updates via server-sent events (SSE)
- ML pipeline that trains on recent events and predicts the next likely need

## Architecture

- Frontend: React + Vite in `src/`
- Backend: Node/Express + Firestore in `src/backend/`
- ML: Python script in `src/backend/ml_train.py`
- Devices: ESP32 x2 (Sender and Receiver) in `hardware/`

## Project Structure

- `src/components/` UI components (Live, Analytics, Logs)
- `src/components/hooks/` Data fetching + SSE hooks
- `src/backend/index.js` Express server and Firestore integration
- `src/backend/ml_train.py` ML training pipeline
- `hardware/` ESP32 firmware for caregiver and care recipient devices

## Getting Started

### Prerequisites

- Node.js 18+ (for Vite + Express)
- Python 3.10+ (for ML training)
- Firebase project + service account key (Firestore enabled)
- PlatformIO on Visual Studio Code / Arduino IDE

### Install

```bash
npm install
```

### Firebase Setup

1) Create a Firebase project with Firestore enabled.
2) Download a service account JSON key.
3) Save it as `src/backend/serviceAccountKey.json`.

### Run the Backend

```bash
node src/backend/index.js
```

The backend listens on port 8080.

### Run the Frontend

```bash
npm run dev
```

## Simulate Events with curl

You can post a single event to the backend using curl ("device_id":"Caregiver" / "Care Recipient"):

```bash
curl -X POST http://localhost:8080/api/event \
  -H "Content-Type: application/json" \
  -d '{"device_id":"Caregiver","label":"tired","timestamp":"2026-04-15T11:00:00Z"}'
```

You can also post a heartbeat:

```bash
curl -X POST http://localhost:8080/api/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"device_id":"Caregiver"}'
```

## ESP32 Devices (hardware/)

CareSync includes two ESP32 sketches:

- `hardware/CareRecipient.cpp`: Sends button feedback to the backend (HTTP) and to the caregiver device (UDP).
- `hardware/Caregiver.cpp`: Receives UDP alerts and flashes an RGB LED, plus sends heartbeat pings to the backend.

### Configure the ESP32 sketches

Update these constants in both sketches:

- `WIFI_SSID` / `WIFI_PASSWORD`: Your Wi-Fi or hotspot credentials.
- `BACKEND_BASE`: The backend IP and port on the same network as the ESP32 (example: `http://192.168.142.184:8080`).
- `DEVICE_ID`: The device identifier stored in Firestore (match this with what the UI expects if you want an online indicator).

After connecting all devices to the above Wi-Fi network, update the following constants (CareRecipient):

- `DEVICE_B_IP` / `DEVICE_B_PORT`: IP and port of the caregiver device.
- `LAPTOP_IP` / `LAPTOP_PORT`: Optional local debug listener.

### Flash and run

1) Open each sketch in Arduino IDE or PlatformIO.
2) Select the correct ESP32 board and COM port.
3) Upload `CareRecipient.cpp` to the care recipient device and `Caregiver.cpp` to the caregiver device.
4) Open Serial Monitor (115200 baud) to confirm Wi-Fi connection and backend posts.

## ML Pipeline

The backend exports events to a temporary JSON file and runs `ml_train.py`.
The script builds a small LSTM sequence model (seq_len 5), trains on the
event history, saves a model snapshot, and returns probabilities for the
next likely event.

Minimum training data: more than 5 labeled events.
For useful predictions, aim for dozens per label.

## Care Risk Score

The analytics view computes a 0-100 risk score based on the last two hours
of events. It blends a weighted severity score with event volume, then
labels the result as Low, Moderate, or High. The bar and marker reflect
the current score.

## Troubleshooting

- No live updates: confirm the backend is running and reachable from the UI.
- Devices show offline: device heartbeat must update within 5 minutes.
- ML training failed: ensure Python, numpy, and tensorflow are installed and
  there are enough events for training.

## Telegram Alerts

CareSync can send alerts to Telegram when a new event arrives.

1) Create a bot via BotFather and get your token.
2) Create `src/backend/.env` from `src/backend/.env.example` and set:
   `TELEGRAM_BOT_TOKEN=your_token_here`
3) Start the backend from `src/backend`:

```bash
node index.js
```

4) Open your bot in Telegram and send `/start`.
5) In the web app, enter your Telegram username and click **Link**, then **Test**.

### See More
- Slides: https://tinyurl.com/CareSyncH4G
- Video: https://drive.google.com/file/d/1rvF9WDwSEIDZ10o2hoS1f_c1_51Nnw8O/view?usp=drive_link

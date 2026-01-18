import requests
import random
from datetime import datetime, timedelta
import time

API_URL = "http://localhost:8080/api/event"   # your backend endpoint

labels = ["tired", "space", "company", "pain", "music", "talk"]

def send_bulk_events(n=500):
    now = datetime.now()
    for i in range(n):
        device_id = f"esp_{random.randint(1,2)}"
        label = random.choice(labels)
        timestamp = (now - timedelta(minutes=i*5)).isoformat()
        
        data = {
            "device_id": device_id,
            "label": label,
            "timestamp": timestamp
        }

        response = requests.post(API_URL, json=data)
        print(f"{i+1}: Sent {label} → {response.status_code}")
        time.sleep(0.05)  # 50 ms delay to avoid overloading your local server

send_bulk_events(1000)
import React, { useState, useEffect } from 'react';
import { Activity, Settings, TrendingUp, Moon, User, Heart, Activity as Pulse, Volume2, MessageCircle } from 'lucide-react';
import useRealtimeEvents from './hooks/useRealTimeEvents';
import LiveDashboard from './LiveDashBoard';
import Analytics from './Analytics';
import './CareSync.css';

const CareSync = () => {
  const [activeTab, setActiveTab] = useState('live');
  const { events, setEvents } = useRealtimeEvents();
  const [showNoteModal, setShowNoteModal] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [devices, setDevices] = useState([]);
  const [mlResults, setMlResults] = useState(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [lastTrained, setLastTrained] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let eventSource;
    let isMounted = true;

    const fetchDevices = async () => {
      try {
        const response = await fetch('http://localhost:8080/api/devices');
        const data = await response.json();
        if (!isMounted) return;
        setDevices(data);
      } catch (error) {
        console.error('Error fetching devices:', error);
      }
    };

    fetchDevices();

    eventSource = new EventSource('http://localhost:8080/api/devices/stream');
    eventSource.onmessage = (event) => {
      if (!event.data) return;
      const payload = JSON.parse(event.data);
      setDevices((prev) => {
        const next = [...prev];
        const idx = next.findIndex((device) => device.id === payload.id);
        if (idx >= 0) {
          next[idx] = { ...next[idx], last_seen: payload.last_seen };
        } else {
          next.push({ id: payload.id, last_seen: payload.last_seen });
        }
        return next;
      });
    };

    eventSource.onerror = (err) => {
      console.error('Device stream error:', err);
    };

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const runMLPipeline = async () => {
    setMlLoading(true);
    try {
      const response = await fetch('http://localhost:8080/api/ml/train', {
        method: 'POST'
      });
      const data = await response.json();
      setMlResults(data);
      setLastTrained(new Date().toLocaleString());
    } catch (error) {
      console.error('Error running ML pipeline:', error);
      setMlResults({ error: 'Failed to run ML pipeline' });
    }
    setMlLoading(false);
  };

  const needConfig = {
    tired: { icon: Moon, color: 'indigo', label: 'Tired' },
    space: { icon: User, color: 'purple', label: 'Need Space' },
    company: { icon: Heart, color: 'pink', label: 'Want Company' },
    pain: { icon: Pulse, color: 'red', label: 'In Pain' },
    music: { icon: Volume2, color: 'green', label: 'Music' },
    talk: { icon: MessageCircle, color: 'blue', label: 'Want to Talk' }
  };

  const acknowledgeEvent = id => setEvents(id, { acknowledged: true });
  const addNote = (id, note) => {
    setEvents(id, { acknowledged: true, note });
    setShowNoteModal(null);
    setNoteText('');
  };

  const unacknowledgedCount = events.filter(e => !e.acknowledged).length;
  const last24Hours = events.filter(e => e.timestamp && (currentTime - e.timestamp) < 86400000);
  const typeCounts = last24Hours.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  const isDeviceOnline = (deviceId) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return false;
    const lastSeen = new Date(device.last_seen).getTime();
    return (currentTime - lastSeen) < 300000; // 5 minutes
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-info">
            <div className="header-title">
              <img src="/icon.png" alt="CareSync Icon" className="app-icon" />
              <h1>CareSync Companion</h1>
            </div>
            <p className="header-slogan">Calm, connected care for every moment.</p>
          </div>
          <div className="header-status">
            <div className={`connection-status ${isDeviceOnline('caregiver') ? 'online' : 'offline'}`}>
              <div className="status-dot"></div>
              <span>Caregiver: {isDeviceOnline('caregiver') ? 'Connected' : 'Offline'}</span>
            </div>
            <div className={`connection-status ${isDeviceOnline('caretaker') ? 'online' : 'offline'}`}>
              <div className="status-dot"></div>
              <span>Caretaker: {isDeviceOnline('caretaker') ? 'Connected' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="main-content">
        <nav className="nav-tabs">
          <button onClick={() => setActiveTab('live')} className={`nav-tab ${activeTab === 'live' ? 'active' : ''}`}>
            <Activity size={18} /> Live
          </button>
          <button onClick={() => setActiveTab('analytics')} className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}>
            <TrendingUp size={18} /> Analytics
          </button>
        </nav>

        {activeTab === 'live' && (
          <LiveDashboard
            events={events}
            needConfig={needConfig}
            acknowledgeEvent={acknowledgeEvent}
            setShowNoteModal={setShowNoteModal}
            unacknowledgedCount={unacknowledgedCount}
            mlResults={mlResults}
          />
        )}
        {activeTab === 'analytics' && <Analytics last24Hours={last24Hours} needConfig={needConfig} typeCounts={typeCounts} mlResults={mlResults} mlLoading={mlLoading} lastTrained={lastTrained} runMLPipeline={runMLPipeline} currentTime={currentTime} />}
        {activeTab === 'settings' && <SettingsView needConfig={needConfig} />}
      </div>

      {showNoteModal !== null && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Add Response Note</h3>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="e.g., 'Gave medication', 'Talked for 15 minutes'..."
              className="modal-textarea"
            />
            <div className="modal-actions">
              <button onClick={() => addNote(showNoteModal, noteText)} disabled={!noteText.trim()} className="btn btn-primary">Save Note</button>
              <button onClick={() => { setShowNoteModal(null); setNoteText(''); }} className="btn btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CareSync;

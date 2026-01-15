import React, { useState, useEffect } from 'react';
import { Activity, Settings, TrendingUp, Moon, User, Heart, Activity as Pulse, Volume2, MessageCircle } from 'lucide-react';
import useRealtimeEvents from './hooks/useRealTimeEvents';
import LiveDashboard from './LiveDashBoard';
import Analytics from './Analytics';
import SettingsView from './SettingsViews';
import './CareSync.css';

const CareSync = () => {
  const [activeTab, setActiveTab] = useState('live');
  const { events, setEvents } = useRealtimeEvents();
  const [showNoteModal, setShowNoteModal] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const needConfig = {
    tired: { icon: Moon, color: 'indigo', label: 'Tired' },
    space: { icon: User, color: 'purple', label: 'Need Space' },
    company: { icon: Heart, color: 'pink', label: 'Want Company' },
    pain: { icon: Pulse, color: 'red', label: 'In Pain' },
    music: { icon: Volume2, color: 'green', label: 'Music' },
    talk: { icon: MessageCircle, color: 'blue', label: 'Want to Talk' }
  };

  const acknowledgeEvent = id => setEvents(prev => prev.map(e => e.id === id ? { ...e, acknowledged: true } : e));
  const addNote = (id, note) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, note, acknowledged: true } : e));
    setShowNoteModal(null);
    setNoteText('');
  };

  const unacknowledgedCount = events.filter(e => !e.acknowledged).length;
  const last24Hours = events.filter(e => e.timestamp && (currentTime - e.timestamp) < 86400000);
  const typeCounts = last24Hours.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-info">
            <h1>CareSync Companion</h1>
            <p>Empowering dignified communication</p>
          </div>
          {unacknowledgedCount > 0 && <div className="notification-badge">{unacknowledgedCount}</div>}
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
          <button onClick={() => setActiveTab('settings')} className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}>
            <Settings size={18} /> Settings
          </button>
        </nav>

        {activeTab === 'live' && <LiveDashboard events={events} needConfig={needConfig} acknowledgeEvent={acknowledgeEvent} setShowNoteModal={setShowNoteModal} unacknowledgedCount={unacknowledgedCount} />}
        {activeTab === 'analytics' && <Analytics last24Hours={last24Hours} needConfig={needConfig} typeCounts={typeCounts} />}
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

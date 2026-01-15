import { Bell, Check, Plus } from 'lucide-react';
import React from 'react';
import './CareSync.css';

const LiveDashboard = ({ events, needConfig, acknowledgeEvent, setShowNoteModal, unacknowledgedCount }) => (
  <div className="dashboard-content">
    {unacknowledgedCount > 0 && (
      <div className="alert-banner">
        <div className="alert-content">
          <Bell size={24} />
          <div>
            <h3 className="alert-title">
              {unacknowledgedCount} Unacknowledged Request{unacknowledgedCount > 1 ? 's' : ''}
            </h3>
            <p className="alert-subtitle">Please respond when possible</p>
          </div>
        </div>
      </div>
    )}

    <div className="card">
      <div className="card-header">
        <h2>Recent Activity</h2>
      </div>
      <div className="event-list">
        {events.slice(0, 8).map(event => {
          const config = needConfig[event.type];
          const Icon = config.icon;
          return (
            <div key={event.id} className={`event-item ${!event.acknowledged ? 'unacknowledged' : ''}`}>
              <div className="event-content">
                <div className={`event-icon ${config.color}`}>
                  <Icon size={24} />
                </div>
                <div className="event-details">
                  <div className="event-header">
                    <h3>{config.label}</h3>
                    <span className="event-time">
                      {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {event.note && <p className="event-note">"{event.note}"</p>}
                  {!event.acknowledged ? (
                    <div className="event-actions">
                      <button onClick={() => acknowledgeEvent(event.id)} className="btn btn-acknowledge">
                        <Check size={16} />
                        Acknowledge
                      </button>
                      <button onClick={() => setShowNoteModal(event.id)} className="btn btn-note">
                        <Plus size={16} />
                        Add Note
                      </button>
                    </div>
                  ) : (
                    <div className="acknowledged-badge">
                      <Check size={16} />
                      <span>Acknowledged</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export default LiveDashboard;

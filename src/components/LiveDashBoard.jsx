import { Plus, Brain } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import './CareSync.css';

const LiveDashboard = ({
  events,
  needConfig,
  setShowNoteModal,
  mlResults,
}) => {
  const pageSize = 10;
  const [page, setPage] = useState(1);

  const latestEvent = events[0] || null;
  const pastEvents = latestEvent ? events.slice(1) : events;
  const totalPages = Math.max(1, Math.ceil(pastEvents.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const { pageEvents, startIndex, endIndex } = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    const end = Math.min(start + pageSize, pastEvents.length);
    return {
      pageEvents: pastEvents.slice(start, end),
      startIndex: start,
      endIndex: end,
    };
  }, [pastEvents, safePage, pageSize]);

  // Helper: Extract top prediction safely
  const getTopPrediction = () => {
    if (!mlResults || mlResults.error) return null;

    const entries = Object.entries(mlResults)
      // eslint-disable-next-line no-unused-vars
      .filter(([label, val]) => typeof val === 'number' && !isNaN(val));

    if (entries.length === 0) return null;

    const [label, prob] = entries.sort(([, a], [, b]) => b - a)[0];
    const config = needConfig[label];
    const Icon = config ? config.icon : null;

    return (
      <span>
        {Icon && <Icon size={14} />} {config ? config.label : label} ({(prob * 100).toFixed(0)}%)
      </span>
    );
  };

  return (
    <div className="dashboard-content">
      <div className="card">
        <div className="card-header">
          <h2>Recent Activity</h2>
        </div>

        <div className="event-list">
          {/* Latest Event Section */}
          <div className="latest-section">
            <h3 className="latest-title">Latest Event</h3>
            {latestEvent ? (
              <div className="event-item latest-item">
                <div className="event-content">
                  <div className={`event-icon ${needConfig[latestEvent.type].color}`}>
                    {React.createElement(needConfig[latestEvent.type].icon, { size: 24 })}
                  </div>
                  <div className="event-details">
                    <div className="event-header">
                      <h3>{needConfig[latestEvent.type].label}</h3>
                      <span className="event-time">
                        {latestEvent.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {latestEvent.note && <p className="event-note">"{latestEvent.note}"</p>}

                    {/* Prediction Section */}
                    {mlResults && !mlResults.error && (
                      <p className="event-prediction">
                        <Brain size={14} style={{ marginRight: '4px' }} />
                        Predicted Next: {getTopPrediction() || 'No prediction available'}
                      </p>
                    )}

                    <div className="event-actions">
                      <button
                        onClick={() => setShowNoteModal(latestEvent.id)}
                        className="btn btn-note"
                      >
                        <Plus size={16} />
                        Add Note
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">No events yet.</div>
            )}
          </div>

          {/* Past Events */}
          <div className="past-section">
            <h3 className="past-title">Past Activities</h3>
          </div>

          {pageEvents.map((event) => {
            const config = needConfig[event.type];
            const Icon = config.icon;
            return (
              <div key={event.id} className="event-item">
                <div className="event-content">
                  <div className={`event-icon ${config.color}`}>
                    <Icon size={24} />
                  </div>
                  <div className="event-details">
                    <div className="event-header">
                      <h3>{config.label}</h3>
                      <span className="event-time">
                        {event.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {event.note && <p className="event-note">"{event.note}"</p>}

                    <div className="event-actions">
                      <button
                        onClick={() => setShowNoteModal(event.id)}
                        className="btn btn-note"
                      >
                        <Plus size={16} />
                        Add Note
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="pagination">
          <div className="pagination-info">
            {pastEvents.length === 0
              ? 'No past activity yet'
              : `Showing ${startIndex + 1}-${endIndex} of ${pastEvents.length}`}
          </div>
          <div className="pagination-controls">
            <button
              className="btn btn-secondary"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage === 1}
            >
              Prev
            </button>
            <span className="pagination-page">
              Page {safePage} of {totalPages}
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveDashboard;

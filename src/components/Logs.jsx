import React, { useMemo, useEffect, useState } from 'react';
import { CalendarDays, CalendarRange, Bell } from 'lucide-react';
import './CareSync.css';

const Logs = ({ events, needConfig }) => {
  const API_BASE = 'http://localhost:8080';
  const [telegramUsername, setTelegramUsername] = useState('');
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState('');
  const [telegramError, setTelegramError] = useState('');
  const [telegramAlerts, setTelegramAlerts] = useState([]);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramAlertsError, setTelegramAlertsError] = useState('');
  const { dailyLogs, weeklyLogs, busiestDay, topActivity } = useMemo(() => {
    const dayMap = new Map();
    const weekMap = new Map();
    const activityTotals = {};

    const toDateKey = (date) => date.toISOString().slice(0, 10);
    const startOfWeek = (date) => {
      const d = new Date(date);
      const day = (d.getDay() + 6) % 7; // Monday start
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - day);
      return d.toISOString().slice(0, 10);
    };

    events.forEach((event) => {
      const ts = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
      const dayKey = toDateKey(ts);
      const weekKey = startOfWeek(ts);
      const type = event.type;

      activityTotals[type] = (activityTotals[type] || 0) + 1;

      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { date: dayKey, count: 0, types: {} });
      }
      const dayEntry = dayMap.get(dayKey);
      dayEntry.count += 1;
      dayEntry.types[type] = (dayEntry.types[type] || 0) + 1;

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { week: weekKey, count: 0, types: {} });
      }
      const weekEntry = weekMap.get(weekKey);
      weekEntry.count += 1;
      weekEntry.types[type] = (weekEntry.types[type] || 0) + 1;
    });

    const getTopType = (types) => {
      const entries = Object.entries(types);
      if (entries.length === 0) return null;
      return entries.sort(([, a], [, b]) => b - a)[0];
    };

    const dailyLogs = Array.from(dayMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => {
        const top = getTopType(entry.types);
        return { ...entry, topType: top ? top[0] : null, topCount: top ? top[1] : 0 };
      });

    const weeklyLogs = Array.from(weekMap.values())
      .sort((a, b) => b.week.localeCompare(a.week))
      .map((entry) => {
        const top = getTopType(entry.types);
        return { ...entry, topType: top ? top[0] : null, topCount: top ? top[1] : 0 };
      });

    const busiestDay = dailyLogs.length
      ? dailyLogs.reduce(
          (max, entry) => (entry.count > max.count ? entry : max),
          dailyLogs[0]
        )
      : null;
    const topActivity = Object.entries(activityTotals).sort(([, a], [, b]) => b - a)[0] || null;

    return {
      dailyLogs,
      weeklyLogs,
      busiestDay,
      topActivity,
    };
  }, [events]);

  useEffect(() => {
    let isMounted = true;

    const fetchAlerts = async () => {
      setTelegramLoading(true);
      setTelegramAlertsError('');
      try {
        const response = await fetch(`${API_BASE}/api/telegram/alerts`);
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err?.error || 'Failed to fetch Telegram alerts.');
        }
        const data = await response.json();
        if (!isMounted) return;
        setTelegramAlerts(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!isMounted) return;
        setTelegramAlertsError(error.message || 'Failed to fetch Telegram alerts.');
      } finally {
        if (isMounted) setTelegramLoading(false);
      }
    };

    fetchAlerts();

    return () => {
      isMounted = false;
    };
  }, []);

  const linkTelegram = async () => {
    const username = telegramUsername.trim();
    setTelegramStatus('');
    setTelegramError('');
    if (!username) {
      setTelegramError('Enter your Telegram username first.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/telegram/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to link Telegram.');
      }
      setTelegramLinked(true);
      setTelegramStatus('Telegram linked. Alerts will send here.');
    } catch (error) {
      setTelegramError(error.message || 'Failed to link Telegram.');
    }
  };

  const unlinkTelegram = async () => {
    const username = telegramUsername.trim();
    setTelegramStatus('');
    setTelegramError('');
    if (!username) {
      setTelegramError('Enter your Telegram username first.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/telegram/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to unlink Telegram.');
      }
      setTelegramLinked(false);
      setTelegramStatus('Telegram unlinked.');
    } catch (error) {
      setTelegramError(error.message || 'Failed to unlink Telegram.');
    }
  };

  const testTelegram = async () => {
    setTelegramStatus('');
    setTelegramError('');
    try {
      const response = await fetch(`${API_BASE}/api/telegram/test`, {
        method: 'POST',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to send test message.');
      }
      setTelegramStatus('Test sent. Check Telegram.');
    } catch (error) {
      setTelegramError(error.message || 'Failed to send test message.');
    }
  };

  const formatDate = (dateKey) =>
    new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatDateTime = (dateTime) =>
    new Date(dateTime).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const formatWeek = (weekKey) => {
    const start = new Date(`${weekKey}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  };

  const topConfig = topActivity ? needConfig[topActivity[0]] : null;

  return (
    <div className="dashboard-content">
      <div className="card care-rhythm-card">
        <div className="card-header care-rhythm-header">
          <div>
            <h2>Care Rhythm Overview</h2>
            <p className="care-rhythm-subtitle">
              A quick read on the busiest moments and most common needs.
            </p>
          </div>
        </div>
        <div className="logs-summary care-rhythm-summary">
          <div className="care-rhythm-item">
            <span className="care-rhythm-label">Busiest Day</span>
            <span className="care-rhythm-value">
              {busiestDay ? formatDate(busiestDay.date) : 'No data yet'}
            </span>
            {busiestDay && (
              <span className="care-rhythm-meta">{busiestDay.count} requests</span>
            )}
          </div>
          <div
            className="care-rhythm-item"
            style={
              topConfig ? { '--accent-color': `var(--${topConfig.color}-500)` } : undefined
            }
          >
            <span className="care-rhythm-label">Most In-demand</span>
            <span className="care-rhythm-value">
              {topActivity ? (topConfig ? topConfig.label : topActivity[0]) : 'No data yet'}
            </span>
            {topActivity && (
              <span className="care-rhythm-meta">
                <span>{topActivity[1]} requests</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="card telegram-card">
        <div className="telegram-card-header">
          <div>
            <h2>Telegram Alerts</h2>
            <p className="telegram-subtitle">
              Link a username to receive urgent care alerts.
            </p>
          </div>
        </div>
        <div className="telegram-card-body">
          <div className="telegram-row">
            <input
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value)}
              placeholder="@username"
              className="telegram-input"
            />
            <button
              onClick={linkTelegram}
              className="btn btn-primary btn-small"
              disabled={!telegramUsername.trim()}
            >
              {telegramLinked ? 'Linked' : 'Link'}
            </button>
            <button
              onClick={unlinkTelegram}
              className="btn btn-secondary btn-small"
              disabled={!telegramUsername.trim()}
            >
              Unlink
            </button>
            <button
              onClick={testTelegram}
              className="btn btn-secondary btn-small"
            >
              Test
            </button>
          </div>
          <div className="telegram-hint">
            Open your bot in Telegram and send <strong>/start</strong> before linking.
          </div>
          {telegramStatus && <div className="telegram-status">{telegramStatus}</div>}
          {telegramError && <div className="telegram-error">{telegramError}</div>}
        </div>
      </div>

      <div className="card">
        <h2 className="analytics-title">
          <Bell size={20} /> Telegram Alerts
        </h2>
        <div className="log-list">
          {telegramLoading && <div className="empty-state">Loading alerts...</div>}
          {!telegramLoading && telegramAlertsError && (
            <div className="empty-state">{telegramAlertsError}</div>
          )}
          {!telegramLoading && !telegramAlertsError && telegramAlerts.length === 0 && (
            <div className="empty-state">No Telegram alerts yet.</div>
          )}
          {!telegramLoading &&
            !telegramAlertsError &&
            telegramAlerts.map((alert) => (
              <div key={alert.id} className="log-item log-item-red">
                <div>
                  <div className="log-date">{formatDateTime(alert.sent_at)}</div>
                  <div className="log-meta">Alert: {alert.text || '—'}</div>
                </div>
                <div className="log-count">
                  {alert.subscriber_count} sent
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="card">
        <h2 className="analytics-title">
          <CalendarDays size={20} /> Daily Activity
        </h2>
        <div className="log-list">
          {dailyLogs.length === 0 && <div className="empty-state">No activity yet.</div>}
          {dailyLogs.map((entry) => {
            const config = entry.topType ? needConfig[entry.topType] : null;
            const Icon = config ? config.icon : null;
            return (
              <div key={entry.date} className={`log-item ${config ? `log-item-${config.color}` : ''}`}>
                <div>
                  <div className="log-date">{formatDate(entry.date)}</div>
                  <div className="log-meta">
                    {Icon && <Icon size={14} />} Top activity: {config ? config.label : '—'}
                  </div>
                </div>
                <div className="log-count">{entry.count} requests</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 className="analytics-title">
          <CalendarRange size={20} /> Weekly Activity
        </h2>
        <div className="log-list">
          {weeklyLogs.length === 0 && <div className="empty-state">No activity yet.</div>}
          {weeklyLogs.map((entry) => {
            const config = entry.topType ? needConfig[entry.topType] : null;
            const Icon = config ? config.icon : null;
            return (
              <div key={entry.week} className={`log-item ${config ? `log-item-${config.color}` : ''}`}>
                <div>
                  <div className="log-date">{formatWeek(entry.week)}</div>
                  <div className="log-meta">
                    {Icon && <Icon size={14} />} Top activity: {config ? config.label : '—'}
                  </div>
                </div>
                <div className="log-count">{entry.count} requests</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Logs;

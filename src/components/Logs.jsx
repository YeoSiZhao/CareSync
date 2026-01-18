import React, { useMemo } from 'react';
import { CalendarDays, CalendarRange } from 'lucide-react';
import './CareSync.css';

const Logs = ({ events, needConfig }) => {
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

  const formatDate = (dateKey) =>
    new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatWeek = (weekKey) => {
    const start = new Date(`${weekKey}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  };

  return (
    <div className="dashboard-content">
      <div className="card">
        <div className="card-header">
          <h2>Care Rhythm Overview</h2>
        </div>
        <div className="logs-summary">
          <div className="logs-summary-item">
            <span className="summary-label">Busiest Day</span>
            <span className="summary-value">
              {busiestDay ? formatDate(busiestDay.date) : 'No data yet'}
            </span>
            {busiestDay && (
              <span className="summary-muted">{busiestDay.count} requests</span>
            )}
          </div>
          <div className="logs-summary-item">
            <span className="summary-label">Most In-demand</span>
            <span className="summary-value">
              {topActivity ? needConfig[topActivity[0]].label : 'No data yet'}
            </span>
            {topActivity && (
              <span className="summary-muted">{topActivity[1]} requests</span>
            )}
          </div>
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

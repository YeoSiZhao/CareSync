import { TrendingUp, BarChart2, PieChart, Brain } from 'lucide-react';
import React from 'react';
import './CareSync.css';

const Analytics = ({ last24Hours, needConfig, typeCounts, mlResults, mlLoading, lastTrained, runMLPipeline, currentTime }) => {

  const maxCount = Math.max(...Object.values(typeCounts), 1);
  const totalCount = Object.values(typeCounts).reduce((sum, value) => sum + value, 0);
  const now = currentTime;
  const recentEvents = last24Hours.filter((event) => {
    const ts = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
    return now - ts.getTime() <= 2 * 60 * 60 * 1000;
  });
  const riskWeights = {
    pain: 3,
    tired: 2,
    space: 1.5,
    company: 1.5,
    music: 1
  };
  const totalWeight = recentEvents.reduce((sum, event) => {
    const weight = riskWeights[event.type] || 1;
    return sum + weight;
  }, 0);
  const severity = recentEvents.length ? totalWeight / (recentEvents.length * 3) : 0;
  const volumeFactor = Math.min(1, recentEvents.length / 10);
  const riskScore = Math.round((severity * 0.6 + volumeFactor * 0.4) * 100);
  const riskLabel = riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Moderate' : 'Low';
  const riskText = `${riskLabel} risk`;

  const pieSegments = Object.entries(typeCounts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({
      type,
      count,
      percent: totalCount ? (count / totalCount) * 100 : 0
    }));

  const hourlyStats = Array.from({ length: 24 }, (_, hour) => {
    const bucket = last24Hours.filter((event) => {
      const ts = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
      return ts.getHours() === hour;
    });

    if (bucket.length === 0) {
      return { hour, type: null, count: 0 };
    }

    const counts = bucket.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {});

    const [topType, topCount] = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
    return { hour, type: topType, count: topCount };
  });

  const maxHourlyCount = Math.max(...hourlyStats.map((stat) => stat.count), 1);

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
      <div className="card training-card">
        <div className="training-info compact">
          <div>
            <h2 className="training-title">Update Predictions</h2>
            <p className="training-meta">
              {lastTrained ? `Last updated: ${lastTrained}` : 'Get the latest prediction based on recent activity.'}
            </p>
          </div>
          <button onClick={runMLPipeline} disabled={mlLoading} className="btn btn-primary">
            <Brain size={16} />
            {mlLoading ? 'Updating...' : 'Get Next Prediction'}
          </button>
        </div>
        {mlResults && (
          <div className="training-meta" style={{ marginTop: '8px' }}>
            {mlResults.error ? (
              <span>Prediction failed: {mlResults.error}</span>
            ) : (
              <span>Next likely event: {getTopPrediction() || 'No prediction available'}</span>
            )}
          </div>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{last24Hours.length}</div>
          <div className="stat-label">Last 24h Requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{riskScore}</div>
          <div className="stat-label">Care Risk Score</div>
          <div className="risk-bar">
            <span className="risk-bar-track">
              <span
                className="risk-bar-fill"
                style={{ width: `${riskScore}%` }}
              />
              <span
                className="risk-bar-marker"
                style={{ left: `${riskScore}%` }}
                aria-hidden="true"
              />
            </span>
          </div>
          <div className={`risk-label risk-${riskLabel.toLowerCase()}`}>{riskText}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value stat-value-success">
            {Math.round((last24Hours.filter(e => e.acknowledged).length / last24Hours.length) * 100) || 0}%
          </div>
          <div className="stat-label">Response Rate</div>
        </div>
      </div>

      <div className="card">
        <h2 className="analytics-title">
          <TrendingUp size={20} /> Last 24 Hours Overview
        </h2>
        <div className="overview-grid">
          <div className="overview-panel">
            <div className="overview-header">
              <PieChart size={18} />
              <span>Mode Share</span>
            </div>
            <div className="pie-wrap">
              <svg className="pie-chart" viewBox="0 0 36 36">
                {(() => {
                  let cumulative = 0;
                  return pieSegments.map((segment) => {
                    const offset = 25 - cumulative;
                    cumulative += segment.percent;
                    const color = needConfig[segment.type]?.color || 'blue';
                    return (
                      <circle
                        key={segment.type}
                        cx="18"
                        cy="18"
                        r="15.9155"
                        fill="none"
                        stroke={`var(--${color}-500, #3b82f6)`}
                        strokeWidth="3"
                        strokeDasharray={`${segment.percent} ${100 - segment.percent}`}
                        strokeDashoffset={offset}
                      />
                    );
                  });
                })()}
              </svg>
              <div className="pie-legend">
                {pieSegments.map((segment) => {
                  const config = needConfig[segment.type];
                  return (
                    <div key={segment.type} className="legend-item">
                      <span className={`legend-dot ${config.color}`}></span>
                      <span>{config.label}</span>
                      <span className="legend-value">{segment.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="overview-panel">
            <div className="overview-header">
              <BarChart2 size={18} />
              <span>Hourly Peak Mode</span>
            </div>
            <div className="hourly-chart">
              {hourlyStats.map((stat) => {
                const config = stat.type ? needConfig[stat.type] : null;
                const heightPx = Math.max(
                  6,
                  Math.round((stat.count / maxHourlyCount) * 120)
                );
                return (
                  <div key={stat.hour} className="hour-column">
                    {stat.count > 0 && (
                      <span className="hour-count">{stat.count}</span>
                    )}
                    <div
                      className={`hour-bar ${config ? config.color : 'muted'}`}
                      style={{ height: `${heightPx}px` }}
                      title={config ? `${config.label} (${stat.count})` : 'No activity'}
                    ></div>
                    <span className="hour-label">{stat.hour}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="analytics-list">
          {Object.entries(typeCounts).map(([type, count]) => {
            const config = needConfig[type];
            const Icon = config.icon;
            const percentage = (count / maxCount) * 100;
            return (
              <div key={type} className="analytics-item">
                <div className="analytics-header">
                  <div className="analytics-label">
                    <Icon size={18} />
                    <span>{config.label}</span>
                  </div>
                  <span className="analytics-count">{count}x</span>
                </div>
                <div className="progress-bar">
                  <div className={`progress-fill ${config.color}`} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Analytics;

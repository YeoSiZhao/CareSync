import { TrendingUp } from 'lucide-react';
import React from 'react';
import './CareSync.css';

const Analytics = ({ last24Hours, needConfig, typeCounts }) => {
  const maxCount = Math.max(...Object.values(typeCounts), 1);

  return (
    <div className="dashboard-content">
      <div className="card">
        <h2 className="analytics-title">
          <TrendingUp size={20} /> Last 24 Hours Overview
        </h2>
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

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{last24Hours.length}</div>
          <div className="stat-label">Total Requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-value stat-value-success">
            {Math.round((last24Hours.filter(e => e.acknowledged).length / last24Hours.length) * 100) || 0}%
          </div>
          <div className="stat-label">Response Rate</div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;

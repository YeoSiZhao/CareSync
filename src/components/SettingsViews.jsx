import React from 'react';
import './CareSync.css';

const SettingsView = ({ needConfig }) => (
  <div className="card">
    <h2 className="settings-title">Customize Buttons</h2>
    <p className="settings-subtitle">
      Configure button labels, colors, and sounds for the physical device.
    </p>
    <div className="settings-list">
      {Object.entries(needConfig).map(([key, config]) => {
        const Icon = config.icon;
        return (
          <div key={key} className="settings-item">
            <div className={`settings-icon ${config.color}`}>
              <Icon size={18} />
            </div>
            <input type="text" defaultValue={config.label} className="settings-input" />
          </div>
        );
      })}
    </div>
  </div>
);

export default SettingsView;

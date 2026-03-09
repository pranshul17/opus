import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Layout() {
  const [online, setOnline] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mentionCount, setMentionCount] = useState(0);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.ok ? setOnline(true) : setOnline(false))
      .catch(() => setOnline(false));

    api.tasks.links({ is_read: '0' })
      .then(links => setUnreadCount(links.length))
      .catch(() => {});

    api.mentions.unreadCount()
      .then(r => setMentionCount(r.count))
      .catch(() => {});
  }, []);

  const monitorItems = [
    { to: '/', icon: '📊', label: 'Dashboard', end: true },
    { to: '/channels', icon: '📡', label: 'Channels' },
    { to: '/tasks', icon: '✅', label: 'Tasks' },
    { to: '/mentions', icon: '🔔', label: 'Mentions', badge: mentionCount > 0 ? mentionCount : null },
    { to: '/reading-list', icon: '📚', label: 'Reading List', badge: unreadCount > 0 ? unreadCount : null },
    { to: '/knowledge-graph', icon: '✦', label: 'Knowledge Graph' },
    { to: '/links', icon: '🔗', label: 'Links' },
  ];

  const manageItems = [
    { to: '/templates', icon: '📋', label: 'Templates' },
    { to: '/rules', icon: '⚡', label: 'Auto-Reply Rules' },
    { to: '/push', icon: '📤', label: 'Push to Slack' },
  ];

  const systemItems = [
    { to: '/settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>⚡ Opus</h1>
          <p>Slack Channel Monitor</p>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Monitor</div>
          {monitorItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
              {item.badge != null && (
                <span className="unread-badge">{item.badge}</span>
              )}
            </NavLink>
          ))}

          <div className="nav-section" style={{ marginTop: 16 }}>Manage</div>
          {manageItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          <div className="nav-section" style={{ marginTop: 16 }}>System</div>
          {systemItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot">
            <div className={`dot ${online ? '' : 'offline'}`} />
            {online ? 'Server online' : 'Server offline'}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

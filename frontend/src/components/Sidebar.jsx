import React from 'react';
import { 
  LayoutDashboard, 
  MessageSquare, 
  ListTodo, 
  BookOpen, 
  BarChart3, 
  Settings, 
  LogOut,
  Sun,
  Moon,
  Bell,
  Menu,
  ShieldCheck
} from 'lucide-react';


export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  user, 
  onLogout, 
  theme, 
  toggleTheme,
  notificationCount,
  queueCount 
}) {
  const isMD = user?.role === 'md';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'chat', label: isMD ? 'Dual Chat History' : 'Ask AI & MD (Chat)', icon: MessageSquare },
    ...(isMD ? [{ id: 'queue', label: 'Questions Queue', icon: ListTodo, badge: queueCount }] : []),
    ...(isMD ? [{ id: 'whitelist', label: 'Allowed Emails', icon: ShieldCheck }] : []),
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'analytics', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <img src="/logo.png" alt="Logo" className="sidebar-logo-img" />
          <h2>MD Assistant</h2>
        </div>
        <button className="sidebar-toggle btn-icon" style={{ display: 'none' }}>
          <Menu size={18} />
        </button>
      </div>

      <nav className="sidebar-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              className={`menu-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="menu-badge">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-card">
          <div className="user-avatar" style={{ overflow: 'hidden' }}>
            {user?.role === 'md' ? (
              <img src="/md-avatar.png" alt="MD" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              user?.name?.charAt(0) || 'U'
            )}
          </div>
          <div className="user-info">
            <h4>{user?.name || 'Guest'}</h4>
            <span className="user-role">{user?.role === 'md' ? 'Managing Director' : 'Employee'}</span>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Log Out">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <style>{`
        .sidebar {
          width: var(--sidebar-width);
          background-color: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          height: 100%;
          transition: var(--transition-smooth);
        }

        .sidebar-brand {
          padding: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-color);
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
          color: white;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 16px;
          font-family: var(--font-display);
        }

        .sidebar-logo-img {
          width: 32px;
          height: 32px;
          object-fit: contain;
        }

        .brand-logo h2 {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .sidebar-menu {
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          overflow-y: auto;
        }

        .menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 500;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: var(--transition-fast);
          text-align: left;
          position: relative;
        }

        .menu-item:hover {
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .menu-item.active {
          background-color: var(--primary-light);
          color: var(--primary-color);
          font-weight: 600;
        }

        .menu-badge {
          position: absolute;
          right: 16px;
          background-color: var(--primary-color);
          color: white;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 10px;
        }

        .sidebar-footer {
          padding: 16px;
          border-top: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .theme-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          color: var(--text-secondary);
          padding: 0 8px;
        }

        .theme-toggle-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-fast);
        }

        .theme-toggle-btn:hover {
          background-color: var(--border-hover);
          color: var(--primary-color);
        }

        .user-profile-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background-color: var(--bg-tertiary);
          border-radius: var(--radius-md);
          position: relative;
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--secondary-color), var(--primary-color));
          color: white;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }

        .user-info {
          flex: 1;
          min-width: 0;
        }

        .user-info h4 {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role {
          font-size: 11px;
          color: var(--text-muted);
          display: block;
        }

        .logout-btn {
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: var(--transition-fast);
        }

        .logout-btn:hover {
          color: var(--error);
          background-color: var(--error-light);
        }
      `}</style>
    </aside>
  );
}

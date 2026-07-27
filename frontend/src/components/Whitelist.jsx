import React, { useState, useEffect } from 'react';
import { Search, Trash2, Plus, Mail, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export default function Whitelist({ user, backendUrl, token }) {
  const [emails, setEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch allowed emails list
  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/auth/allowed-emails`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmails(data);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to fetch whitelisted emails');
      }
    } catch (err) {
      console.error('Fetch whitelist error:', err);
      setError('Connection to backend failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [backendUrl, token]);

  // Handle Add Email
  const handleAddEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch(`${backendUrl}/api/auth/allowed-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: newEmail.trim() })
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(`Successfully whitelisted: ${newEmail}`);
        setNewEmail('');
        setEmails(prev => [...prev, data].sort((a, b) => a.email.localeCompare(b.email)));
      } else {
        setError(data.error || 'Failed to whitelist email');
      }
    } catch (err) {
      console.error('Add email error:', err);
      setError('Connection error. Failed to add email.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Remove Email
  const handleRemoveEmail = async (id, emailToRemove) => {
    if (!window.confirm(`Are you sure you want to remove "${emailToRemove}" from the whitelist? They will no longer be able to log in or register.`)) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${backendUrl}/api/auth/allowed-emails/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(`Removed from whitelist: ${emailToRemove}`);
        setEmails(prev => prev.filter(item => item.id !== id));
      } else {
        setError(data.error || 'Failed to remove email from whitelist');
      }
    } catch (err) {
      console.error('Delete whitelist error:', err);
      setError('Connection error. Failed to remove email.');
    }
  };

  // Filter emails based on search query
  const filteredEmails = emails.filter(item => 
    item.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="whitelist-view">
      <div className="whitelist-header-row">
        <div className="whitelist-title-block">
          <h1>Allowed Emails Whitelist</h1>
          <p>Control who is authorized to register and log in to the system</p>
        </div>
        <div className="whitelist-count-badge">
          <span className="badge badge-secondary">{filteredEmails.length} active</span>
        </div>
      </div>

      {/* Main Grid: Management Form and Whitelisted List */}
      <div className="whitelist-main-grid">
        
        {/* Left Side: Add Email Form */}
        <div className="whitelist-form-container card">
          <h3>Add to Whitelist</h3>
          <p className="card-description">
            Users will only be allowed to register or log in if their email address is whitelisted here.
          </p>

          {error && (
            <div className="alert alert-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert alert-success">
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleAddEmail} className="add-email-form">
            <div className="input-group">
              <label htmlFor="emailInput">Email Address</label>
              <div className="input-with-icon">
                <Mail size={16} className="input-icon" />
                <input
                  id="emailInput"
                  type="email"
                  className="input-field"
                  placeholder="e.g. employee@akashblowers.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-full"
              disabled={submitting || !newEmail.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Whitelisting...</span>
                </>
              ) : (
                <>
                  <Plus size={16} />
                  <span>Whitelist Email</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Side: List of Whitelisted Emails */}
        <div className="whitelist-list-container card">
          <div className="list-header">
            <h3>Whitelisted Users</h3>
            
            <div className="search-box-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="input-field search-input"
                placeholder="Search whitelisted emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="emails-scroll-area">
            {loading ? (
              <div className="loading-state">
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-color)' }} />
                <p>Retrieving allowed email list...</p>
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="empty-state">
                <Mail size={40} className="text-muted" />
                <h4>No emails whitelisted</h4>
                <p>{searchQuery ? 'No match found for your search query.' : 'Add authorized email accounts on the left.'}</p>
              </div>
            ) : (
              <div className="emails-list">
                {filteredEmails.map((item) => {
                  const isPrimaryMd = item.email === 'amit@company.com';
                  
                  return (
                    <div key={item.id} className="email-row-card">
                      <div className="email-info">
                        <Mail size={16} className="email-card-icon" />
                        <span className="email-text">{item.email}</span>
                        {isPrimaryMd && <span className="badge badge-primary-subtle">Primary MD</span>}
                      </div>

                      <button
                        className="btn-delete"
                        disabled={isPrimaryMd}
                        onClick={() => handleRemoveEmail(item.id, item.email)}
                        title={isPrimaryMd ? "Primary MD cannot be removed" : "Remove from whitelist"}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      <style>{`
        .whitelist-view {
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          height: calc(100vh - 89px);
          overflow: hidden;
          animation: slideUp 0.4s ease-out;
        }

        .whitelist-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .whitelist-title-block h1 {
          font-family: var(--font-display);
          font-size: 26px;
          font-weight: 700;
        }

        .whitelist-title-block p {
          color: var(--text-secondary);
          margin-top: 4px;
          font-size: 14px;
        }

        .whitelist-main-grid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 24px;
          flex: 1;
          overflow: hidden;
        }

        .card-description {
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 20px;
          line-height: 1.5;
        }

        .whitelist-form-container {
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          height: fit-content;
        }

        .whitelist-form-container h3 {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .add-email-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 16px;
          animation: fadeIn 0.3s ease-out;
        }

        .alert-error {
          background-color: var(--error-light);
          color: var(--error);
          border: 1px solid rgba(220, 38, 38, 0.2);
        }

        .alert-success {
          background-color: var(--success-light);
          color: var(--success);
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-group label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .input-with-icon {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .input-with-icon .input-field {
          padding-left: 38px;
          width: 100%;
        }

        .w-full {
          width: 100%;
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Whitelisted List Card */
        .whitelist-list-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 16px;
          margin-bottom: 16px;
          gap: 16px;
        }

        .list-header h3 {
          font-size: 18px;
          font-weight: 700;
          white-space: nowrap;
        }

        .list-header .search-box-wrapper {
          position: relative;
          flex: 1;
          max-width: 320px;
        }

        .list-header .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .list-header .search-input {
          padding-left: 36px;
          font-size: 13px;
        }

        .emails-scroll-area {
          flex: 1;
          overflow-y: auto;
          padding-right: 4px;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 64px 0;
          color: var(--text-secondary);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 64px 32px;
          text-align: center;
        }

        .empty-state h4 {
          font-size: 16px;
          font-weight: 600;
        }

        .empty-state p {
          font-size: 13px;
          color: var(--text-muted);
        }

        .emails-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .email-row-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          transition: var(--transition-fast);
        }

        .email-row-card:hover {
          border-color: var(--border-hover);
          background-color: var(--bg-tertiary);
        }

        .email-info {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .email-card-icon {
          color: var(--primary-color);
          opacity: 0.8;
          flex-shrink: 0;
        }

        .email-text {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .badge-primary-subtle {
          background-color: var(--primary-light);
          color: var(--primary-color);
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: 8px;
          white-space: nowrap;
        }

        .btn-delete {
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          transition: var(--transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-delete:hover:not(:disabled) {
          color: var(--error);
          background-color: var(--error-light);
        }

        .btn-delete:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

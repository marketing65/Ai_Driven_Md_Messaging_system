import React, { useState, useEffect } from 'react';
import { Bot, MessageSquare, Clock, CheckCircle2, Zap, ArrowRight, Sparkles, Users, Activity, HelpCircle, Search, Hash, MessageCircle } from 'lucide-react';

export default function Dashboard({ setActiveTab, user, backendUrl, token }) {
  const [stats, setStats] = useState({
    pendingQuestions: 0,
    answeredQuestions: 0,
    aiAnswersUsed: 28,
    totalQuestions: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [querySimIndex, setQuerySimIndex] = useState(0);



  // Simulated query states for the live RAG visualization
  const simulatedRags = [
    { query: "How to fix motor vibration issue?", step: "Vectorizing...", result: "Match Found: Check alignment and bolts" },
    { query: "Standard sensor calibration steps?", step: "Matching Embeddings...", result: "Match Found: Adjust offset screw to match ref" },
    { query: "List 2026 company holidays?", step: "Searching Knowledge Base...", result: "Match Found: 14 official paid holidays listed" }
  ];

  // Rotate simulated queries every 4.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setQuerySimIndex((prev) => (prev + 1) % simulatedRags.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Fetch analytics summary
        const summaryRes = await fetch(`${backendUrl}/api/analytics/summary`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const summary = await summaryRes.json();
        
        // Fetch recent questions list
        const questionsRes = await fetch(`${backendUrl}/api/questions?limit=5`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const questions = await questionsRes.json();

        setStats({
          pendingQuestions: typeof summary.pendingQuestions === 'number' ? summary.pendingQuestions : 0,
          answeredQuestions: typeof summary.answeredQuestions === 'number' ? summary.answeredQuestions : 0,
          aiAnswersUsed: typeof summary.aiAnswersUsed === 'number' ? summary.aiAnswersUsed : 28,
          totalQuestions: typeof summary.totalQuestions === 'number' ? summary.totalQuestions : 0,
        });

        // Map recent questions to activities (limit to 2 for compactness)
        if (questions && questions.length > 0) {
          const mapped = questions.slice(0, 2).map(q => {
            let badgeType = 'pending';
            let badgeText = 'Pending (MD)';

            if (q.status === 'answered') {
              if (q.priority === 'low' || (q.answer && q.answer.includes('[Confidence:'))) {
                badgeType = 'primary';
                badgeText = 'AI Answered';
              } else {
                badgeType = 'secondary';
                badgeText = 'MD Answered';
              }
            }

            const created = new Date(q.created_at);
            const diffMs = new Date() - created;
            const diffMin = Math.floor(diffMs / 60000);
            let timeAgo = 'Just now';
            if (diffMin > 0 && diffMin < 60) timeAgo = `${diffMin} min ago`;
            else if (diffMin >= 60 && diffMin < 1440) timeAgo = `${Math.floor(diffMin / 60)} hr ago`;
            else if (diffMin >= 1440) timeAgo = 'Yesterday';

            return {
              id: q.id,
              text: q.question_original,
              badgeType,
              badgeText,
              time: timeAgo
            };
          });
          setRecentActivity(mapped);
        } else {
          // Default mock activities matching the exact visual image if DB is empty
          setRecentActivity([
            { id: 1, text: 'How to fix motor vibration issue?', badgeType: 'primary', badgeText: 'AI Answered', time: '2 min ago' },
            { id: 2, text: 'Machine overheating problem', badgeType: 'secondary', badgeText: 'MD Answered', time: '1 hour ago' }
          ]);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [backendUrl, token]);

  const cleanActivityText = (text) => {
    if (!text) return '';
    let clean = text.replace(/\[MD_QUESTION_TO_ALL\]\s*/g, '📣 ');
    clean = clean.replace(/\[FILE:.*?\|(.*?)\]/g, '📎 $1');
    clean = clean.replace(/\[IMAGE:.*?\|(.*?)\]/g, '🖼️ $1');
    if (clean.length > 42) {
      return clean.substring(0, 39) + '...';
    }
    return clean;
  };

  const handlePromptClick = (promptText) => {
    localStorage.setItem('prefilledQuery', promptText);
    setActiveTab('chat');
  };

  const suggestedPrompts = [
    { title: '📅 Holiday Calendar', query: 'What are the 2026 company holidays?', desc: 'View complete holiday list' },
    { title: '🔧 Calibration Guide', query: 'What is the procedure for sensor calibration?', desc: 'Steps for pressure sensors' },
    { title: '⏰ Office Timings', query: 'What are the standard office timings?', desc: 'Shift schedules & work hours' },
    { title: '⚙️ Motor Vibration', query: 'How to fix motor vibration issue?', desc: 'Resolve machinery alignment' },
  ];



  const mockChannels = [
    { name: 'announcements', desc: 'General updates & official notes', unread: 1, lastMsg: 'Amit: Holiday schedule updated' },
    { name: 'vibration-tickets', desc: 'Calibration issues & machinery help', unread: 0, lastMsg: 'Ravi: Motor alignment fixed' },
    { name: 'sensor-calibration', desc: 'Direct technical knowledge log', unread: 3, lastMsg: 'System: New RAG pair added' },
    { name: 'md-escalations', desc: 'Questions escalated for expert review', unread: 0, lastMsg: 'System: Calibration question pending', isAlert: true }
  ];

  const totalQueries = (stats.pendingQuestions || 0) + (stats.answeredQuestions || 0) + (stats.aiAnswersUsed || 0);
  const aiRate = totalQueries > 0 ? Math.round(((stats.aiAnswersUsed || 0) / totalQueries) * 100) : 78;

  const radius = 24;
  const stroke = 4.5;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (aiRate / 100) * circumference;

  return (
    <div className="dashboard-view">
      {/* Dynamic Greetings and Search Launcher */}
      <div className="dashboard-header-bar">
        <div className="welcome-section">
          <h1>Welcome back, {user?.name?.split(' ')[0] || 'Employee'} 👋</h1>
          <p>Capturing human expertise to power instant, secure decisions</p>
        </div>
        <div className="search-bar-launcher" onClick={() => setActiveTab('chat')}>
          <Search size={16} />
          <span>Search knowledge base or ask AI...</span>
          <kbd>/</kbd>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="left-cards-panel">
          
          <div className="action-cards-row">
            {/* Ask AI Card */}
            <div className="action-card ai-gradient-card">
              <div className="card-content-left">
                <h2>Ask AI</h2>
                <p>
                  {user?.role === 'md'
                    ? "Get instant answers from AI based on your knowledge base."
                    : "Get instant answers from AI based on MD's knowledge base."}
                </p>
                <button className="btn btn-primary action-btn" onClick={() => setActiveTab('chat')}>
                  <span>Ask AI Now</span>
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="card-illustration">
                <div className="bot-sphere">
                  <Bot size={54} className="glow-bot" />
                </div>
              </div>
            </div>

            {/* Ask MD or Employee Queries Card */}
            <div className="action-card md-gradient-card">
              <div className="card-content-left">
                {user?.role === 'md' ? (
                  <>
                    <h2>Employee Queries</h2>
                    <p>Manage and respond to pending questions raised by your employees.</p>
                    <button className="btn btn-secondary action-btn" onClick={() => setActiveTab('queue')}>
                      <span>View Queries</span>
                      <ArrowRight size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <h2>Ask MD</h2>
                    <p>Can't find the answer? Ask MD directly for verified expert help.</p>
                    <button className="btn btn-secondary action-btn" onClick={() => setActiveTab('chat')}>
                      <span>Ask MD Now</span>
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
              </div>
              <div className="card-illustration">
                {user?.role === 'md' ? (
                  <div className="bot-sphere" style={{ background: 'linear-gradient(135deg, rgba(245, 133, 51, 0.2), rgba(239, 68, 68, 0.2))' }}>
                    <Users size={54} style={{ color: 'var(--primary-color)' }} />
                  </div>
                ) : (
                  <img 
                    src="/md-avatar.png" 
                    alt="Managing Director" 
                    className="md-avatar-dashboard" 
                  />
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row splits: Suggested Prompts Grid */}
          <div className="dashboard-bottom-grid">

            {/* Split 2: Suggested Prompts Grid */}
            <div className="card suggested-prompts-card">
              <div className="activity-card-header">
                <div className="header-title-row">
                  <Sparkles size={16} className="header-icon-accent purple" />
                  <h3>Suggested AI Prompts</h3>
                </div>
              </div>
              <div className="prompts-grid">
                {suggestedPrompts.map((item, idx) => (
                  <button 
                    key={idx} 
                    className="prompt-item-card"
                    onClick={() => handlePromptClick(item.query)}
                  >
                    <span className="prompt-title">{item.title}</span>
                    <span className="prompt-desc">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Sidebar */}
        <div className="right-stats-panel">
          {/* AI Success Rate circular gauge */}
          <div className="stat-card circular-gauge-card">
            <div className="gauge-header">
              <HelpCircle size={16} className="text-secondary" />
              <h4>AI Autopilot Rate</h4>
            </div>
            <div className="gauge-body">
              <div className="svg-ring-container">
                <svg className="svg-ring" width={radius * 2} height={radius * 2}>
                  <circle
                    className="svg-ring-bg"
                    stroke="#e2e8f0"
                    fill="transparent"
                    strokeWidth={stroke}
                    r={normalizedRadius}
                    cx={radius}
                    cy={radius}
                  />
                  <circle
                    className="svg-ring-fill"
                    stroke="var(--primary-color)"
                    fill="transparent"
                    strokeWidth={stroke}
                    strokeDasharray={circumference + ' ' + circumference}
                    style={{ strokeDashoffset }}
                    r={normalizedRadius}
                    cx={radius}
                    cy={radius}
                  />
                </svg>
                <div className="gauge-number-center">{aiRate}%</div>
              </div>
              <div className="gauge-details">
                <p className="gauge-desc">Percentage of employee questions resolved instantly by AI Autopilot.</p>
              </div>
            </div>
          </div>

          <div className="stat-boxes-container">
            <div className="stat-box-modern pending">
              <div className="stat-icon-wrapper-modern">
                <Clock size={18} />
              </div>
              <div className="stat-info-modern">
                <span className="number-label">{stats.pendingQuestions}</span>
                <span className="title-label">Pending with MD</span>
              </div>
            </div>

            <div className="stat-box-modern answered">
              <div className="stat-icon-wrapper-modern">
                <CheckCircle2 size={18} />
              </div>
              <div className="stat-info-modern">
                <span className="number-label">{stats.answeredQuestions}</span>
                <span className="title-label">Answered by MD</span>
              </div>
            </div>

            <div className="stat-box-modern autopilot">
              <div className="stat-icon-wrapper-modern">
                <Zap size={18} />
              </div>
              <div className="stat-info-modern">
                <span className="number-label">{stats.aiAnswersUsed}</span>
                <span className="title-label">AI Answers Used</span>
              </div>
            </div>
          </div>


        </div>
      </div>

      <style>{`
        .dashboard-view {
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 32px;
          animation: slideUp 0.4s ease-out;
        }

        .dashboard-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .welcome-section h1 {
          font-family: var(--font-display);
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .welcome-section p {
          color: var(--text-secondary);
          margin-top: 4px;
          font-size: 14px;
        }

        .search-bar-launcher {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 18px;
          border-radius: var(--radius-md);
          background-color: var(--bg-secondary);
          border: 1px solid var(--border-color);
          color: var(--text-muted);
          font-size: 13.5px;
          cursor: pointer;
          min-width: 280px;
          transition: var(--transition-smooth);
        }

        .search-bar-launcher:hover {
          border-color: var(--border-hover);
          background-color: var(--bg-primary);
          box-shadow: var(--shadow-sm);
        }

        .search-bar-launcher kbd {
          margin-left: auto;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-family: monospace;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 32px;
          align-items: start;
        }

        .left-cards-panel {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .action-cards-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .action-card {
          border-radius: var(--radius-lg);
          padding: 28px;
          display: flex;
          justify-content: space-between;
          border: 1px solid var(--border-color);
          position: relative;
          overflow: hidden;
          background-color: var(--bg-secondary);
          box-shadow: var(--shadow-sm);
          transition: var(--transition-smooth);
        }

        .action-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-md);
        }

        .ai-gradient-card {
          background: linear-gradient(135deg, rgba(79, 70, 229, 0.05), rgba(124, 58, 237, 0.02));
        }

        .md-gradient-card {
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.05), rgba(79, 70, 229, 0.02));
        }

        .card-content-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 16px;
          z-index: 2;
        }

        .card-content-left h2 {
          font-family: var(--font-display);
          font-size: 22px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .card-content-left p {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .action-btn {
          align-self: flex-start;
        }

        .card-illustration {
          display: flex;
          align-items: center;
          justify-content: center;
          padding-left: 12px;
          z-index: 1;
        }

        .bot-sphere {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(79, 70, 229, 0.2), rgba(124, 58, 237, 0.2));
          display: flex;
          align-items: center;
          justify-content: center;
          animation: pulse-glowing 2.5s infinite;
        }

        .md-avatar-dashboard {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(124, 58, 237, 0.2);
          box-shadow: 0 8px 16px rgba(124, 58, 237, 0.1);
        }

        .glow-bot {
          color: var(--primary-color);
        }

        /* Bottom Row splits styling */
        .dashboard-bottom-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }

        .card {
          background-color: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-sm);
        }

        /* Combined Left split panel (Timeline + Channels) */
        .split-card-container {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 20px;
          padding: 24px;
        }

        .split-panel-left, .split-panel-right {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .split-panel-divider {
          width: 1px;
          background-color: var(--border-color);
          height: 100%;
        }

        .activity-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-icon-accent {
          color: var(--primary-color);
        }

        .header-icon-accent.purple {
          color: #8b5cf6;
        }

        .activity-card-header h3 {
          font-family: var(--font-display);
          font-size: 15.5px;
          font-weight: 600;
          color: var(--text-primary);
        }

        /* Compact Timeline feed */
        .activity-timeline {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 4px;
        }

        .timeline-item {
          display: flex;
          gap: 12px;
          position: relative;
        }

        .timeline-marker {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 12px;
        }

        .marker-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: var(--text-muted);
        }

        .marker-dot.pending { background-color: var(--warning); }
        .marker-dot.primary { background-color: var(--primary-color); }
        .marker-dot.secondary { background-color: var(--success); }

        .marker-line {
          width: 1px;
          background-color: var(--border-color);
          flex-grow: 1;
          margin: 4px 0;
          min-height: 35px;
        }

        .timeline-item:last-child .marker-line {
          display: none;
        }

        .timeline-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .timeline-content .activity-text {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          line-height: 1.4;
        }

        .timeline-meta {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .badge-pill {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 12px;
          font-weight: 600;
        }

        .badge-pill.pending { background-color: rgba(245, 133, 51, 0.08); color: var(--warning); }
        .badge-pill.primary { background-color: rgba(79, 70, 229, 0.08); color: var(--primary-color); }
        .badge-pill.secondary { background-color: rgba(16, 185, 129, 0.08); color: var(--success); }

        /* Compact Channels list */
        .channels-compact-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .channel-compact-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .channel-compact-row:hover {
          background-color: var(--bg-primary);
        }

        .channel-info-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .hash-icon {
          color: var(--text-muted);
        }

        .channel-names-desc {
          display: flex;
          flex-direction: column;
          max-width: 140px;
        }

        .channel-title-compact {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .channel-desc-compact {
          font-size: 10px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .channel-compact-badge {
          background-color: var(--primary-color);
          color: #fff;
          font-size: 9px;
          font-weight: bold;
          padding: 1px 6px;
          border-radius: 10px;
        }

        .alert-dot-pulse {
          width: 6px;
          height: 6px;
          background-color: #ef4444;
          border-radius: 50%;
          box-shadow: 0 0 6px #ef4444;
          animation: pulse-glowing 2s infinite;
        }

        .alert-row {
          border-left: 2px solid #ef4444;
          background-color: rgba(239, 68, 68, 0.02);
        }

        /* Suggested Prompts Grid */
        .prompts-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .prompt-item-card {
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 12px 14px;
          text-align: left;
          cursor: pointer;
          transition: var(--transition-smooth);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .prompt-item-card:hover {
          border-color: #8b5cf6;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.08);
          transform: translateY(-2px);
        }

        .prompt-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .prompt-desc {
          font-size: 11px;
          color: var(--text-muted);
        }

        /* Right Stats Sidebar */
        .right-stats-panel {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .stat-card {
          background-color: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 20px;
          box-shadow: var(--shadow-sm);
        }

        .circular-gauge-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .gauge-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .gauge-header h4 {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .gauge-body {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .svg-ring-container {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .svg-ring {
          transform: rotate(-90deg);
        }

        .svg-ring-bg {
          stroke: var(--border-color);
        }

        .svg-ring-fill {
          stroke-linecap: round;
          transition: stroke-dashoffset 0.8s ease-in-out;
        }

        .gauge-number-center {
          position: absolute;
          font-size: 12.5px;
          font-weight: 700;
          font-family: var(--font-display);
          color: var(--text-primary);
        }

        .gauge-details {
          flex: 1;
        }

        .gauge-desc {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.4;
        }

        /* Modern Stat Boxes */
        .stat-boxes-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .stat-box-modern {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          border-radius: var(--radius-md);
          background-color: var(--bg-secondary);
          border: 1px solid var(--border-color);
          transition: var(--transition-smooth);
        }

        .stat-box-modern:hover {
          transform: translateX(4px);
        }

        .stat-box-modern.pending {
          border-left: 4px solid var(--warning);
          background: linear-gradient(90deg, rgba(245, 133, 51, 0.03), transparent);
        }

        .stat-box-modern.answered {
          border-left: 4px solid var(--success);
          background: linear-gradient(90deg, rgba(16, 185, 129, 0.03), transparent);
        }

        .stat-box-modern.autopilot {
          border-left: 4px solid var(--primary-color);
          background: linear-gradient(90deg, rgba(79, 70, 229, 0.03), transparent);
        }

        .stat-icon-wrapper-modern {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
        }

        .pending .stat-icon-wrapper-modern { color: var(--warning); }
        .answered .stat-icon-wrapper-modern { color: var(--success); }
        .autopilot .stat-icon-wrapper-modern { color: var(--primary-color); }

        .stat-info-modern {
          display: flex;
          flex-direction: column;
        }

        .number-label {
          font-size: 20px;
          font-weight: 700;
          font-family: var(--font-display);
          color: var(--text-primary);
        }

        .title-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          margin-top: 1px;
        }

        /* Teammates online list */
        .teammates-presence-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .teammates-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .teammate-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px 0;
        }

        .teammate-avatar-wrapper {
          position: relative;
          display: flex;
        }

        .teammate-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
        }

        .teammate-avatar.text {
          background-color: var(--border-color);
          color: var(--text-secondary);
        }

        .teammate-avatar.image {
          object-fit: cover;
          border: 1px solid var(--border-color);
        }

        .teammate-avatar.ai-avatar {
          background-color: rgba(79, 70, 229, 0.1);
          color: var(--primary-color);
        }

        .status-dot {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1.5px solid var(--bg-secondary);
        }

        .status-dot.online {
          background-color: var(--success);
          box-shadow: 0 0 6px var(--success);
        }

        .status-dot.ai {
          background-color: var(--primary-color);
          box-shadow: 0 0 6px var(--primary-color);
          animation: pulse-glowing 2.5s infinite;
        }

        .status-dot.away { background-color: var(--warning); }
        .status-dot.offline { background-color: var(--text-muted); }

        .teammate-info {
          display: flex;
          flex-direction: column;
        }

        .teammate-name {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .teammate-role {
          font-size: 10.5px;
          color: var(--text-muted);
        }

        .loading-state {
          padding: 40px;
          text-align: center;
          color: var(--text-muted);
          font-size: 13px;
        }

        /* Animations */
        @keyframes typing-flash {
          from { border-right-color: transparent; }
          to { border-right-color: #60a5fa; }
        }

        @keyframes spin-pulse {
          0% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.1) rotate(180deg); }
          100% { transform: scale(1) rotate(360deg); }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes pulse-glowing {
          0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(79, 70, 229, 0); }
          100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
        }

        @media (max-width: 1024px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
          .hero-content {
            grid-template-columns: 1fr;
          }
          .split-card-container {
            grid-template-columns: 1fr;
          }
          .split-panel-divider {
            width: 100%;
            height: 1px;
          }
        }
      `}</style>
    </div>
  );
}

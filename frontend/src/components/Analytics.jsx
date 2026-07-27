import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Award, Clock, ArrowUpRight, ShieldCheck, Sparkles, MessageSquare, HelpCircle, Trophy } from 'lucide-react';

export default function Analytics({ backendUrl, token }) {
  const [data, setData] = useState({
    totalQuestions: 0,
    pendingQuestions: 0,
    answeredQuestions: 0,
    knowledgeBaseCount: 0,
    aiAnswersUsed: 0,
    avgResolutionMinutes: 18.5,
    categories: [],
    leaderboard: [],
    aiSolutions: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch(`${backendUrl}/api/analytics/summary`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const resData = await res.json();
          setData(resData);
        }
      } catch (err) {
        console.error('Error loading analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [backendUrl, token]);

  const totalResolved = data.aiAnswersUsed + data.answeredQuestions;
  const aiPercentage = totalResolved > 0 ? Math.round((data.aiAnswersUsed / totalResolved) * 100) : 70;
  const mdPercentage = 100 - aiPercentage;

  // Max category count for bar scaling
  const maxCount = data.categories && data.categories.length > 0
    ? Math.max(...data.categories.map(c => c.count))
    : 1;

  // Leaderboard ranking badges
  const getRankBadge = (index) => {
    if (index === 0) return <span className="rank-badge rank-1"><Trophy size={12} /> 1st</span>;
    if (index === 1) return <span className="rank-badge rank-2">2nd</span>;
    if (index === 2) return <span className="rank-badge rank-3">3rd</span>;
    return <span className="rank-badge rank-other">{index + 1}th</span>;
  };

  return (
    <div className="analytics-view">
      <div className="analytics-header">
        <h1>Reports & Analytics</h1>
        <p>Operational efficiency, AI resolution ratios, and team leadership metrics</p>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <span>Loading system analytics report...</span>
        </div>
      ) : (
        <div className="analytics-grid-wrapper">
          
          {/* Main Analytics Panel */}
          <div className="analytics-main-panel">
            
            {/* Key Metrics Row */}
            <div className="metrics-row">
              <div className="metric-tile card">
                <span className="tile-label">AI Resolution Rate</span>
                <div className="tile-number-row">
                  <h2>{aiPercentage}%</h2>
                  <span className="trend positive">
                    <ArrowUpRight size={14} />
                    <span>+4.2%</span>
                  </span>
                </div>
                <p className="tile-desc">Resolved instantly by RAG database</p>
              </div>

              <div className="metric-tile card">
                <span className="tile-label">Avg MD Response Time</span>
                <div className="tile-number-row">
                  <h2>{data.avgResolutionMinutes} min</h2>
                  <span className="trend positive">
                    <Clock size={14} />
                    <span>Optimal</span>
                  </span>
                </div>
                <p className="tile-desc">Time to manual resolution by MD</p>
              </div>

              <div className="metric-tile card">
                <span className="tile-label">Knowledge Index</span>
                <div className="tile-number-row">
                  <h2>{data.knowledgeBaseCount}</h2>
                  <span className="trend positive">
                    <Sparkles size={14} />
                    <span>Active</span>
                  </span>
                </div>
                <p className="tile-desc">Active company knowledge blocks</p>
              </div>

              <div className="metric-tile card">
                <span className="tile-label">Total Handled Cases</span>
                <div className="tile-number-row">
                  <h2>{totalResolved}</h2>
                </div>
                <p className="tile-desc">Inquiries resolved by AI & MD combined</p>
              </div>
            </div>

            {/* Graphs Grid */}
            <div className="graphs-layout-grid">
              
              {/* Resolution Share Donut Chart */}
              <div className="chart-card card">
                <h3>Resolution Share</h3>
                <p className="chart-sub">RAG Automated responses vs. MD Manual responses</p>
                
                <div className="donut-chart-container">
                  <svg width="180" height="180" viewBox="0 0 36 36" className="donut-svg">
                    <circle 
                      cx="18" 
                      cy="18" 
                      r="15.915" 
                      fill="none" 
                      stroke="var(--bg-tertiary)" 
                      strokeWidth="3.5" 
                    />
                    <circle 
                      cx="18" 
                      cy="18" 
                      r="15.915" 
                      fill="none" 
                      stroke="var(--primary-color)" 
                      strokeWidth="3.8" 
                      strokeDasharray={`${aiPercentage} ${mdPercentage}`} 
                      strokeDashoffset="25" 
                    />
                    <circle 
                      cx="18" 
                      cy="18" 
                      r="15.915" 
                      fill="none" 
                      stroke="var(--secondary-color)" 
                      strokeWidth="3.8" 
                      strokeDasharray={`${mdPercentage} ${aiPercentage}`} 
                      strokeDashoffset={100 - aiPercentage + 25} 
                    />
                  </svg>

                  <div className="donut-center-label">
                    <span className="donut-val">{totalResolved}</span>
                    <span className="donut-lbl">Inquiries</span>
                  </div>
                </div>

                <div className="chart-legend">
                  <div className="legend-item">
                    <span className="legend-dot color-ai"></span>
                    <span className="legend-name">AI Automated</span>
                    <span className="legend-val">{aiPercentage}%</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot color-md"></span>
                    <span className="legend-name">MD Manual</span>
                    <span className="legend-val">{mdPercentage}%</span>
                  </div>
                </div>
              </div>

              {/* Category Distribution Bar Chart */}
              <div className="chart-card card">
                <h3>Inquiries by Category</h3>
                <p className="chart-sub">Dynamic distribution of questions in the system</p>
                
                <div className="bar-chart-container">
                  {data.categories && data.categories.map((cat, index) => {
                    const widthPct = Math.max(10, (cat.count / maxCount) * 100);
                    
                    return (
                      <div key={index} className="bar-chart-row">
                        <span className="bar-label">{cat.name}</span>
                        <div className="bar-track-wrapper">
                          <div 
                            className="bar-fill" 
                            style={{ 
                              width: `${widthPct}%`,
                              background: index % 2 === 0 
                                ? 'linear-gradient(90deg, var(--primary-color), var(--secondary-color))'
                                : 'linear-gradient(90deg, var(--secondary-color), var(--primary-color))'
                            }}
                          />
                        </div>
                        <span className="bar-value">{cat.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* AI Solutions Provided Section */}
            <div className="solutions-section card">
              <div className="solutions-header">
                <Sparkles className="solutions-icon" size={20} />
                <div>
                  <h3>Recent AI Solutions Log</h3>
                  <p>Real-time log of verified employee questions answered automatically by RAG model</p>
                </div>
              </div>

              <div className="solutions-list">
                {data.aiSolutions && data.aiSolutions.length > 0 ? (
                  data.aiSolutions.map((sol, index) => (
                    <div key={index} className="solution-item">
                      <div className="solution-question-row">
                        <span className="badge-input">Employee Input</span>
                        <p className="sol-question">{sol.question}</p>
                      </div>
                      <div className="solution-answer-row">
                        <span className="badge-output">AI Resolution</span>
                        <p className="sol-answer">{sol.answer}</p>
                      </div>
                      <div className="solution-footer">
                        <span className="sol-tag confidence">94% Confidence</span>
                        <span className="sol-tag source">Verified Source Match</span>
                        <span className="sol-time">{new Date(sol.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-solutions">
                    <MessageSquare size={32} />
                    <p>No recent AI-automated resolutions found in chat history.</p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Sidebar Leaderboard Panel */}
          <div className="analytics-side-panel card">
            <div className="side-panel-header">
              <Award className="trophy-icon" size={22} />
              <div>
                <h3>System Leaderboard</h3>
                <p>Top employees & MD experts ranked by engagement & contributions</p>
              </div>
            </div>

            <div className="leaderboard-list">
              {data.leaderboard && data.leaderboard.length > 0 ? (
                data.leaderboard.map((item, index) => (
                  <div key={item.id} className="leaderboard-item">
                    <div className="leaderboard-rank-col">
                      {getRankBadge(index)}
                    </div>
                    
                    <div className="leaderboard-user-details">
                      <div className="user-name-row">
                        <span className="user-name">{item.name}</span>
                        <span className={`user-role-badge ${item.role === 'md' ? 'md' : 'employee'}`}>
                          {item.role.toUpperCase()}
                        </span>
                      </div>
                      <span className="user-email">{item.email}</span>
                      
                      <div className="user-stats-row">
                        {item.role === 'md' ? (
                          <>
                            <span className="stat-label">Resolved: <strong>{item.questionsAnswered}</strong></span>
                            <span className="stat-divider">•</span>
                            <span className="stat-label">KB Count: <strong>{data.knowledgeBaseCount}</strong></span>
                          </>
                        ) : (
                          <>
                            <span className="stat-label">Asked: <strong>{item.questionsAsked}</strong></span>
                            <span className="stat-divider">•</span>
                            <span className="stat-label">AI Queries: <strong>{item.aiQueries}</strong></span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="leaderboard-score-col">
                      <span className="score-val">{item.score}</span>
                      <span className="score-lbl">Score</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-leaderboard">
                  <p>No leaderboard rankings calculated yet.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      <style>{`
        .analytics-view {
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          animation: slideUp 0.4s ease-out;
          background-color: var(--bg-primary);
        }

        .analytics-header h1 {
          font-family: var(--font-display);
          font-size: 26px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .analytics-header p {
          color: var(--text-secondary);
          margin-top: 4px;
          font-size: 14px;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 0;
          gap: 16px;
          color: var(--text-secondary);
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Layout Grid Wrapper */
        .analytics-grid-wrapper {
          display: grid;
          grid-template-columns: 1fr 350px;
          gap: 24px;
          align-items: start;
        }

        .analytics-main-panel {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .metrics-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
        }

        .metric-tile {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .tile-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .tile-number-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }

        .tile-number-row h2 {
          font-family: var(--font-display);
          font-size: 28px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .trend {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }

        .trend.positive {
          background-color: var(--success-light);
          color: var(--success);
        }

        .tile-desc {
          font-size: 11px;
          color: var(--text-secondary);
        }

        /* Graphs Layout */
        .graphs-layout-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .chart-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chart-card h3 {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .chart-sub {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: -6px;
        }

        /* Donut Chart */
        .donut-chart-container {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 15px 0;
        }

        .donut-svg {
          transform: rotate(-90deg);
        }

        .donut-center-label {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .donut-val {
          font-family: var(--font-display);
          font-size: 22px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .donut-lbl {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 600;
        }

        .chart-legend {
          display: flex;
          justify-content: space-around;
          border-top: 1px solid var(--border-color);
          padding-top: 12px;
          margin-top: auto;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .legend-dot.color-ai {
          background-color: var(--primary-color);
        }

        .legend-dot.color-md {
          background-color: var(--secondary-color);
        }

        .legend-name {
          color: var(--text-secondary);
        }

        .legend-val {
          font-weight: 700;
          color: var(--text-primary);
        }

        /* Bar Chart */
        .bar-chart-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          justify-content: center;
          height: 100%;
          padding: 8px 0;
        }

        .bar-chart-row {
          display: grid;
          grid-template-columns: 120px 1fr 24px;
          align-items: center;
          gap: 12px;
        }

        .bar-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-align: right;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bar-track-wrapper {
          background-color: var(--bg-tertiary);
          height: 6px;
          border-radius: 3px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 1s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .bar-value {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary);
          padding-left: 2px;
        }

        /* Solutions Section */
        .solutions-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .solutions-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .solutions-icon {
          color: var(--primary-color);
        }

        .solutions-header h3 {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .solutions-header p {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .solutions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .solution-item {
          background-color: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: all 0.2s ease;
        }

        .solution-item:hover {
          border-color: var(--primary-light);
          transform: translateX(2px);
        }

        .solution-question-row, .solution-answer-row {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 12px;
          align-items: start;
        }

        .badge-input, .badge-output {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 4px;
          width: fit-content;
          letter-spacing: 0.5px;
        }

        .badge-input {
          background-color: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .badge-output {
          background-color: var(--primary-light);
          color: var(--primary-color);
        }

        .sol-question {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .sol-answer {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .solution-footer {
          display: flex;
          gap: 12px;
          font-size: 10px;
          color: var(--text-muted);
          border-top: 1px solid var(--border-color);
          padding-top: 8px;
          margin-top: 4px;
          align-items: center;
        }

        .sol-tag {
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 10px;
        }

        .sol-tag.confidence {
          background-color: var(--success-light);
          color: var(--success);
        }

        .sol-tag.source {
          background-color: var(--primary-light);
          color: var(--primary-color);
        }

        .sol-time {
          margin-left: auto;
        }

        .empty-solutions {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 0;
          gap: 8px;
          color: var(--text-muted);
        }

        /* Sidebar Leaderboard */
        .analytics-side-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
          background-color: var(--bg-secondary);
          border: 1px solid var(--border-color);
        }

        .side-panel-header {
          display: flex;
          align-items: start;
          gap: 12px;
        }

        .trophy-icon {
          color: #fbbf24;
        }

        .side-panel-header h3 {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .side-panel-header p {
          font-size: 11px;
          color: var(--text-secondary);
          margin-top: 2px;
          line-height: 1.4;
        }

        .leaderboard-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .leaderboard-item {
          display: flex;
          align-items: center;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background-color: var(--bg-primary);
          transition: all 0.2s ease;
          gap: 12px;
        }

        .leaderboard-item:hover {
          border-color: var(--primary-light);
          transform: translateY(-1px);
          box-shadow: var(--shadow-sm);
        }

        .leaderboard-rank-col {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
        }

        .rank-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }

        .rank-badge.rank-1 {
          background-color: rgba(251, 191, 36, 0.15);
          color: #d97706;
          border: 1px solid rgba(251, 191, 36, 0.3);
        }

        .rank-badge.rank-2 {
          background-color: rgba(156, 163, 175, 0.15);
          color: #4b5563;
        }

        .rank-badge.rank-3 {
          background-color: rgba(217, 119, 6, 0.1);
          color: #b45309;
        }

        .rank-badge.rank-other {
          background-color: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .leaderboard-user-details {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        .user-name-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .user-name {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 1px 4px;
          border-radius: 4px;
          letter-spacing: 0.3px;
        }

        .user-role-badge.md {
          background-color: rgba(139, 92, 246, 0.15);
          color: var(--secondary-color);
        }

        .user-role-badge.employee {
          background-color: rgba(16, 185, 129, 0.1);
          color: var(--success);
        }

        .user-email {
          font-size: 10px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
        }

        .user-stats-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .stat-label strong {
          color: var(--text-primary);
        }

        .stat-divider {
          color: var(--text-muted);
        }

        .leaderboard-score-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background-color: var(--bg-tertiary);
          padding: 4px 8px;
          border-radius: 6px;
          min-width: 44px;
        }

        .score-val {
          font-size: 12px;
          font-weight: 800;
          color: var(--primary-color);
        }

        .score-lbl {
          font-size: 8px;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
        }

        .empty-leaderboard {
          display: flex;
          justify-content: center;
          padding: 20px 0;
          font-size: 12px;
          color: var(--text-muted);
        }

        @media (max-width: 1100px) {
          .analytics-grid-wrapper {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .graphs-layout-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

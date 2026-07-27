import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, MessageSquare, Send, CheckCircle2, User, AlertCircle, Zap, Mic, Paperclip } from 'lucide-react';
import { io } from 'socket.io-client';
import FileViewerModal from './FileViewerModal';

export default function MDQueue({ user, backendUrl, token }) {
  const [questions, setQuestions] = useState([]);
  const [filterPriority, setFilterPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [loading, setLoading] = useState(true);

  // Reply popup/panel state
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [activeViewerFile, setActiveViewerFile] = useState(null);
  const socketRef = useRef(null);

  // Voice recording states
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const renderMessageText = (messageText) => {
    if (!messageText) return '';

    const imageRegex = /\[IMAGE:(.*?)\|(.*?)\]/gi;
    const fileRegex = /\[FILE:(.*?)\|(.*?)\]/gi;
    
    const images = [];
    const files = [];
    
    let cleanText = messageText;
    
    cleanText = cleanText.replace(imageRegex, (match, url, name) => {
      images.push({ url, name });
      return '';
    });

    cleanText = cleanText.replace(fileRegex, (match, url, name) => {
      files.push({ url, name });
      return '';
    });

    cleanText = cleanText.trim();

    return (
      <div className="message-content-wrapper">
        {cleanText && <div className="message-text-body" style={{ whiteSpace: 'pre-wrap' }}>{cleanText}</div>}
        
        {images.length > 0 && (
          <div className="message-images-grid" style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {images.map((img, idx) => (
              <div key={idx} className="chat-image-attachment" style={{ display: 'inline-block' }}>
                <img 
                  src={img.url} 
                  alt={img.name} 
                  className="attached-image-preview" 
                  style={{ maxWidth: '180px', maxHeight: '120px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border-color)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveViewerFile({ url: img.url, name: img.name });
                  }} 
                />
                <div className="attachment-filename" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'center', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</div>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="message-files-grid" style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {files.map((file, idx) => (
              <a 
                key={idx} 
                href={file.url} 
                className="chat-file-attachment-card" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '6px 10px', 
                  backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: 'var(--radius-md)', 
                  textDecoration: 'none',
                  color: 'inherit',
                  maxWidth: '220px'
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveViewerFile({ url: file.url, name: file.name });
                }}
              >
                <Paperclip size={14} style={{ color: 'var(--primary-color)' }} />
                <div className="file-info" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="file-name" style={{ fontSize: '10px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  <span className="file-download-text" style={{ fontSize: '8px', color: 'var(--text-muted)' }}>Click to view/download</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        stream.getTracks().forEach(track => track.stop());
        await handleAudioUpload(audioBlob);
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error('Error starting media recorder:', err);
      alert('Could not access microphone. Please check browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleAudioUpload = async (blob) => {
    setTranscribing(true);
    const formData = new FormData();
    formData.append('audio', blob, 'audio.wav');

    try {
      const response = await fetch(`${backendUrl}/api/chat/voice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await response.json();
      
      if (data.text) {
        setReplyText(prev => prev ? `${prev} ${data.text}` : data.text);
      }
    } catch (err) {
      console.error('Error transcribing audio:', err);
    } finally {
      setTranscribing(false);
    }
  };

  // Fetch pending questions
  const fetchQueue = async () => {
    setLoading(true);
    try {
      let url = `${backendUrl}/api/questions?status=pending&sort=${sortOrder}`;
      if (filterPriority) {
        url += `&priority=${filterPriority}`;
      }
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setQuestions(data);
      }
    } catch (err) {
      console.error('Error fetching questions queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();

    // Socket listeners for real-time queue additions
    socketRef.current = io(backendUrl);
    socketRef.current.emit('join', { userId: user.id, role: user.role });

    socketRef.current.on('new_queue_item', (newQuestion) => {
      setQuestions(prev => [newQuestion, ...prev]);
    });

    socketRef.current.on('queue_item_updated', ({ id }) => {
      setQuestions(prev => prev.filter(q => q.id !== id));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [backendUrl, token, filterPriority, sortOrder]);

  // Trigger suggestion when reply panel opens
  const handleOpenReply = async (question) => {
    setActiveQuestion(question);
    setReplyText('');
    setAiSuggestion(null);
    setLoadingSuggestion(true);

    try {
      const res = await fetch(`${backendUrl}/api/questions/${question.id}/suggest`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestion) {
          setAiSuggestion(data);
        }
      }
    } catch (err) {
      console.error('Error fetching suggestion:', err);
    } finally {
      setLoadingSuggestion(false);
    }
  };

  // Submit Answer
  const handleSubmitReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !activeQuestion) return;

    setSubmittingReply(true);
    try {
      const res = await fetch(`${backendUrl}/api/questions/${activeQuestion.id}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ answer: replyText })
      });

      if (res.ok) {
        // Remove from list
        setQuestions(prev => prev.filter(q => q.id !== activeQuestion.id));
        setActiveQuestion(null);
        setReplyText('');
      } else {
        alert('Failed to send reply.');
      }
    } catch (err) {
      console.error('Submit reply error:', err);
    } finally {
      setSubmittingReply(false);
    }
  };

  // Filter local state questions based on search query
  const filteredQuestions = questions.filter(q => {
    const term = searchQuery.toLowerCase();
    return (
      q.question_original.toLowerCase().includes(term) ||
      q.question_normalized.toLowerCase().includes(term) ||
      (q.employee_name && q.employee_name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="md-queue-view">
      <div className="queue-header-row">
        <div className="queue-title-block">
          <h1>Questions Queue</h1>
          <p>Pending questions from employees awaiting verification</p>
        </div>
        <div className="queue-count-badge">
          <span className="badge badge-secondary">{filteredQuestions.length} pending</span>
        </div>
      </div>

      {/* Filters & Search Row */}
      <div className="filter-bar">
        <div className="search-box-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="input-field search-input"
            placeholder="Search questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filters-group">
          <div className="filter-select-wrapper">
            <Filter size={14} className="select-icon" />
            <select
              className="input-field select-input"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>

          <select
            className="input-field select-input"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Queue and Reply Panel */}
      <div className="queue-main-grid">
        <div className="queue-list-container">
          {loading ? (
            <div className="loading-state">Loading pending queue...</div>
          ) : filteredQuestions.length === 0 ? (
            <div className="empty-queue-state">
              <CheckCircle2 size={48} className="success-icon" />
              <h3>Queue Clear!</h3>
              <p>No pending questions from employees at the moment.</p>
            </div>
          ) : (
            <div className="queue-cards-list">
              {filteredQuestions.map((q, index) => {
                let priorityClass = 'badge-success'; // low
                if (q.priority === 'high') priorityClass = 'badge-error';
                if (q.priority === 'medium') priorityClass = 'badge-pending';

                // Format date nicely
                const dateStr = new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return (
                  <div 
                    key={q.id} 
                    className={`queue-card ${activeQuestion?.id === q.id ? 'active' : ''}`}
                    onClick={() => handleOpenReply(q)}
                  >
                    <div className="card-top-row">
                      <span className="card-number">{index + 1}.</span>
                      <div className="question-text">{renderMessageText(q.question_original)}</div>
                    </div>

                    <div className="card-bottom-row">
                      <div className="user-info-meta">
                        <User size={12} />
                        <span>{q.employee_name || 'Ravi Kumar'}</span>
                        <span className="divider">•</span>
                        <span>{dateStr}</span>
                      </div>
                      
                      <div className="card-actions-right">
                        <span className={`badge ${priorityClass}`}>{q.priority}</span>
                        <button className="btn btn-primary reply-action-btn">
                          <MessageSquare size={14} />
                          <span>Reply</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reply Area (Saves space and keeps focus) */}
        {activeQuestion && (
          <div className="reply-panel card">
            <div className="reply-panel-header">
              <h3>Answer Question</h3>
              <button className="close-panel-btn" onClick={() => setActiveQuestion(null)}>×</button>
            </div>

            <div className="original-question-display">
              <span className="display-label">Original:</span>
              <div className="display-text">{renderMessageText(activeQuestion.question_original)}</div>
              
              <span className="display-label">Normalized:</span>
              <p className="display-text-normalized">"{activeQuestion.question_normalized}"</p>
            </div>

            {/* AI Suggestion box */}
            <div className="ai-suggestion-box">
              <div className="suggestion-header">
                <Zap size={14} className="suggest-zap-icon" />
                <span>AI Typing Suggestion</span>
              </div>

              {loadingSuggestion ? (
                <div className="suggestion-loading">Finding semantic matches...</div>
              ) : aiSuggestion ? (
                <div className="suggestion-content">
                  <p className="suggestion-text">"{aiSuggestion.suggestion}"</p>
                  <div className="suggestion-meta">
                    <span>Confidence: {(aiSuggestion.confidence * 100).toFixed(0)}%</span>
                    <button 
                      className="btn-use-suggestion"
                      onClick={() => setReplyText(aiSuggestion.suggestion)}
                    >
                      Insert Suggestion
                    </button>
                  </div>
                </div>
              ) : (
                <div className="suggestion-empty">No highly confident matches in Knowledge Base. Write response manually.</div>
              )}
            </div>

            <form onSubmit={handleSubmitReply} className="reply-form">
              <div className="textarea-wrapper" style={{ position: 'relative' }}>
                <textarea
                  className="input-field reply-textarea"
                  rows={5}
                  placeholder={recording ? "Recording voice... Speak now" : transcribing ? "Transcribing voice..." : "Type your verification or manual response here..."}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={recording || transcribing}
                  required
                  style={{ paddingRight: '48px' }}
                />
                <button
                  type="button"
                  className={`btn-icon mic-record-btn ${recording ? 'recording' : ''}`}
                  onClick={recording ? stopRecording : startRecording}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    bottom: '12px',
                    width: '36px',
                    height: '36px',
                    zIndex: 10
                  }}
                  title="Record voice response"
                >
                  {recording ? (
                    <div className="voice-waves">
                      <span></span><span></span><span></span>
                    </div>
                  ) : (
                    <Mic size={16} />
                  )}
                </button>
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setActiveQuestion(null)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={!replyText.trim() || submittingReply}
                >
                  <Send size={14} />
                  <span>{submittingReply ? 'Sending...' : 'Mark Answered'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {activeViewerFile && (
        <FileViewerModal 
          file={activeViewerFile} 
          onClose={() => setActiveViewerFile(null)} 
        />
      )}

      <style>{`
        .md-queue-view {
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          height: calc(100vh - 89px);
          overflow: hidden;
          animation: slideUp 0.4s ease-out;
        }

        .queue-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .queue-title-block h1 {
          font-family: var(--font-display);
          font-size: 26px;
          font-weight: 700;
        }

        .queue-title-block p {
          color: var(--text-secondary);
          margin-top: 4px;
          font-size: 14px;
        }

        .filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          background-color: var(--bg-secondary);
          padding: 16px 24px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
        }

        .search-box-wrapper {
          position: relative;
          flex: 1;
          max-width: 400px;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .search-input {
          padding-left: 40px;
        }

        .filters-group {
          display: flex;
          gap: 12px;
        }

        .filter-select-wrapper {
          position: relative;
        }

        .select-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .select-input {
          padding-left: 32px;
          padding-right: 28px;
          background-color: var(--bg-primary);
          cursor: pointer;
          font-weight: 500;
          min-width: 155px;
        }

        .queue-main-grid {
          display: grid;
          grid-template-columns: 3fr 2fr;
          gap: 24px;
          flex: 1;
          overflow: hidden;
        }

        /* If no active question, queue takes full width */
        .queue-main-grid:not(:has(.reply-panel)) {
          grid-template-columns: 1fr;
        }

        .queue-list-container {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-right: 4px;
        }

        .empty-queue-state {
          text-align: center;
          padding: 64px 32px;
          background-color: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
        }

        .success-icon {
          color: var(--success);
          margin-bottom: 16px;
        }

        .queue-cards-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .queue-card {
          background-color: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 20px;
          cursor: pointer;
          transition: var(--transition-smooth);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .queue-card:hover {
          box-shadow: var(--shadow-sm);
          border-color: var(--border-hover);
        }

        .queue-card.active {
          border-color: var(--primary-color);
          background-color: var(--primary-light);
        }

        .card-top-row {
          display: flex;
          gap: 10px;
        }

        .card-number {
          font-weight: 700;
          color: var(--text-muted);
        }

        .question-text {
          font-size: 15px;
          font-weight: 600;
          line-height: 1.5;
          color: var(--text-primary);
        }

        .card-bottom-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid var(--border-color);
          padding-top: 12px;
        }

        .user-info-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .divider {
          color: var(--text-muted);
        }

        .card-actions-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .reply-action-btn {
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          font-size: 12px;
        }

        /* Reply Panel */
        .reply-panel {
          display: flex;
          flex-direction: column;
          gap: 18px;
          overflow-y: auto;
          animation: slideUp 0.3s ease-out;
          max-height: 100%;
        }

        .reply-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 12px;
        }

        .reply-panel-header h3 {
          font-family: var(--font-display);
          font-size: 17px;
          font-weight: 700;
        }

        .close-panel-btn {
          border: none;
          background: none;
          font-size: 24px;
          color: var(--text-muted);
          cursor: pointer;
          line-height: 1;
        }

        .close-panel-btn:hover {
          color: var(--text-primary);
        }

        .original-question-display {
          background-color: var(--bg-primary);
          padding: 14px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .display-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-muted);
          letter-spacing: 0.5px;
        }

        .display-text {
          font-size: 13px;
          color: var(--text-primary);
          font-style: italic;
        }

        .display-text-normalized {
          font-size: 13px;
          color: var(--primary-color);
          font-weight: 500;
        }

        /* AI Suggestion Box */
        .ai-suggestion-box {
          border: 1px dashed var(--primary-color);
          background-color: var(--primary-light);
          padding: 14px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .suggestion-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: var(--primary-color);
        }

        .suggest-zap-icon {
          animation: pulse-glowing 2s infinite;
        }

        .suggestion-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .suggestion-text {
          font-size: 13px;
          line-height: 1.4;
          color: var(--text-primary);
        }

        .suggestion-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: var(--text-muted);
        }

        .btn-use-suggestion {
          border: none;
          background: var(--primary-color);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-use-suggestion:hover {
          background-color: var(--primary-hover);
        }

        .suggestion-loading, .suggestion-empty {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          padding: 10px 0;
        }

        .mic-record-btn.recording {
          background-color: var(--error-light);
          color: var(--error);
          border-color: var(--error);
        }

        /* Voice waves animation */
        .voice-waves {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          height: 14px;
        }

        .voice-waves span {
          width: 3px;
          height: 100%;
          background-color: var(--error);
          border-radius: 2px;
          animation: voiceWave 1.2s ease-in-out infinite;
        }

        .voice-waves span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .voice-waves span:nth-child(3) {
          animation-delay: 0.3s;
        }

        .reply-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
        }

        .reply-textarea {
          resize: vertical;
          font-size: 14px;
          line-height: 1.5;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }
      `}</style>
    </div>
  );
}

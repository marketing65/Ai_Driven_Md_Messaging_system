import React, { useState, useEffect } from 'react';
import { Search, BookOpen, Plus, Save, Award, CheckCircle2, Clock, Edit2, Trash2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function KnowledgeBase({ user, backendUrl, token }) {
  const [entries, setEntries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState(null);
  
  // Create / Edit mode states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');

  // Bulk Selection states
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const isMD = true; // Allowed for all users during testing and management

  const fetchKnowledge = async () => {
    setLoading(true);
    try {
      const url = `${backendUrl}/api/analytics/search?q=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch (err) {
      console.error('Error fetching knowledge:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKnowledge();
  }, [backendUrl, token, searchQuery]);

  // Set default selection when entries load
  useEffect(() => {
    if (entries.length > 0) {
      if (!selectedEntry) {
        setSelectedEntry(entries[0]);
      } else {
        // If selectedEntry was updated or deleted, match it in the fresh entries list
        const found = entries.find(e => e.id === selectedEntry.id && e.source === selectedEntry.source);
        if (!found) {
          setSelectedEntry(entries[0]);
        }
      }
    } else {
      setSelectedEntry(null);
    }
  }, [entries]);

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    setSubmitting(true);
    setSuccessMsg('');
    try {
      const res = await fetch(`${backendUrl}/api/analytics/knowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question: newQuestion, answer: newAnswer })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create page');
      }

      setSuccessMsg('Successfully added new manual page to RAG vector database!');
      setNewQuestion('');
      setNewAnswer('');
      setTimeout(() => {
        setShowAddForm(false);
        setSuccessMsg('');
        fetchKnowledge();
      }, 2000);
    } catch (err) {
      console.error('Error adding KB entry:', err);
      alert(err.message || 'Error adding KB entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editQuestion.trim() || !editAnswer.trim() || !selectedEntry) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${backendUrl}/api/analytics/knowledge/${selectedEntry.source}/${selectedEntry.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question: editQuestion, answer: editAnswer })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update page');
      }

      setIsEditing(false);
      
      // Update selected entry locally
      const updated = {
        ...selectedEntry,
        question: editQuestion,
        answer: editAnswer
      };
      setSelectedEntry(updated);
      
      // Refresh entries list to pull the updated data
      fetchKnowledge();
      alert('Knowledge page updated successfully!');
    } catch (err) {
      console.error('Error updating KB entry:', err);
      alert(err.message || 'Error updating KB entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = async (entry) => {
    if (!entry) return;
    const confirm = window.confirm(
      `Are you sure you want to permanently delete page: "${entry.question.substring(0, 40)}..."? This will remove it from the AI semantic index.`
    );
    if (!confirm) return;

    try {
      const res = await fetch(`${backendUrl}/api/analytics/knowledge/${entry.source}/${entry.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete page');
      }

      alert('Knowledge page deleted successfully.');
      
      // Remove from state
      const remaining = entries.filter(e => !(e.id === entry.id && e.source === entry.source));
      setEntries(remaining);
      
      if (remaining.length > 0) {
        setSelectedEntry(remaining[0]);
      } else {
        setSelectedEntry(null);
      }
    } catch (err) {
      console.error('Error deleting KB entry:', err);
      alert(err.message || 'Error deleting KB entry');
    }
  };

  const toggleItemSelection = (source, id) => {
    const key = `${source}:${id}`;
    setSelectedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const selectAllVisible = () => {
    const newSelections = {};
    entries.forEach(entry => {
      newSelections[`${entry.source}:${entry.id}`] = true;
    });
    setSelectedItems(newSelections);
  };

  const handleBulkDelete = async () => {
    const itemsToDelete = [];
    Object.keys(selectedItems).forEach(key => {
      if (selectedItems[key]) {
        const [source, id] = key.split(':');
        itemsToDelete.push({ source, id });
      }
    });

    if (itemsToDelete.length === 0) return;

    const confirm = window.confirm(`Are you sure you want to permanently delete these ${itemsToDelete.length} selected pages? This cannot be undone.`);
    if (!confirm) return;

    try {
      const res = await fetch(`${backendUrl}/api/analytics/knowledge/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items: itemsToDelete })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to bulk delete pages');
      }

      alert(`Successfully deleted ${itemsToDelete.length} pages.`);
      setSelectedItems({});
      setIsBulkMode(false);
      fetchKnowledge();
    } catch (err) {
      console.error('Error bulk deleting:', err);
      alert(err.message || 'Error performing bulk delete');
    }
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const inputElement = e.target;
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (data.length < 2) {
          alert("The selected file does not contain enough data rows.");
          inputElement.value = '';
          return;
        }

        const headers = data[0].map(h => String(h || '').trim().toUpperCase());
        const qIndex = headers.findIndex(h => h.includes('QUESTION'));
        const aIndex = headers.findIndex(h => h.includes('ANSWER'));

        if (qIndex === -1 || aIndex === -1) {
          alert("Could not find columns named 'QUESTIONS' and 'ANSWERS' (or similar) in the first row. Please check your headers.");
          inputElement.value = '';
          return;
        }

        const parsedItems = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const question = row[qIndex];
          const answer = row[aIndex];
          if (question && String(question).trim() && answer && String(answer).trim()) {
            parsedItems.push({
              question: String(question).trim(),
              answer: String(answer).trim()
            });
          }
        }

        if (parsedItems.length === 0) {
          alert("No valid records containing both question and answer were found.");
          inputElement.value = '';
          return;
        }

        setPreviewData({
          fileName: file.name,
          qColName: data[0][qIndex],
          aColName: data[0][aIndex],
          items: parsedItems
        });
      } catch (err) {
        console.error(err);
        alert("Error reading file: " + err.message);
      } finally {
        inputElement.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirmImport = async () => {
    if (!previewData || previewData.items.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`${backendUrl}/api/analytics/knowledge/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items: previewData.items })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to import records');
      }

      const resData = await res.json();
      alert(`Success! ${resData.count} pages imported and indexed successfully.`);
      fetchKnowledge();
      setPreviewData(null);
    } catch (err) {
      console.error(err);
      alert("Error importing file: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = Object.values(selectedItems).filter(Boolean).length;

  // Automatically parses dense blocks of text into clean lists and header categories
  const formatAnswerText = (text) => {
    if (!text) return null;
    
    const lines = text.split(/\r?\n/);
    let processedLines = [];
    
    if (lines.length === 1) {
      // Split single block of text dynamically by numbers and bullet markers
      const temp = text
        .replace(/\s+(\d+\.\s+)/g, '\n$1')
        .replace(/\s+([○●•])\s+/g, '\n$1 ');
      processedLines = temp.split('\n');
    } else {
      processedLines = lines;
    }

    return (
      <div className="diary-answer-content">
        {processedLines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return null;

          // Section header (e.g. "1. Primary Target Segments")
          const headerMatch = trimmed.match(/^(\d+\.\s+)([^○●•]+)$/);
          if (headerMatch) {
            return (
              <div key={idx} className="diary-section-header">
                <span className="section-num">{headerMatch[1]}</span>
                <span className="section-title">{headerMatch[2]}</span>
              </div>
            );
          }

          // Bullet item starting with ○, ●, •
          if (trimmed.startsWith('○') || trimmed.startsWith('●') || trimmed.startsWith('•')) {
            return (
              <div key={idx} className="diary-bullet-item">
                <span className="bullet-sym">{trimmed[0]}</span>
                <span className="bullet-text">{trimmed.slice(1).trim()}</span>
              </div>
            );
          }

          // Standard paragraph line
          return <p key={idx} className="diary-normal-line">{trimmed}</p>;
        })}
      </div>
    );
  };

  return (
    <div className="kb-view">
      <div className="kb-header-row">
        <div className="kb-title-block">
          <h1>Knowledge Base (RAG) Diary</h1>
          <p>Browse and manage verified company answers used by the AI semantic engine</p>
        </div>

        {isMD && (
          <div className="kb-header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label className="btn btn-outline-primary import-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
              <Upload size={16} />
              <span>{importing ? 'Importing...' : 'Import CSV/Excel'}</span>
              <input
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={handleImportExcel}
                style={{ display: 'none' }}
                disabled={importing}
              />
            </label>

            <button 
              className={`btn ${showAddForm ? 'btn-secondary' : 'btn-primary'} add-page-btn`}
              onClick={() => {
                setShowAddForm(!showAddForm);
                setIsEditing(false);
                if (!showAddForm) {
                  setSelectedEntry(null);
                } else {
                  if (entries.length > 0) setSelectedEntry(entries[0]);
                }
              }}
            >
              <Plus size={16} />
              <span>{showAddForm ? 'View Diary' : 'Add Diary Page'}</span>
            </button>
          </div>
        )}
      </div>

      <div className="diary-layout-container">
        {/* LEFT COLUMN: TABLE OF CONTENTS (INDEX) */}
        <div className="diary-toc-sidebar">
          <div className="toc-header">
            <h3>📖 Table of Contents</h3>
            <span className="toc-meta">{entries.length} Pages</span>
          </div>

          <div className="toc-bulk-controls">
            <button 
              className={`btn btn-sm ${isBulkMode ? 'btn-secondary' : 'btn-outline-primary'}`}
              onClick={() => {
                setIsBulkMode(!isBulkMode);
                setSelectedItems({});
              }}
            >
              {isBulkMode ? 'Cancel Select' : 'Bulk Select'}
            </button>

            {isBulkMode && (
              <div className="bulk-actions-row">
                <button className="btn btn-sm btn-outline" onClick={selectAllVisible}>
                  Select All
                </button>
                <button 
                  className="btn btn-sm btn-danger" 
                  onClick={handleBulkDelete}
                  disabled={selectedCount === 0}
                >
                  Delete ({selectedCount})
                </button>
              </div>
            )}
          </div>

          <div className="kb-search-bar">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="input-field search-input"
              placeholder="Search index..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="toc-list">
            {loading ? (
              <div className="toc-loading">Indexing diary entries...</div>
            ) : entries.length === 0 ? (
              <div className="toc-empty">No matching pages</div>
            ) : (
              entries.map((entry, idx) => {
                const isActive = selectedEntry && selectedEntry.id === entry.id && selectedEntry.source === entry.source;
                const key = `${entry.source}:${entry.id}`;
                const isChecked = !!selectedItems[key];
                return (
                  <div 
                    key={`${entry.source}-${entry.id || idx}`} 
                    className={`toc-item-card ${isActive ? 'active' : ''} ${isBulkMode ? 'bulk-selectable' : ''}`}
                    onClick={() => {
                      if (isBulkMode) {
                        toggleItemSelection(entry.source, entry.id);
                      } else {
                        setSelectedEntry(entry);
                        setShowAddForm(false);
                        setIsEditing(false);
                      }
                    }}
                  >
                    {isBulkMode && (
                      <div className="toc-checkbox-wrapper" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => toggleItemSelection(entry.source, entry.id)}
                          className="toc-checkbox"
                        />
                      </div>
                    )}
                    <div className="toc-item-details">
                      <div className="toc-item-num">Page {idx + 1}</div>
                      <div className="toc-item-title">{entry.question || 'Untitled Entry'}</div>
                      <div className="toc-item-footer">
                        <span className={`source-tag ${entry.source}`}>
                          {entry.source === 'knowledge_base' ? 'Company Docs' : 'Chat Q&A'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: THE OPEN DIARY PAGE */}
        <div className="diary-page-container">
          {/* Spiral binding rings graphic */}
          <div className="diary-spiral-binding">
            <span></span><span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span><span></span>
          </div>

          <div className="diary-page-sheet">
            <div className="diary-page-red-line"></div>
            
            <div className="diary-page-content">
              {isEditing && selectedEntry ? (
                /* EDIT MODE FORM */
                <div className="diary-write-form-wrapper">
                  <div className="diary-sheet-header">
                    <h2>📝 Edit Knowledge Page</h2>
                    <span className="diary-date">
                      Original: {new Date(selectedEntry.created_at || Date.now()).toLocaleDateString()}
                    </span>
                  </div>

                  <form onSubmit={handleEditSubmit} className="kb-form">
                    <div className="form-group">
                      <label>Question / Subject</label>
                      <input
                        type="text"
                        className="diary-input-field"
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Verified Resolution / Information</label>
                      <textarea
                        className="diary-textarea-field"
                        rows={10}
                        value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-actions">
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={() => setIsEditing(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={submitting}>
                        <Save size={16} />
                        <span>{submitting ? 'Saving...' : 'Save Changes'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              ) : showAddForm ? (
                /* WRITE MODE: NEW ENTRY FORM */
                <div className="diary-write-form-wrapper">
                  <div className="diary-sheet-header">
                    <h2>📝 Draft New Knowledge Page</h2>
                    <span className="diary-date">{new Date().toLocaleDateString()}</span>
                  </div>

                  {successMsg ? (
                    <div className="success-banner">
                      <CheckCircle2 size={24} className="success-icon" />
                      <div>
                        <h4>Page Indexed!</h4>
                        <p>{successMsg}</p>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleAddEntry} className="kb-form">
                      <div className="form-group">
                        <label>Question / Subject</label>
                        <input
                          type="text"
                          className="diary-input-field"
                          placeholder="e.g. What is the target audience for industrial blowers?"
                          value={newQuestion}
                          onChange={(e) => setNewQuestion(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Verified Resolution / Information</label>
                        <textarea
                          className="diary-textarea-field"
                          rows={10}
                          placeholder="Use numbering (e.g. 1.) or list symbols (○, ●) to structure your answer. We will automatically format it."
                          value={newAnswer}
                          onChange={(e) => setNewAnswer(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-actions">
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          onClick={() => {
                            setShowAddForm(false);
                            if (entries.length > 0) setSelectedEntry(entries[0]);
                          }}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                          <Save size={16} />
                          <span>{submitting ? 'Indexing...' : 'Save & Publish'}</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : selectedEntry ? (
                /* READ MODE: ACTIVE PAGE */
                <div className="diary-read-wrapper">
                  <div className="diary-sheet-header">
                    <span className="diary-page-stamp">PAGE VERIFIED</span>
                    <div className="diary-sheet-actions">
                      <span className="diary-date">
                        {new Date(selectedEntry.created_at || Date.now()).toLocaleDateString([], { dateStyle: 'long' })}
                      </span>
                      {isMD && (
                        <div className="diary-action-buttons">
                          <button 
                            className="btn-icon edit-btn" 
                            title="Edit Page" 
                            onClick={() => {
                              setIsEditing(true);
                              setEditQuestion(selectedEntry.question);
                              setEditAnswer(selectedEntry.answer);
                            }}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button 
                            className="btn-icon delete-btn" 
                            title="Delete Page" 
                            onClick={() => handleDeleteEntry(selectedEntry)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h2 className="diary-question">Q: {selectedEntry.question}</h2>
                  
                  <div className="diary-divider"></div>

                  <div className="diary-answer-body">
                    {formatAnswerText(selectedEntry.answer)}
                  </div>

                  <div className="diary-sheet-footer">
                    <div className="verified-seal">
                      <Award size={18} className="seal-icon" />
                      <span>MD Verified Expert Answer</span>
                    </div>
                    <span className="diary-source-badge">
                      Source: {selectedEntry.source === 'knowledge_base' ? 'Company Documents' : 'Chat Conversation'}
                    </span>
                  </div>
                </div>
              ) : (
                /* EMPTY / COVER STATE */
                <div className="diary-cover-wrapper">
                  <BookOpen size={64} className="cover-icon" />
                  <h2>Knowledge Base Diary</h2>
                  <p>Select a page from the Table of Contents to read the verified AI resolution logs.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {previewData && (
        <div className="import-preview-modal-overlay">
          <div className="import-preview-modal-card">
            <div className="import-preview-modal-header">
              <div>
                <h3>Verify Knowledge Import</h3>
                <p className="subtitle">
                  File: <strong>{previewData.fileName}</strong> &bull; Found <strong>{previewData.items.length}</strong> pages to import
                </p>
              </div>
              <button className="btn-close" onClick={() => setPreviewData(null)}>&times;</button>
            </div>
            
            <div className="import-preview-columns-mapping">
              <div className="mapping-badge question-badge">
                <span className="label">Parsed as QUESTION &rarr;</span>
                <span className="value">"{previewData.qColName}"</span>
              </div>
              <div className="mapping-badge answer-badge">
                <span className="label">Parsed as ANSWER &rarr;</span>
                <span className="value">"{previewData.aColName}"</span>
              </div>
            </div>

            <div className="import-preview-modal-body">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Row</th>
                    <th style={{ width: '40%' }}>Question (Notebook Page Title)</th>
                    <th>Answer (Page Content)</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="row-num">{idx + 1}</td>
                      <td className="row-q">{item.question}</td>
                      <td className="row-a">{item.answer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="import-preview-modal-footer">
              <button className="btn btn-secondary" onClick={() => setPreviewData(null)}>
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleConfirmImport} 
                disabled={importing}
                style={{ minWidth: '160px' }}
              >
                {importing ? 'Importing Pages...' : `Confirm Import (${previewData.items.length} Pages)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .kb-view {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: slideUp 0.4s ease-out;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }

        .kb-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .kb-title-block h1 {
          font-family: var(--font-display);
          font-size: 26px;
          font-weight: 700;
        }

        .kb-title-block p {
          color: var(--text-secondary);
          margin-top: 4px;
          font-size: 14px;
        }

        .diary-layout-container {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 28px;
          height: calc(100vh - 160px);
          min-height: 0;
          align-items: stretch;
          overflow: hidden;
          flex: 1;
        }

        .diary-toc-sidebar {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: var(--shadow-sm);
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }

        .toc-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .toc-header h3 {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .toc-meta {
          font-size: 11px;
          font-weight: 600;
          background-color: var(--bg-secondary);
          color: var(--text-secondary);
          padding: 4px 8px;
          border-radius: 12px;
        }

        .toc-bulk-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 4px;
          flex-shrink: 0;
        }

        .bulk-actions-row {
          display: flex;
          gap: 6px;
        }

        .btn-sm {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 4px;
        }

        .btn-outline-primary {
          border: 1px solid var(--primary-color);
          color: var(--primary-color);
          background: transparent;
        }

        .btn-outline-primary:hover {
          background-color: var(--primary-color);
          color: white;
        }

        .btn-danger {
          background-color: #ef4444;
          color: white;
          border: none;
        }

        .btn-danger:hover:not(:disabled) {
          background-color: #dc2626;
        }

        .btn-danger:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-outline {
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-primary);
        }

        .btn-outline:hover {
          background-color: var(--bg-secondary);
        }

        .toc-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-right: 4px;
        }

        .toc-loading, .toc-empty {
          font-size: 13px;
          color: var(--text-secondary);
          text-align: center;
          padding: 20px 0;
        }

        .toc-item-card {
          padding: 12px 14px;
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s, background-color 0.2s;
        }

        .toc-item-card:hover {
          border-color: var(--primary-color);
          transform: translateY(-2px);
        }

        .toc-item-card.active {
          border-color: var(--primary-color);
          background-color: rgba(235, 94, 40, 0.05);
        }

        .toc-item-card.bulk-selectable {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .toc-checkbox-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .toc-checkbox {
          width: 16px;
          height: 16px;
          accent-color: var(--primary-color);
          cursor: pointer;
        }

        .toc-item-details {
          flex: 1;
          min-width: 0;
        }

        .toc-item-num {
          font-size: 10px;
          font-weight: 700;
          color: var(--primary-color);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .toc-item-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .toc-item-footer {
          margin-top: 8px;
          display: flex;
          gap: 6px;
        }

        .source-tag {
          font-size: 9px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .source-tag.knowledge_base {
          background-color: rgba(79, 70, 229, 0.1);
          color: #4f46e5;
        }

        .source-tag.question {
          background-color: rgba(16, 185, 129, 0.1);
          color: #10b981;
        }

        .kb-search-bar {
          position: relative;
          flex-shrink: 0;
        }

        .kb-search-bar .search-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .kb-search-bar .search-input {
          padding-left: 48px;
        }

        /* DIARY PAGE STYLING */
        .diary-page-container {
          display: flex;
          position: relative;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-md);
          overflow: hidden;
          flex: 1;
          height: 100%;
          min-height: 0;
        }

        /* Spiral binding */
        .diary-spiral-binding {
          position: absolute;
          left: 12px;
          top: 0;
          bottom: 0;
          width: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-around;
          align-items: center;
          padding: 20px 0;
          z-index: 10;
        }

        .diary-spiral-binding span {
          width: 24px;
          height: 8px;
          background: linear-gradient(to bottom, #d1d5db, #9ca3af, #d1d5db);
          border-radius: 4px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          transform: rotate(-10deg);
        }

        .diary-page-sheet {
          flex: 1;
          margin-left: 24px;
          background-color: #faf6ee; /* Cream page */
          color: #2d3748;
          padding: 40px 48px;
          position: relative;
          display: flex;
          flex-direction: column;
          box-shadow: inset 2px 0 8px rgba(0, 0, 0, 0.05);
          overflow-y: auto;
          height: 100%;
          min-height: 0;
        }

        /* Lined paper lines */
        .diary-page-sheet::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          right: 0;
          background-image: linear-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 1px);
          background-size: 100% 28px;
          pointer-events: none;
          z-index: 1;
        }

        /* Dark mode paper adjustment */
        [data-theme='dark'] .diary-page-sheet {
          background-color: #1e1e24;
          color: #e2e8f0;
          box-shadow: inset 2px 0 8px rgba(0, 0, 0, 0.2);
        }

        [data-theme='dark'] .diary-page-sheet::before {
          background-image: linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px);
        }

        .diary-page-red-line {
          position: absolute;
          left: 60px;
          top: 0;
          bottom: 0;
          width: 2px;
          background-color: rgba(239, 68, 68, 0.4);
          z-index: 2;
        }

        .diary-page-content {
          position: relative;
          z-index: 3;
          padding-left: 36px;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .diary-sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .diary-sheet-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .diary-action-buttons {
          display: flex;
          gap: 8px;
        }

        .btn-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
          background-color: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-icon:hover {
          background-color: var(--bg-secondary);
          color: var(--text-primary);
        }

        .btn-icon.edit-btn:hover {
          border-color: #3b82f6;
          color: #3b82f6;
          background-color: rgba(59, 130, 246, 0.05);
        }

        .btn-icon.delete-btn:hover {
          border-color: #ef4444;
          color: #ef4444;
          background-color: rgba(239, 68, 68, 0.05);
        }

        .diary-page-stamp {
          font-size: 10px;
          font-weight: 800;
          color: #ef4444;
          border: 1.5px solid #ef4444;
          padding: 2px 8px;
          border-radius: 4px;
          transform: rotate(-3deg);
          letter-spacing: 1px;
          display: inline-block;
        }

        .diary-date {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          font-style: italic;
        }

        .diary-question {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.4;
          margin-bottom: 16px;
        }

        .diary-divider {
          height: 1px;
          background: linear-gradient(to right, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2) 20%, rgba(0, 0, 0, 0.1));
          margin: 16px 0 24px 0;
        }

        [data-theme='dark'] .diary-divider {
          background: linear-gradient(to right, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.15) 20%, rgba(255, 255, 255, 0.05));
        }

        .diary-answer-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
          font-size: 14.5px;
          line-height: 1.8;
          color: var(--text-primary);
          margin-bottom: 30px;
        }

        .diary-answer-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .diary-section-header {
          display: flex;
          gap: 8px;
          font-weight: 700;
          font-size: 15px;
          color: var(--primary-color);
          margin-top: 14px;
          border-bottom: 1px dashed rgba(235, 94, 40, 0.2);
          padding-bottom: 4px;
        }

        .diary-bullet-item {
          display: flex;
          gap: 10px;
          padding-left: 16px;
          align-items: flex-start;
        }

        .bullet-sym {
          color: var(--primary-color);
          font-weight: bold;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .bullet-text {
          color: var(--text-primary);
        }

        .diary-normal-line {
          margin: 0;
          color: var(--text-primary);
        }

        .diary-sheet-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px dashed var(--border-color);
          padding-top: 16px;
          margin-top: auto;
        }

        .verified-seal {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #10b981;
        }

        .seal-icon {
          color: #10b981;
        }

        .diary-source-badge {
          font-size: 11px;
          color: var(--text-secondary);
          font-style: italic;
        }

        /* Cover view */
        .diary-cover-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          color: var(--text-secondary);
          gap: 16px;
        }

        .cover-icon {
          color: var(--primary-color);
          opacity: 0.8;
          animation: pulse 2s infinite ease-in-out;
        }

        .diary-write-form-wrapper {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .diary-input-field {
          width: 100%;
          padding: 10px 14px;
          border: 1px dashed var(--border-color);
          border-radius: 6px;
          background-color: transparent;
          color: inherit;
          font-size: 15px;
          font-weight: 600;
          outline: none;
          transition: border-color 0.2s;
        }

        .diary-input-field:focus {
          border-color: var(--primary-color);
          background-color: rgba(255, 255, 255, 0.4);
        }

        [data-theme='dark'] .diary-input-field:focus {
          background-color: rgba(0, 0, 0, 0.2);
        }

        .diary-textarea-field {
          width: 100%;
          padding: 10px 14px;
          border: 1px dashed var(--border-color);
          border-radius: 6px;
          background-color: transparent;
          color: inherit;
          font-size: 14px;
          line-height: 1.6;
          outline: none;
          resize: none;
          transition: border-color 0.2s;
        }

        .diary-textarea-field:focus {
          border-color: var(--primary-color);
          background-color: rgba(255, 255, 255, 0.4);
        }

        [data-theme='dark'] .diary-textarea-field:focus {
          background-color: rgba(0, 0, 0, 0.2);
        }

        .success-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: rgba(16, 185, 129, 0.08);
          color: #10b981;
          padding: 20px;
          border-radius: var(--radius-md);
          border: 1px solid rgba(16, 185, 129, 0.2);
          margin-top: 20px;
        }

        .success-banner h4 {
          margin: 0 0 4px 0;
          font-weight: 700;
        }

        .success-banner p {
          margin: 0;
          font-size: 13px;
          opacity: 0.9;
        }

        .kb-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 10px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 12px;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
        }

        /* Import Preview Modal Styling (Glassmorphism & High-End Design) */
        .import-preview-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.3s ease-out;
        }

        .import-preview-modal-card {
          width: 90%;
          max-width: 950px;
          max-height: 85vh;
          background: rgba(255, 255, 255, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: var(--radius-lg);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15), 
                      inset 0 1px 0 rgba(255, 255, 255, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        [data-theme='dark'] .import-preview-modal-card {
          background: rgba(24, 24, 28, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4),
                      inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .import-preview-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 24px 28px 16px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        [data-theme='dark'] .import-preview-modal-header {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .import-preview-modal-header h3 {
          font-family: var(--font-display);
          font-size: 20px;
          font-weight: 700;
          margin: 0;
        }

        .import-preview-modal-header .subtitle {
          margin: 4px 0 0 0;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .import-preview-modal-header .btn-close {
          background: transparent;
          border: none;
          font-size: 28px;
          line-height: 1;
          color: var(--text-secondary);
          cursor: pointer;
          transition: color 0.2s;
        }

        .import-preview-modal-header .btn-close:hover {
          color: var(--primary-color);
        }

        .import-preview-columns-mapping {
          display: flex;
          gap: 16px;
          padding: 12px 28px;
          background: rgba(0, 0, 0, 0.02);
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        [data-theme='dark'] .import-preview-columns-mapping {
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .mapping-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
        }

        .question-badge {
          background: rgba(235, 94, 40, 0.08);
          color: var(--primary-color);
          border: 1px solid rgba(235, 94, 40, 0.15);
        }

        .answer-badge {
          background: rgba(16, 185, 129, 0.08);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.15);
        }

        .mapping-badge .label {
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .mapping-badge .value {
          font-weight: 600;
          font-style: italic;
        }

        .import-preview-modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px 28px;
        }

        .import-preview-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13.5px;
        }

        .import-preview-table th {
          position: sticky;
          top: 0;
          background: var(--bg-surface);
          color: var(--text-secondary);
          font-weight: 700;
          text-align: left;
          padding: 10px 14px;
          border-bottom: 2px solid var(--border-color);
          z-index: 10;
        }

        .import-preview-table td {
          padding: 12px 14px;
          border-bottom: 1px solid var(--border-color);
          vertical-align: top;
          line-height: 1.5;
        }

        .import-preview-table tr:last-child td {
          border-bottom: none;
        }

        .import-preview-table tr:hover td {
          background: rgba(235, 94, 40, 0.02);
        }

        [data-theme='dark'] .import-preview-table tr:hover td {
          background: rgba(235, 94, 40, 0.04);
        }

        .import-preview-table .row-num {
          font-weight: 700;
          color: var(--text-secondary);
        }

        .import-preview-table .row-q {
          font-weight: 600;
          color: var(--text-primary);
        }

        .import-preview-table .row-a {
          color: var(--text-secondary);
          white-space: pre-line;
        }

        .import-preview-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 20px 28px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          background: rgba(0, 0, 0, 0.01);
        }

        [data-theme='dark'] .import-preview-modal-footer {
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.01);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleUp {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

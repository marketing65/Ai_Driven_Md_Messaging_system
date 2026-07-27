import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download, FileText, Table, AlertCircle, Copy, Check } from 'lucide-react';

export default function FileViewerModal({ file, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [textContent, setTextContent] = useState('');
  const [csvData, setCsvData] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState(false);
  const [copied, setCopied] = useState(false);

  // Drag and pan states for zoom viewer
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageWrapperRef = useRef(null);

  const { url, name } = file;
  const extension = name.split('.').pop().toLowerCase();

  // Detect file category
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension);
  const isPdf = extension === 'pdf';
  const isCsv = extension === 'csv';
  const isText = ['txt', 'log', 'md', 'json', 'sql', 'js', 'html', 'css'].includes(extension);

  useEffect(() => {
    // Handle Escape key to close modal
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch text/CSV content
  useEffect(() => {
    if (isText || isCsv) {
      setLoadingContent(true);
      setContentError(false);
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch file content');
          return res.text();
        })
        .then(text => {
          if (isCsv) {
            parseCsv(text);
          } else {
            setTextContent(text);
          }
        })
        .catch(err => {
          console.error(err);
          setContentError(true);
        })
        .finally(() => {
          setLoadingContent(false);
        });
    }
  }, [url, isText, isCsv]);

  // Simple CSV parser
  const parseCsv = (text) => {
    try {
      const lines = text.split('\n');
      const result = [];
      lines.forEach(line => {
        if (line.trim()) {
          // simple split by comma, handling potential quotes
          const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          result.push(columns.map(col => col.replace(/^"|"$/g, '').trim()));
        }
      });
      setCsvData(result);
    } catch (e) {
      console.error('CSV Parsing failed', e);
      setContentError(true);
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.4));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(textContent || (csvData ? csvData.map(r => r.join(',')).join('\n') : ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Wheel Zoom Listener (passive: false to block default background scroll)
  useEffect(() => {
    const wrapper = imageWrapperRef.current;
    if (!wrapper || !isImage) return;

    const handleWheelEvent = (e) => {
      e.preventDefault();
      const delta = e.deltaY;
      setZoom(prev => {
        const zoomFactor = delta < 0 ? 0.15 : -0.15;
        const nextZoom = Math.min(Math.max(prev + zoomFactor, 0.4), 5.0);
        return Number(nextZoom.toFixed(2));
      });
    };

    wrapper.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      wrapper.removeEventListener('wheel', handleWheelEvent);
    };
  }, [isImage]);

  // Mouse drag events for panning
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Left click only
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const nextX = e.clientX - dragStart.current.x;
    const nextY = e.clientY - dragStart.current.y;
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    // Reset view
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  return (
    <div className="file-viewer-overlay" onClick={onClose}>
      <div className="file-viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="file-viewer-header">
          <div className="file-header-title">
            <span className="file-icon-wrapper">
              {isImage ? '🖼️' : isPdf ? '📄' : isCsv ? '📊' : isText ? '📝' : '📎'}
            </span>
            <span className="file-name-text" title={name}>{name}</span>
          </div>

          <div className="file-viewer-actions">
            {/* Copy code/text option */}
            {(isText || isCsv) && (
              <button className="viewer-btn" onClick={handleCopyText} title="Copy Content">
                {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}

            {/* Image control options */}
            {isImage && (
              <>
                <button className="viewer-btn" onClick={handleZoomIn} title="Zoom In">
                  <ZoomIn size={16} />
                </button>
                <button className="viewer-btn" onClick={handleZoomOut} title="Zoom Out">
                  <ZoomOut size={16} />
                </button>
                <button className="viewer-btn" onClick={handleRotate} title="Rotate 90°">
                  <RotateCw size={16} />
                </button>
              </>
            )}

            {/* Direct Download option */}
            <button className="viewer-btn download-btn" onClick={handleDownload} title="Download File">
              <Download size={16} />
              <span>Download</span>
            </button>

            {/* Close Button */}
            <button className="close-viewer-btn" onClick={onClose} title="Close Viewer (Esc)">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="file-viewer-content">
          {loadingContent ? (
            <div className="viewer-loading-state">
              <div className="spinner"></div>
              <p>Loading file content...</p>
            </div>
          ) : contentError ? (
            <div className="viewer-error-state">
              <AlertCircle size={40} className="error-icon" />
              <h4>Preview Unavailable</h4>
              <p>We encountered an error loading this file's preview.</p>
              <button className="btn btn-primary" onClick={handleDownload}>
                <Download size={14} /> Download to View
              </button>
            </div>
          ) : isImage ? (
            <div 
              ref={imageWrapperRef}
              className="image-view-wrapper"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              onDoubleClick={handleDoubleClick}
              style={{
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none'
              }}
              title="Scroll to Zoom. Click & hold to drag. Double click to reset."
            >
              <img
                src={url}
                alt={name}
                className="viewer-image"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                }}
                draggable={false}
              />
            </div>
          ) : isPdf ? (
            <div className="pdf-view-wrapper">
              <iframe
                src={`${url}#toolbar=0`}
                title={name}
                className="viewer-pdf-frame"
                width="100%"
                height="100%"
              />
            </div>
          ) : isCsv && csvData ? (
            <div className="csv-table-wrapper">
              <table className="viewer-csv-table">
                <thead>
                  <tr>
                    {csvData[0]?.map((cell, idx) => (
                      <th key={idx}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(1).map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isText ? (
            <div className="text-view-wrapper">
              <pre className="viewer-text-pre">
                <code>{textContent}</code>
              </pre>
            </div>
          ) : (
            /* Fallback prompt for rare/unsupported files */
            <div className="viewer-fallback-state">
              <FileText size={48} className="fallback-icon" />
              <h4>Preview Not Supported</h4>
              <p>This file type ({extension.toUpperCase()}) cannot be rendered directly inside the app.</p>
              <button className="btn btn-primary" onClick={handleDownload}>
                <Download size={14} /> Download File
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .file-viewer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(7, 15, 28, 0.85);
          backdrop-filter: blur(8px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: fadeIn 0.2s ease-out;
        }

        .file-viewer-container {
          background-color: #0b1528;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          width: 90%;
          max-width: 1000px;
          height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .file-viewer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          background-color: rgba(255, 255, 255, 0.03);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .file-header-title {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .file-icon-wrapper {
          font-size: 20px;
        }

        .file-name-text {
          font-size: 15px;
          font-weight: 600;
          color: #f1f5f9;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-viewer-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .viewer-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #cbd5e1;
          padding: 6px 10px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
        }

        .viewer-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #f8fafc;
          border-color: rgba(255, 255, 255, 0.2);
        }

        .download-btn {
          background: #f97316;
          color: #ffffff;
          border: none;
        }

        .download-btn:hover {
          background: #ea580c;
          color: #ffffff;
        }

        .close-viewer-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 40%;
          transition: background-color 0.2s, color 0.2s;
        }

        .close-viewer-btn:hover {
          background-color: rgba(239, 68, 68, 0.2);
          color: #f87171;
        }

        .file-viewer-content {
          flex: 1;
          background-color: #040d1a;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .image-view-wrapper {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: relative;
        }

        .viewer-image {
          max-width: 90%;
          max-height: 90%;
          object-fit: contain;
          border-radius: 4px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          transform-origin: center center;
        }

        .pdf-view-wrapper {
          width: 100%;
          height: 100%;
          background: #ffffff;
        }

        .viewer-pdf-frame {
          border: none;
        }

        .csv-table-wrapper {
          width: 100%;
          height: 100%;
          overflow: auto;
          padding: 20px;
        }

        .viewer-csv-table {
          width: 100%;
          border-collapse: collapse;
          color: #e2e8f0;
          font-size: 13px;
        }

        .viewer-csv-table th, .viewer-csv-table td {
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 10px 12px;
          text-align: left;
        }

        .viewer-csv-table th {
          background-color: rgba(255, 255, 255, 0.04);
          font-weight: 600;
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .viewer-csv-table tr:hover {
          background-color: rgba(255, 255, 255, 0.02);
        }

        .text-view-wrapper {
          width: 100%;
          height: 100%;
          overflow: auto;
          padding: 20px;
          background-color: #020813;
          display: flex;
          justify-content: flex-start;
          align-items: flex-start;
        }

        .viewer-text-pre {
          margin: 0;
          font-family: 'Fira Code', 'Courier New', Courier, monospace;
          font-size: 13px;
          line-height: 1.5;
          color: #38bdf8;
          white-space: pre-wrap;
          word-break: break-all;
          text-align: left;
          width: 100%;
        }

        .viewer-loading-state, .viewer-error-state, .viewer-fallback-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          text-align: center;
          padding: 40px;
          color: #94a3b8;
        }

        .viewer-loading-state .spinner {
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top: 3px solid #f97316;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          animation: spin 0.8s linear infinite;
        }

        .error-icon {
          color: #ef4444;
        }

        .fallback-icon {
          color: #3b82f6;
        }

        .viewer-error-state h4, .viewer-fallback-state h4 {
          color: #f1f5f9;
          margin: 0;
          font-size: 18px;
        }

        .viewer-error-state p, .viewer-fallback-state p {
          max-width: 400px;
          margin: 0;
          font-size: 14px;
        }

        .text-success {
          color: #22c55e;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

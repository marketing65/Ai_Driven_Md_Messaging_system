import React, { useState, useEffect, useRef } from 'react';
import { Bot, User, Mic, Send, MoreHorizontal, AlertCircle, Headphones, ArrowLeft, Users, MessageSquare, Paperclip, Plus, Check, Calendar, Clock, Trash2, X } from 'lucide-react';
import { io } from 'socket.io-client';
import FileViewerModal from './FileViewerModal';

export default function DualChat({ user, backendUrl, token }) {
  const [aiMessage, setAiMessage] = useState('');
  const [mdMessage, setMdMessage] = useState('');
  const [aiHistory, setAiHistory] = useState([]);
  const [mdHistory, setMdHistory] = useState([]);
  
  const [aiLoading, setAiLoading] = useState(false);
  const [mdLoading, setMdLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [activeViewerFile, setActiveViewerFile] = useState(null);

  const [showLeftMenu, setShowLeftMenu] = useState(false);
  const [showRightMenu, setShowRightMenu] = useState(false);
  const leftMenuRef = useRef(null);
  const rightMenuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (leftMenuRef.current && !leftMenuRef.current.contains(e.target)) {
        setShowLeftMenu(false);
      }
      if (rightMenuRef.current && !rightMenuRef.current.contains(e.target)) {
        setShowRightMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleClearChat = async (chatType) => {
    let targetChatId = '';
    let confirmMsg = '';

    if (chatType === 'ai') {
      targetChatId = aiChatId;
      confirmMsg = "Are you sure you want to clear your AI chat history?";
    } else if (chatType === 'md') {
      const currentMdChatId = user.role === 'md'
        ? (recipient === 'all' ? null : `md-${recipient}`)
        : mdChatId;
      
      if (!currentMdChatId) {
        alert("No active chat to clear.");
        return;
      }
      targetChatId = currentMdChatId;
      confirmMsg = "Are you sure you want to clear this MD/Employee chat history?";
    }

    if (!targetChatId) return;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${backendUrl}/api/chat/clear/${targetChatId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        if (chatType === 'ai') {
          setAiHistory([]);
        } else if (chatType === 'md') {
          setMdHistory([]);
        }
      } else {
        const errorText = await res.text();
        alert(`Failed to clear chat: ${errorText || res.statusText}`);
      }
    } catch (err) {
      console.error("Error clearing chat:", err);
      alert("Error clearing chat history");
    }
  };
  
  // Voice Recording state
  const [recordingLeft, setRecordingLeft] = useState(false);
  const [recordingRight, setRecordingRight] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const aiChatEndRef = useRef(null);
  const mdChatEndRef = useRef(null);
  const threadChatEndRef = useRef(null);

  const socketRef = useRef(null);
  const aiChatId = `ai-${user.id}`;
  const mdChatId = `md-${user.id}`;

  // Bidirectional MD-to-Employee Messaging States
  const [employees, setEmployees] = useState([]);
  const [mdProfile, setMdProfile] = useState(null);
  const [sentToMdIndexes, setSentToMdIndexes] = useState(new Set());

  // Scheduled Messages States
  const [scheduledMessages, setScheduledMessages] = useState([]);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [showScheduledList, setShowScheduledList] = useState(false);

  const handleAskFromMdFromAi = async (index) => {
    const userQuestion = aiHistory[index - 1]?.message;
    if (!userQuestion) return;

    setSentToMdIndexes(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    try {
      const res = await fetch(`${backendUrl}/api/chat/md`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: userQuestion, chatId: mdChatId, priority: 'medium' })
      });
      const data = await res.json();
      
      setMdHistory(prev => [...prev, { sender: 'employee', message: userQuestion, created_at: new Date() }]);
      if (data.question) {
        setMdHistory(prev => [...prev, { sender: 'md', message: data.message, created_at: new Date() }]);
      }
    } catch (err) {
      console.error('Error submitting MD ticket from AI response:', err);
      setSentToMdIndexes(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleDeleteBroadcast = async (qId) => {
    if (!window.confirm("Are you sure you want to delete this broadcast question and all of its discussion logs?")) return;

    try {
      const res = await fetch(`${backendUrl}/api/chat/broadcast/${qId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setBroadcastQuestions(prev => prev.filter(q => q.id !== qId));
        if (activeThread && activeThread.id === qId) {
          setActiveThread(null);
        }
      } else {
        const errorText = await res.text().catch(() => '');
        let errorMsg = 'Unknown error';
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.error || errorMsg;
        } catch (_) {
          if (errorText) {
            errorMsg = errorText.length > 120 ? `${errorText.substring(0, 120)}...` : errorText;
          } else {
            errorMsg = res.statusText || `Status code: ${res.status}`;
          }
        }
        alert(`Failed to delete broadcast question: ${errorMsg}`);
      }
    } catch (err) {
      console.error("Error deleting broadcast:", err);
      alert(`Connection error: ${err.message}`);
    }
  };

  const [recipient, setRecipient] = useState('all'); // 'all' or specific employee user.id
  const [broadcastQuestions, setBroadcastQuestions] = useState([]);
  const [activeThread, setActiveThread] = useState(null); // Currently opened broadcast question thread
  const [threadHistory, setThreadHistory] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // Scroll to bottom
  const scrollToBottom = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom(aiChatEndRef);
  }, [aiHistory]);

  useEffect(() => {
    scrollToBottom(mdChatEndRef);
  }, [mdHistory]);

  useEffect(() => {
    scrollToBottom(threadChatEndRef);
  }, [threadHistory]);

  // Draggable Resizer Logic
  const [leftWidth, setLeftWidth] = useState(50);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      if (clientX === undefined || clientX === null) return;
      const newLeftWidthPx = clientX - containerRect.left;
      const newLeftWidthPercent = (newLeftWidthPx / containerRect.width) * 100;
      
      if (newLeftWidthPercent >= 20 && newLeftWidthPercent <= 80) {
        setLeftWidth(newLeftWidthPercent);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: true });
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, []);

  const handleStartDrag = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Fetch profiles for avatar mapping
  useEffect(() => {
    fetch(`${backendUrl}/api/auth/employees`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEmployees(data);
        }
      })
      .catch(err => console.error('Error fetching employees:', err));

    if (user.role === 'employee') {
      fetch(`${backendUrl}/api/auth/md-profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data) {
            setMdProfile(data);
          }
        })
        .catch(err => console.error('Error fetching MD profile:', err));
    }
  }, [user.role, backendUrl, token]);

  // Fetch broadcast questions
  const fetchBroadcastQuestions = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/chat/broadcast-questions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBroadcastQuestions(data);
      }
    } catch (err) {
      console.error('Error fetching broadcast questions:', err);
    }
  };

  useEffect(() => {
    fetchBroadcastQuestions();
  }, [backendUrl, token]);

  // Read prefilled query from local storage (set by suggested questions on dashboard)
  useEffect(() => {
    const prefilled = localStorage.getItem('prefilledQuery');
    if (prefilled) {
      setAiMessage(prefilled);
      localStorage.removeItem('prefilledQuery');
    }
  }, []);

  const fetchScheduledMessages = async () => {
    const currentMdChatId = user.role === 'md'
      ? (recipient === 'all' ? null : `md-${recipient}`)
      : mdChatId;

    if (!currentMdChatId) {
      setScheduledMessages([]);
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/chat/schedule/${currentMdChatId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setScheduledMessages(data);
      }
    } catch (err) {
      console.error('Error fetching scheduled messages:', err);
    }
  };

  const handleCancelScheduledMessage = async (id) => {
    try {
      const res = await fetch(`${backendUrl}/api/chat/schedule/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchScheduledMessages();
      }
    } catch (err) {
      console.error('Error cancelling scheduled message:', err);
    }
  };

  // Fetch histories & Setup WebSockets
  useEffect(() => {
    async function fetchHistories() {
      try {
        const resAi = await fetch(`${backendUrl}/api/chat/history/${aiChatId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resAi.ok) {
          const data = await resAi.json();
          setAiHistory(data);
        }

        // Fetch MD chat history
        // If logged-in user is MD, we load the chat of the selected recipient (if not 'all')
        // If logged-in user is employee, we load their direct chat with MD
        const currentMdChatId = user.role === 'md'
          ? (recipient === 'all' ? null : `md-${recipient}`)
          : mdChatId;

        if (currentMdChatId) {
          const resMd = await fetch(`${backendUrl}/api/chat/history/${currentMdChatId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (resMd.ok) {
            const data = await resMd.json();
            setMdHistory(data);
          }
          
          await fetchScheduledMessages();
        }
      } catch (err) {
        console.error('Error fetching chat history:', err);
      }
    }

    fetchHistories();

    // Socket connection
    socketRef.current = io(backendUrl);
    socketRef.current.emit('join', { userId: user.id, role: user.role });

    // Handle real-time updates when MD answers
    socketRef.current.on('new_notification', (notification) => {
      // Reload MD chat history to show new answers in real-time
      const currentMdChatId = user.role === 'md'
        ? (recipient === 'all' ? null : `md-${recipient}`)
        : mdChatId;

      if (currentMdChatId && (notification.content.includes('answered') || notification.content.includes('replies') || notification.content.includes('asked you'))) {
        fetch(`${backendUrl}/api/chat/history/${currentMdChatId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(data => {
            setMdHistory(data);
            fetchScheduledMessages();
          });
      }

      // If MD is logged in, reload recipient list or trigger notification
      if (user.role === 'md' && notification.content.includes('answered')) {
        // MD notifications
      }
    });

    socketRef.current.on('new_broadcast_question', (question) => {
      setBroadcastQuestions(prev => [question, ...prev]);
    });

    socketRef.current.on('broadcast_deleted', ({ id }) => {
      setBroadcastQuestions(prev => prev.filter(q => q.id !== id));
      setActiveThread(current => {
        if (current && current.id === id) {
          return null;
        }
        return current;
      });
    });

    socketRef.current.on('new_broadcast_message', (msg) => {
      if (activeThread && msg.chat_id === `md-broadcast-${activeThread.id}`) {
        setThreadHistory(prev => [...prev, msg]);
      }
    });

    socketRef.current.on('chat_cleared', ({ chatId }) => {
      if (chatId === aiChatId) {
        setAiHistory([]);
      } else {
        const currentMdChatId = user.role === 'md'
          ? (recipient === 'all' ? null : `md-${recipient}`)
          : mdChatId;
        if (chatId === currentMdChatId) {
          setMdHistory([]);
        } else if (activeThread && chatId === `md-broadcast-${activeThread.id}`) {
          setThreadHistory([]);
        }
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [backendUrl, token, user.id, user.role, recipient, activeThread]);

  // Fetch thread history when activeThread changes
  useEffect(() => {
    if (!activeThread) return;

    async function fetchThreadHistory() {
      setThreadLoading(true);
      try {
        const res = await fetch(`${backendUrl}/api/chat/history/md-broadcast-${activeThread.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setThreadHistory(data);
        }
      } catch (err) {
        console.error('Error fetching thread history:', err);
      } finally {
        setThreadLoading(false);
      }
    }

    fetchThreadHistory();
  }, [activeThread, backendUrl, token]);

  // Handle Text Submission
  const handleSendAi = async (e) => {
    e.preventDefault();
    if (!aiMessage.trim()) return;

    const text = aiMessage;
    setAiMessage('');
    setAiLoading(true);

    // Optimistically insert user message
    setAiHistory(prev => [...prev, { sender: 'employee', message: text, created_at: new Date() }]);

    try {
      const res = await fetch(`${backendUrl}/api/chat/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: text, chatId: aiChatId })
      });
      const data = await res.json();
      
      setAiHistory(prev => [...prev, { sender: 'ai', message: data.message, created_at: new Date() }]);
    } catch (err) {
      console.error('Error sending message to AI:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendMd = async (e) => {
    e.preventDefault();
    if (!mdMessage.trim() && pendingAttachments.length === 0) return;

    let text = mdMessage.trim();
    if (pendingAttachments.length > 0) {
      const attachmentTags = pendingAttachments.map(att => {
        const isImage = att.mimetype.startsWith('image/');
        return isImage ? `[IMAGE:${att.url}|${att.filename}]` : `[FILE:${att.url}|${att.filename}]`;
      }).join(' ');
      
      text = text ? `${text} ${attachmentTags}` : attachmentTags;
    }

    setMdLoading(true);

    const targetChatId = user.role === 'md' ? `md-${recipient}` : mdChatId;

    if (showScheduler && scheduledTime) {
      try {
        const res = await fetch(`${backendUrl}/api/chat/schedule`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            message: text,
            chatId: targetChatId,
            sendAt: new Date(scheduledTime).toISOString()
          })
        });
        if (res.ok) {
          setMdMessage('');
          setPendingAttachments([]);
          setShowScheduler(false);
          setScheduledTime('');
          await fetchScheduledMessages();
        } else {
          const errData = await res.json();
          alert(errData.error || 'Failed to schedule message');
        }
      } catch (err) {
        console.error('Error scheduling message:', err);
        alert('Error scheduling message.');
      } finally {
        setMdLoading(false);
      }
      return;
    }

    setMdMessage('');
    setPendingAttachments([]);

    if (user.role === 'md') {
      if (activeThread) {
        // MD replying to a group broadcast discussion thread
        try {
          const res = await fetch(`${backendUrl}/api/chat/answer-md-question`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ questionId: activeThread.id, answer: text })
          });
          // Optimistically append
          setThreadHistory(prev => [...prev, { sender: 'employee', message: `Managing Director: ${text}`, created_at: new Date() }]);
        } catch (err) {
          console.error('Error replying to broadcast thread:', err);
        } finally {
          setMdLoading(false);
        }
      } else if (recipient === 'all') {
        // MD sending broadcast question
        try {
          const res = await fetch(`${backendUrl}/api/chat/md-ask`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message: text, recipient: 'all' })
          });
          const data = await res.json();
          if (data.question) {
            setBroadcastQuestions(prev => [data.question, ...prev]);
          }
        } catch (err) {
          console.error('Error broadcasting question:', err);
        } finally {
          setMdLoading(false);
        }
      } else {
        // MD sending direct question to specific employee
        try {
          await fetch(`${backendUrl}/api/chat/md-ask`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message: text, recipient: recipient })
          });
          setMdHistory(prev => [...prev, { sender: 'md', message: text, created_at: new Date() }]);
        } catch (err) {
          console.error('Error sending private question:', err);
        } finally {
          setMdLoading(false);
        }
      }
    } else {
      // User is Employee
      if (activeThread) {
        // Employee contributing to broadcast group discussion
        try {
          await fetch(`${backendUrl}/api/chat/answer-md-question`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ questionId: activeThread.id, answer: text })
          });
          setThreadHistory(prev => [...prev, { sender: 'employee', message: `${user.name}: ${text}`, created_at: new Date() }]);
        } catch (err) {
          console.error('Error answering broadcast question:', err);
        } finally {
          setMdLoading(false);
        }
      } else {
        // Normal direct question to MD
        try {
          const res = await fetch(`${backendUrl}/api/chat/md`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message: text, chatId: mdChatId, priority: 'medium' })
          });
          const data = await res.json();
          setMdHistory(prev => [...prev, { sender: 'employee', message: text, created_at: new Date() }]);
          if (data.question) {
            setMdHistory(prev => [...prev, { sender: 'md', message: data.message, created_at: new Date() }]);
          }
        } catch (err) {
          console.error('Error submitting MD ticket:', err);
        } finally {
          setMdLoading(false);
        }
      }
    }
  };

  // Voice recording triggers
  const startRecording = async (side) => {
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
        await handleAudioUpload(audioBlob, side);
      };

      mediaRecorder.start();
      if (side === 'left') setRecordingLeft(true);
      if (side === 'right') setRecordingRight(true);
    } catch (err) {
      console.error('Error starting media recorder:', err);
      alert('Could not access microphone. Please check browser permissions.');
    }
  };

  const stopRecording = (side) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (side === 'left') setRecordingLeft(false);
    if (side === 'right') setRecordingRight(false);
  };

  const handleAudioUpload = async (audioBlob, side) => {
    if (side === 'left') setAiLoading(true);
    if (side === 'right') setMdLoading(true);

    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.wav');

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
        if (side === 'left') {
          setAiMessage(data.text);
        } else {
          setMdMessage(data.text);
        }
      }
    } catch (err) {
      console.error('Error transcribing audio:', err);
    } finally {
      setAiLoading(false);
      setMdLoading(false);
    }
  };
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setMdLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${backendUrl}/api/chat/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (data.url) {
        setPendingAttachments(prev => [...prev, {
          url: data.url,
          filename: data.filename,
          mimetype: data.mimetype,
          size: data.size
        }]);
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('File upload failed.');
    } finally {
      setMdLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const renderMessageText = (messageText) => {
    if (!messageText) return '';

    let prefix = "";
    let content = messageText;
    const prefixIndex = messageText.indexOf(': ');
    if (prefixIndex !== -1 && !messageText.startsWith('http')) {
      const prefixPart = messageText.substring(0, prefixIndex);
      if (!prefixPart.includes('/') && !prefixPart.includes('http')) {
        prefix = messageText.substring(0, prefixIndex + 2);
        content = messageText.substring(prefixIndex + 2);
      }
    }

    const imageRegex = /\[IMAGE:(.*?)\|(.*?)\]/gi;
    const fileRegex = /\[FILE:(.*?)\|(.*?)\]/gi;
    
    const images = [];
    const files = [];
    
    let cleanText = content;
    
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
        {prefix && <span className="message-sender-prefix" style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>{prefix}</span>}
        {cleanText && <div className="message-text-body" style={{ whiteSpace: 'pre-wrap' }}>{cleanText}</div>}
        
        {images.length > 0 && (
          <div className="message-images-grid" style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {images.map((img, idx) => (
              <div key={idx} className="chat-image-attachment">
                <img 
                  src={img.url} 
                  alt={img.name} 
                  className="attached-image-preview" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveViewerFile({ url: img.url, name: img.name });
                  }} 
                />
                <div className="attachment-filename">{img.name}</div>
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
                style={{ marginTop: '4px' }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveViewerFile({ url: file.url, name: file.name });
                }}
              >
                <Paperclip size={16} />
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-download-text">Click to view/download</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dual-chat-container" ref={containerRef}>
      {/* LEFT CHAT: ASK AI */}
      <div className="chat-pane ai-chat-pane" style={{ width: `${leftWidth}%`, flexGrow: 0, flexShrink: 0 }}>
        <div className="chat-pane-header">
          <div className="header-meta">
            <div className="bot-avatar-wrapper">
              <Bot size={20} />
            </div>
            <div>
              <h3>Ask AI Assistant</h3>
              <div className="status-indicator-row">
                <span className="dot online-dot"></span>
                <span className="status-text">Instant AI Guide • Online</span>
              </div>
            </div>
          </div>
          <div className="header-menu-container" ref={leftMenuRef} style={{ position: 'relative' }}>
            <button className="btn-icon header-more-btn" onClick={() => setShowLeftMenu(!showLeftMenu)} title="Chat options">
              <MoreHorizontal size={18} />
            </button>
            {showLeftMenu && (
              <div className="header-dropdown-menu" style={{
                position: 'absolute',
                right: 0,
                top: '45px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-md)',
                zIndex: 100,
                minWidth: '120px',
                padding: '6px 0',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <button 
                  type="button"
                  onClick={() => { handleClearChat('ai'); setShowLeftMenu(false); }}
                  className="dropdown-item-btn"
                  style={{
                    padding: '8px 16px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    textAlign: 'left',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-tertiary)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  <Trash2 size={14} style={{ color: 'var(--error)' }} />
                  <span>Clear Chat</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="chat-messages-container">
          {aiHistory.length === 0 ? (
            <div className="chat-welcome-state">
              <Bot size={48} className="welcome-icon" />
              <h4>Instant AI Knowledge Assistant</h4>
              <p>Ask anything about company manuals or machinery procedures. Ask in Hindi, Hinglish, or English.</p>
              <div className="suggestion-pill-box">
                <button className="suggest-pill" onClick={() => setAiMessage("vibration levels change ho rhe hai motor me, kya kare?")}>"vibration levels change ho rhe..."</button>
                <button className="suggest-pill" onClick={() => setAiMessage("How to calibrate our pressure sensor?")}>"How to calibrate pressure sensor?"</button>
              </div>
            </div>
          ) : (
            aiHistory.map((msg, index) => (
              <div key={index} className={`message-bubble-row ${msg.sender}`}>
                <div className="msg-avatar" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: msg.sender === 'employee' ? 'var(--primary-light)' : 'var(--bg-tertiary)', color: msg.sender === 'employee' ? 'var(--primary-color)' : 'var(--text-primary)', fontWeight: 'bold' }}>
                  {msg.sender === 'employee' ? (
                    user.name?.charAt(0).toUpperCase() || 'U'
                  ) : (
                    <Bot size={16} />
                  )}
                </div>
                <div className="msg-bubble-content">
                  <div className="msg-bubble-text">
                    {msg.message}
                  </div>
                  <span className="msg-timestamp">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  
                  {msg.sender === 'ai' && user.role !== 'md' && (() => {
                    const userQuestion = aiHistory[index - 1]?.message;
                    const normalizeText = (txt) => txt ? txt.trim().toLowerCase() : '';
                    const hasBeenSent = userQuestion && mdHistory.some(m => 
                      m.sender === 'employee' && normalizeText(m.message) === normalizeText(userQuestion)
                    );
                    const isSent = sentToMdIndexes.has(index) || hasBeenSent;
                    
                    return (
                      <div>
                        <button
                          className="ask-md-btn-small"
                          disabled={isSent}
                          onClick={() => handleAskFromMdFromAi(index)}
                        >
                          {isSent ? (
                            <>
                              <Check size={12} />
                              Sent to MD
                            </>
                          ) : (
                            <>
                              <MessageSquare size={12} />
                              Ask from MD
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))
          )}
          {aiLoading && (
            <div className="message-bubble-row ai loading">
              <div className="msg-avatar"><Bot size={16} /></div>
              <div className="msg-bubble-content">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={aiChatEndRef} />
        </div>

        <form className="chat-input-form" onSubmit={handleSendAi}>
          <input
            type="text"
            className="input-field chat-text-input"
            placeholder={recordingLeft ? "Recording voice... Speak now" : "Type your message..."}
            value={aiMessage}
            onChange={(e) => setAiMessage(e.target.value)}
            disabled={recordingLeft}
          />
          
          <button
            type="button"
            className={`btn-icon mic-record-btn ${recordingLeft ? 'recording' : ''}`}
            onClick={() => recordingLeft ? stopRecording('left') : startRecording('left')}
            title="Record voice input (Hindi, Hinglish, English supported)"
          >
            {recordingLeft ? (
              <div className="voice-waves">
                <span></span><span></span><span></span>
              </div>
            ) : (
              <Mic size={18} />
            )}
          </button>
          
          <button type="submit" className="btn btn-primary send-msg-btn" disabled={!aiMessage.trim() || aiLoading}>
            <Send size={16} />
          </button>
        </form>
      </div>

      {/* DRAGGABLE RESIZER SPLIT LINE */}
      <div 
        className="chat-resizer" 
        onMouseDown={handleStartDrag}
        onTouchStart={handleStartDrag}
      />

      {/* RIGHT CHAT: ASK MD OR ASK EMPLOYEES */}
      <div className="chat-pane md-chat-pane" style={{ flexGrow: 1, flexShrink: 1, width: 0 }}>
        <div className="chat-pane-header">
          <div className="header-meta">
            <div className="md-avatar-wrapper" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--primary-light)', color: 'var(--primary-color)', fontWeight: 'bold', borderRadius: '50%' }}>
              {user.role === 'md' ? (
                (() => {
                  const activeEmployee = employees.find(emp => emp.id === recipient);
                  return activeEmployee ? (
                    activeEmployee.name?.charAt(0).toUpperCase()
                  ) : (
                    <Users size={20} />
                  );
                })()
              ) : (
                mdProfile?.name?.charAt(0).toUpperCase() || 'M'
              )}
            </div>
            <div>
              <h3>
                {user.role === 'md' ? (
                  (() => {
                    const activeEmployee = employees.find(emp => emp.id === recipient);
                    return activeEmployee ? activeEmployee.name : 'Ask Employees';
                  })()
                ) : (
                  mdProfile?.name || 'Ask MD'
                )}
              </h3>
              <div className="status-indicator-row">
                <span className="dot pending-dot"></span>
                <span className="status-text">
                  {user.role === 'md' ? 'Targeted Corporate Communications' : 'Direct to MD • Active Queue'}
                </span>
              </div>
            </div>
          </div>

          {/* Recipient Dropdown Selector for MD */}
          {user.role === 'md' && !activeThread && (
            <div className="md-selector-container">
              <Users size={16} className="selector-icon" />
              <select
                className="employee-select-dropdown"
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setActiveThread(null);
                }}
              >
                <option value="all">👥 All Employees (Broadcast)</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>👤 {emp.name} ({emp.email})</option>
                ))}
              </select>
            </div>
          )}

          {(user.role !== 'md' || recipient !== 'all') && (
            <div className="header-menu-container" ref={rightMenuRef} style={{ position: 'relative' }}>
              <button className="btn-icon header-more-btn" onClick={() => setShowRightMenu(!showRightMenu)} title="Chat options">
                <MoreHorizontal size={18} />
              </button>
              {showRightMenu && (
                <div className="header-dropdown-menu" style={{
                  position: 'absolute',
                  right: 0,
                  top: '45px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 100,
                  minWidth: '120px',
                  padding: '6px 0',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <button 
                    type="button"
                    onClick={() => { handleClearChat('md'); setShowRightMenu(false); }}
                    className="dropdown-item-btn"
                    style={{
                      padding: '8px 16px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-primary)',
                      textAlign: 'left',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    <Trash2 size={14} style={{ color: 'var(--error)' }} />
                    <span>Clear Chat</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── BROADCAST GROUP DISCUSSION THREAD VIEW ── */}
        {activeThread ? (
          <div className="thread-wrapper">
            <div className="thread-header-bar">
              <button className="btn btn-secondary back-btn" onClick={() => setActiveThread(null)}>
                <ArrowLeft size={16} /> Back
              </button>
              <div className="thread-header-text">
                <span className="thread-label">Group Discussion Thread</span>
                <h4 className="thread-title-text">{activeThread.question_original.replace('[MD_QUESTION_TO_ALL] ', '')}</h4>
              </div>
            </div>

            <div className="chat-messages-container thread-messages">
              {threadLoading ? (
                <div className="loading-state">Loading discussion history...</div>
              ) : threadHistory.length === 0 ? (
                <div className="thread-empty-state">
                  <MessageSquare size={32} className="welcome-icon" />
                  <p>No answers submitted yet. Be the first to contribute to this broadcast question!</p>
                </div>
              ) : (
                threadHistory.map((msg, index) => (
                  <div key={index} className={`message-bubble-row ${msg.sender}`}>
                    <div className="msg-avatar" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: msg.message.startsWith('Managing Director') ? 'var(--primary-light)' : 'var(--bg-tertiary)', color: msg.message.startsWith('Managing Director') ? 'var(--primary-color)' : 'var(--text-primary)', fontWeight: 'bold' }}>
                      {msg.message.startsWith('Managing Director') ? (
                        user.role === 'md' ? (
                          user.name?.charAt(0).toUpperCase() || 'M'
                        ) : (
                          mdProfile?.name?.charAt(0).toUpperCase() || 'M'
                        )
                      ) : (
                        (() => {
                          const prefixIndex = msg.message.indexOf(': ');
                          if (prefixIndex !== -1) {
                            const senderName = msg.message.substring(0, prefixIndex);
                            return senderName.charAt(0).toUpperCase();
                          }
                          return 'U';
                        })()
                      )}
                    </div>
                    <div className="msg-bubble-content">
                      <div className="msg-bubble-text">
                        {renderMessageText(msg.message)}
                      </div>
                      <span className="msg-timestamp">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={threadChatEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={handleSendMd} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {pendingAttachments.length > 0 && (
                <div className="pending-attachments-bucket">
                  {pendingAttachments.map((file, idx) => (
                    <div key={idx} className="pending-attachment-preview-card">
                      {file.mimetype.startsWith('image/') ? (
                        <img src={file.url} alt={file.filename} className="pending-image-thumb" />
                      ) : (
                        <Paperclip size={16} className="pending-file-icon" />
                      )}
                      <div className="pending-file-info">
                        <span className="pending-filename">{file.filename}</span>
                        <span className="pending-filesize">{(file.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <button
                        type="button"
                        className="remove-attachment-btn"
                        onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== idx))}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="chat-input-controls-row" style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  className="btn-icon attachment-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file or media"
                >
                  <Plus size={18} />
                </button>
                <input
                  type="text"
                  className="input-field chat-text-input"
                  placeholder="Type your answer to contribute to this group question..."
                  value={mdMessage}
                  onChange={(e) => setMdMessage(e.target.value)}
                  disabled={mdLoading}
                />
                <button type="submit" className="btn btn-primary send-msg-btn" disabled={(!mdMessage.trim() && pendingAttachments.length === 0) || mdLoading}>
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ── MAIN CHAT AREA (DIRECT MESSAGE OR BROADCAST LOGS) ── */
          <>
            {/* Scheduled Messages Banner */}
            {scheduledMessages.length > 0 && (
              <div className="scheduled-messages-banner">
                <div className="scheduled-banner-header" onClick={() => setShowScheduledList(!showScheduledList)}>
                  <div className="banner-label">
                    <Calendar size={16} className="banner-icon" />
                    <span>{scheduledMessages.length} Scheduled Message{scheduledMessages.length > 1 ? 's' : ''} pending</span>
                  </div>
                  <button className="btn-toggle-scheduled" type="button">
                    {showScheduledList ? 'Hide Queue' : 'View Queue'}
                  </button>
                </div>
                
                {showScheduledList && (
                  <div className="scheduled-messages-queue-list">
                    {scheduledMessages.map(msg => (
                      <div key={msg.id} className="scheduled-item-card">
                        <div className="scheduled-item-body">
                          <span className="scheduled-item-text">{msg.message}</span>
                          <span className="scheduled-item-time">
                            <Clock size={12} />
                            Send at: {new Date(msg.send_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        <button 
                          className="btn-cancel-scheduled"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelScheduledMessage(msg.id);
                          }}
                          title="Cancel scheduled message"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Active Group Questions banner for employees */}
            {user.role === 'employee' && broadcastQuestions.length > 0 && (
              <div className="active-broadcast-banner">
                <div className="banner-title">📣 Active Group Questions from MD</div>
                <div className="broadcast-carousel-list">
                  {broadcastQuestions.map(q => (
                    <div className="broadcast-card" key={q.id}>
                      <div className="broadcast-card-body">
                        <p className="broadcast-q-text">{q.question_original.replace('[MD_QUESTION_TO_ALL] ', '')}</p>
                        <button
                          className="btn btn-primary btn-sm contribute-btn"
                          onClick={() => setActiveThread(q)}
                        >
                          💬 Contribute / Answer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="chat-messages-container">
              {user.role === 'md' && recipient === 'all' ? (
                /* MD BROADCAST DASHBOARD MAIN VIEW */
                <div className="md-broadcast-dashboard">
                  <div className="dashboard-intro">
                    <Users size={32} className="welcome-icon" />
                    <h4>Broadcast Group Questions</h4>
                    <p>Send questions to all employees. Click on active questions below to view answers and join discussions.</p>
                  </div>

                  <div className="broadcast-questions-list">
                    <h5>Group Questions Sent By You</h5>
                    {broadcastQuestions.length === 0 ? (
                      <div className="empty-broadcast-state">No broadcast questions sent yet.</div>
                    ) : (
                      broadcastQuestions.map(q => (
                        <div className="broadcast-q-card-md" key={q.id} onClick={() => setActiveThread(q)}>
                          <div className="q-card-header">
                            <span className="badge badge-pending">Active Thread</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="q-date">{new Date(q.created_at).toLocaleDateString()}</span>
                              <button 
                                className="delete-broadcast-btn"
                                onClick={(e) => {
                                  e.stopPropagation(); // prevent opening thread
                                  handleDeleteBroadcast(q.id);
                                }}
                                title="Delete Broadcast Question"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <p className="q-text">{q.question_original.replace('[MD_QUESTION_TO_ALL] ', '')}</p>
                          <div className="q-card-footer">
                            <span>💬 Click to see contributions & answers</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /* PRIVATE DIRECT CHAT LOGS */
                mdHistory.length === 0 ? (
                  <div className="chat-welcome-state">
                    {user.role === 'md' ? (
                      <>
                        <User size={48} className="welcome-icon" />
                        <h4>Direct Chat with Employee</h4>
                        <p>Ask a direct question to the selected employee. Only they will see it and be notified.</p>
                      </>
                    ) : (
                      <>
                        <div className="md-avatar-welcome" style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', margin: '0 auto 16px' }}>
                          M
                        </div>
                        <h4>Submit Direct Ticket to Managing Director</h4>
                        <p>Your question will be added to the MD's dashboard queue. MD replies will update the company knowledge base.</p>
                        <div className="suggestion-pill-box">
                          <button className="suggest-pill" onClick={() => setMdMessage("boiler room key missing, urgent support needed")}>"boiler room key missing..."</button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  mdHistory.map((msg, index) => (
                    <div key={index} className={`message-bubble-row ${msg.sender}`}>
                      <div className="msg-avatar" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: msg.sender === 'md' ? 'var(--primary-light)' : 'var(--bg-tertiary)', color: msg.sender === 'md' ? 'var(--primary-color)' : 'var(--text-primary)', fontWeight: 'bold' }}>
                        {msg.sender === 'md' ? (
                          user.role === 'md' ? (
                            user.name?.charAt(0).toUpperCase() || 'M'
                          ) : (
                            mdProfile?.name?.charAt(0).toUpperCase() || 'M'
                          )
                        ) : (
                          user.role === 'md' ? (
                            (() => {
                              const activeEmployee = employees.find(emp => emp.id === recipient);
                              return activeEmployee ? activeEmployee.name?.charAt(0).toUpperCase() : 'E';
                            })()
                          ) : (
                            user.name?.charAt(0).toUpperCase() || 'E'
                          )
                        )}
                      </div>
                      <div className="msg-bubble-content">
                        <div className="msg-bubble-text">
                          {renderMessageText(msg.message)}
                        </div>
                        <span className="msg-timestamp">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}
              {mdLoading && (
                <div className="message-bubble-row md loading">
                  <div className="msg-avatar">
                    <img src="/md-avatar.png" alt="MD" className="md-avatar-mini" />
                  </div>
                  <div className="msg-bubble-content">
                    <div className="typing-indicator">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={mdChatEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={handleSendMd} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {showScheduler && (
                <div className="inline-scheduler-picker">
                  <div className="scheduler-picker-header">
                    <Clock size={14} className="scheduler-picker-icon" />
                    <span>Select Scheduled Send Time</span>
                    <button 
                      type="button" 
                      className="btn-close-scheduler"
                      onClick={() => {
                        setShowScheduler(false);
                        setScheduledTime('');
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="scheduler-picker-body">
                    <input 
                      type="datetime-local" 
                      className="scheduler-datetime-input"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      required
                    />
                    <span className="scheduler-tip">
                      Message will be sent automatically at the selected time.
                    </span>
                  </div>
                </div>
              )}

              {pendingAttachments.length > 0 && (
                <div className="pending-attachments-bucket">
                  {pendingAttachments.map((file, idx) => (
                    <div key={idx} className="pending-attachment-preview-card">
                      {file.mimetype.startsWith('image/') ? (
                        <img src={file.url} alt={file.filename} className="pending-image-thumb" />
                      ) : (
                        <Paperclip size={16} className="pending-file-icon" />
                      )}
                      <div className="pending-file-info">
                        <span className="pending-filename">{file.filename}</span>
                        <span className="pending-filesize">{(file.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <button
                        type="button"
                        className="remove-attachment-btn"
                        onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== idx))}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="chat-input-controls-row" style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  className="btn-icon attachment-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file or media"
                >
                  <Plus size={18} />
                </button>

                <button
                  type="button"
                  className={`btn-icon schedule-toggle-btn ${showScheduler ? 'active' : ''}`}
                  onClick={() => setShowScheduler(!showScheduler)}
                  title="Schedule this message"
                >
                  <Calendar size={18} />
                </button>

                <input
                  type="text"
                  className="input-field chat-text-input"
                  placeholder={
                    recordingRight
                      ? "Recording voice... Speak now"
                      : user.role === 'md'
                        ? (recipient === 'all' ? "Type a broadcast question for all employees..." : "Type a private question for this employee...")
                        : "Type your message or use mic..."
                  }
                  value={mdMessage}
                  onChange={(e) => setMdMessage(e.target.value)}
                  disabled={recordingRight}
                />
                
                <button
                  type="button"
                  className={`btn-icon mic-record-btn ${recordingRight ? 'recording' : ''}`}
                  onClick={() => recordingRight ? stopRecording('right') : startRecording('right')}
                  title="Record voice input"
                >
                  {recordingRight ? (
                    <div className="voice-waves">
                      <span></span><span></span><span></span>
                    </div>
                  ) : (
                    <Mic size={18} />
                  )}
                </button>
                
                <button 
                  type="submit" 
                  className={`btn ${showScheduler ? 'btn-warning' : 'btn-primary'} send-msg-btn`} 
                  disabled={(!mdMessage.trim() && pendingAttachments.length === 0) || mdLoading || (showScheduler && !scheduledTime)}
                  title={showScheduler ? "Schedule Message" : "Send Message"}
                >
                  {showScheduler ? <Clock size={16} /> : <Send size={16} />}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {activeViewerFile && (
        <FileViewerModal 
          file={activeViewerFile} 
          onClose={() => setActiveViewerFile(null)} 
        />
      )}

      <style>{`
        .dual-chat-container {
          display: flex;
          flex-direction: row;
          height: 100%;
          background-color: var(--bg-primary);
          overflow: hidden;
          position: relative;
        }

        .chat-resizer {
          width: 6px;
          height: 100%;
          cursor: col-resize;
          background-color: var(--border-color);
          position: relative;
          z-index: 100;
          transition: background-color 0.2s, width 0.2s;
          flex-shrink: 0;
        }

        .chat-resizer:hover,
        .chat-resizer:active {
          background-color: var(--primary-color);
          width: 8px;
        }

        .chat-pane {
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: var(--bg-secondary);
          min-height: 0;
          overflow: hidden;
          position: relative;
        }

        .chat-pane::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: url("/logo.png");
          background-repeat: no-repeat;
          background-position: center;
          background-size: 280px; /* adjusted watermark size */
          opacity: 0.05; /* light opacity for subtle watermark look */
          pointer-events: none; /* allows clicking through the watermark */
          z-index: 0;
        }

        .ai-chat-pane {
          background-color: var(--bg-secondary);
        }

        .md-chat-pane {
          background-color: var(--bg-secondary);
        }

        .chat-pane-header {
          padding: 16px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          background-color: rgba(var(--bg-secondary-rgb), 0.4);
          backdrop-filter: blur(10px);
          z-index: 10;
        }

        .header-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bot-avatar-wrapper, .md-avatar-wrapper {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .bot-avatar-wrapper {
          background-color: var(--primary-light);
          color: var(--primary-color);
        }

        .md-avatar-wrapper {
          background-color: var(--secondary-light);
          color: var(--secondary-color);
          border: 1px solid var(--border-color);
        }

        .md-avatar-circle {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .header-meta h3 {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
        }

        .status-indicator-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 2px;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .online-dot {
          background-color: var(--success);
          box-shadow: 0 0 8px var(--success);
        }

        .pending-dot {
          background-color: var(--warning);
          box-shadow: 0 0 8px var(--warning);
        }

        .status-text {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .chat-messages-container {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          position: relative;
          z-index: 1;
        }

        .chat-welcome-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          max-width: 340px;
          margin: 0 auto;
          animation: fadeIn 0.5s ease;
          position: relative;
          z-index: 1;
        }

        .welcome-icon {
          color: var(--text-muted);
          margin-bottom: 16px;
        }

        .chat-welcome-state h4 {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .chat-welcome-state p {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 8px;
          line-height: 1.5;
        }

        .suggestion-pill-box {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin-top: 20px;
        }

        .suggest-pill {
          background-color: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          padding: 6px 12px;
          font-size: 12px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: var(--transition-fast);
          max-width: 260px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .suggest-pill:hover {
          background-color: var(--border-color);
          color: var(--primary-color);
        }

        /* Message Bubbles */
        .message-bubble-row {
          display: flex;
          gap: 12px;
          max-width: 85%;
          animation: slideUp 0.3s ease-out;
        }

        .message-bubble-row.employee {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .message-bubble-row.ai, .message-bubble-row.md {
          align-self: flex-start;
        }

        .msg-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background-color: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          flex-shrink: 0;
          margin-top: 4px;
          overflow: hidden;
        }

        .md-avatar-welcome {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--border-color);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          margin-bottom: 16px;
        }

        .md-avatar-mini {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .employee .msg-avatar {
          background: linear-gradient(135deg, var(--secondary-color), var(--primary-color));
          color: white;
          border: none;
        }

        .msg-bubble-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .msg-bubble-text {
          padding: 12px 16px;
          border-radius: var(--radius-md);
          font-size: 14px;
          line-height: 1.5;
          white-space: pre-line;
          word-break: break-word;
          overflow-wrap: break-word;
        }

        .employee .msg-bubble-text {
          background-color: var(--primary-color);
          color: white;
          border-bottom-right-radius: 2px;
        }

        .ai .msg-bubble-text, .md .msg-bubble-text {
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
          border-bottom-left-radius: 2px;
          border: 1px solid var(--border-color);
        }

        .msg-timestamp {
          font-size: 10px;
          color: var(--text-muted);
          align-self: flex-end;
        }

        /* MD Selector Dropdown Styles */
        .md-selector-container {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          padding: 4px 12px;
        }

        .selector-icon {
          color: var(--text-muted);
        }

        .employee-select-dropdown {
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          outline: none;
        }

        /* Broadcast Banner */
        .active-broadcast-banner {
          background: var(--broadcast-banner-bg);
          border-bottom: 1px solid var(--border-color);
          padding: 12px 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .banner-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--primary-color);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .broadcast-carousel-list {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .broadcast-card {
          background: var(--glass-card-bg);
          border: var(--glass-card-border);
          border-radius: 8px;
          min-width: 260px;
          max-width: 320px;
          padding: 10px 12px;
          box-shadow: var(--shadow-sm);
          flex-shrink: 0;
          backdrop-filter: blur(5px);
        }

        .broadcast-q-text {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 8px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .contribute-btn {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
        }

        /* MD Broadcast Dashboard */
        .md-broadcast-dashboard {
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .dashboard-intro {
          text-align: center;
          padding: 20px;
          border-radius: 12px;
          background-color: var(--bg-tertiary);
          border: 1px dashed var(--border-color);
        }

        .dashboard-intro h4 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .dashboard-intro p {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .broadcast-questions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .broadcast-questions-list h5 {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
        }

        .empty-broadcast-state {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          padding: 20px;
        }

        .broadcast-q-card-md {
          background-color: var(--glass-card-bg);
          border: var(--glass-card-border);
          border-radius: 8px;
          padding: 14px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          backdrop-filter: blur(5px);
        }

        .broadcast-q-card-md:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          border-color: var(--primary-color);
        }

        .q-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 12px;
          text-transform: uppercase;
        }

        .badge-pending {
          background-color: var(--warning-light);
          color: var(--warning);
        }

        .q-date {
          font-size: 10px;
          color: var(--text-muted);
        }

        .q-text {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.4;
          margin-bottom: 10px;
        }

        .q-card-footer {
          font-size: 11px;
          color: var(--primary-color);
          font-weight: 500;
        }

        /* Thread View Layout */
        .thread-wrapper {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .thread-header-bar {
          background-color: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .back-btn {
          font-size: 12px;
          padding: 6px 12px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .thread-header-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .thread-label {
          font-size: 10px;
          text-transform: uppercase;
          color: var(--primary-color);
          font-weight: 700;
        }

        .thread-title-text {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .thread-messages {
          flex: 1;
          background-color: var(--bg-primary);
        }

        .thread-empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-muted);
        }

        .thread-empty-state p {
          font-size: 12px;
          margin-top: 8px;
        }

        .loading-state {
          text-align: center;
          color: var(--text-muted);
          font-size: 12px;
          padding: 20px;
        }

        .delete-broadcast-btn {
          padding: 4px;
          color: var(--text-muted);
          transition: color 0.2s, transform 0.2s;
          cursor: pointer;
          border: none;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .delete-broadcast-btn:hover {
          color: var(--error) !important;
          transform: scale(1.15);
        }

        /* Input Form */
        .chat-input-form {
          padding: 16px 24px;
          border-top: 1px solid var(--border-color);
          display: flex;
          gap: 12px;
          align-items: center;
          background-color: var(--bg-secondary);
        }

        .chat-text-input {
          flex: 1;
        }

        .mic-record-btn {
          position: relative;
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

        /* Typing indicator */
        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 4px 8px;
        }

        .typing-indicator span {
          width: 6px;
          height: 6px;
          background-color: var(--text-muted);
          border-radius: 50%;
          animation: voiceWave 1s infinite alternate;
        }

        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        /* Attachment styles */
        .attachment-btn {
          background-color: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          transition: transform 0.2s ease, background-color 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .attachment-btn:hover {
          background-color: var(--bg-primary);
          color: var(--primary-color);
          transform: scale(1.05);
        }

        .chat-image-attachment {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 250px;
        }

        .attached-image-preview {
          width: 100%;
          max-height: 180px;
          object-fit: cover;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          cursor: pointer;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .attached-image-preview:hover {
          opacity: 0.9;
          transform: scale(1.01);
        }

        .attachment-filename {
          font-size: 11px;
          color: var(--text-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-file-attachment-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 10px 14px;
          margin-top: 8px;
          text-decoration: none;
          color: var(--text-primary);
          transition: background-color 0.2s ease, border-color 0.2s ease;
          max-width: 280px;
        }

        .chat-file-attachment-card:hover {
          background-color: var(--bg-tertiary);
          border-color: var(--primary-color);
        }

        .chat-file-attachment-card svg {
          color: var(--primary-color);
          flex-shrink: 0;
        }

        .chat-file-attachment-card .file-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .chat-file-attachment-card .file-name {
          font-size: 13px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-primary);
        }

        .chat-file-attachment-card .file-download-text {
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        /* Pending attachments bucket */
        .pending-attachments-bucket {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding: 8px 0 12px 0;
          border-bottom: 1px solid var(--border-color);
          width: 100%;
        }

        .pending-attachment-preview-card {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 6px 10px;
          position: relative;
          min-width: 140px;
          max-width: 200px;
          animation: slideInUp 0.2s ease-out;
        }

        .pending-image-thumb {
          width: 28px;
          height: 28px;
          object-fit: cover;
          border-radius: 4px;
          border: 1px solid var(--border-color);
        }

        .pending-file-icon {
          color: var(--primary-color);
        }

        .pending-file-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }

        .pending-filename {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pending-filesize {
          font-size: 9px;
          color: var(--text-muted);
          margin-top: 1px;
        }

        .remove-attachment-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          padding: 0 4px;
          line-height: 1;
          transition: color 0.2s ease;
        }

        .remove-attachment-btn:hover {
          color: var(--error);
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .scheduled-messages-banner {
          background-color: rgba(235, 94, 40, 0.08);
          border-bottom: 1px solid var(--border-color);
          padding: 10px 16px;
          z-index: 15;
        }

        .scheduled-banner-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }

        .banner-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: var(--primary-color);
          font-size: 13px;
        }

        .btn-toggle-scheduled {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          font-weight: 500;
          text-decoration: underline;
        }

        .btn-toggle-scheduled:hover {
          color: var(--text-primary);
        }

        .scheduled-messages-queue-list {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 200px;
          overflow-y: auto;
          padding-bottom: 4px;
        }

        .scheduled-item-card {
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 8px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .scheduled-item-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .scheduled-item-text {
          font-size: 13px;
          color: var(--text-primary);
          word-break: break-all;
        }

        .scheduled-item-time {
          font-size: 11px;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .btn-cancel-scheduled {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s, color 0.2s;
        }

        .btn-cancel-scheduled:hover {
          background-color: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .inline-scheduler-picker {
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: var(--shadow-sm);
        }

        .scheduler-picker-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .scheduler-picker-icon {
          color: var(--primary-color);
        }

        .btn-close-scheduler {
          margin-left: auto;
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 2px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-close-scheduler:hover {
          background-color: var(--bg-secondary);
          color: var(--text-primary);
        }

        .scheduler-picker-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .scheduler-datetime-input {
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background-color: var(--bg-secondary);
          color: var(--text-primary);
          font-family: inherit;
          font-size: 13px;
          outline: none;
        }

        .scheduler-datetime-input:focus {
          border-color: var(--primary-color);
        }

        .scheduler-tip {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .schedule-toggle-btn {
          color: var(--text-secondary);
          transition: color 0.2s, background-color 0.2s;
        }

        .schedule-toggle-btn:hover {
          color: var(--primary-color);
          background-color: rgba(235, 94, 40, 0.08);
        }

        .schedule-toggle-btn.active {
          color: var(--primary-color);
          background-color: rgba(235, 94, 40, 0.12);
        }

        @media (max-width: 768px) {
          .dual-chat-container {
            grid-template-columns: 1fr;
            height: auto;
          }
          .md-chat-pane {
            border-top: 1px solid var(--border-color);
          }
        }
      `}</style>
    </div>
  );
}

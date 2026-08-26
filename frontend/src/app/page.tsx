'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  metadata?: any;
  timestamp: Date;
}

interface Project {
  id: string;
  name: string;
  language: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Ready. Describe what you want to build — I\'ll write the code, run it, and explain everything.',
      provider: 'CC',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<string>('default');
  const [userApiKey, setUserApiKey] = useState('');
  const [userProvider, setUserProvider] = useState('openai');
  const [selectedModel, setSelectedModel] = useState('auto');
  const [showModelSelect, setShowModelSelect] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/projects`);
      setProjects(res.data);
    } catch (e) {
      console.log('No projects yet');
    }
  };

  const createProject = async (name: string) => {
    try {
      const res = await axios.post(`${API_URL}/api/projects`, {
        name,
        language: 'javascript',
        userId: 'guest'
      });
      setProjects(prev => [res.data, ...prev]);
      setCurrentProject(res.data.id);
      setMessages([{
        id: 'welcome-' + res.data.id,
        role: 'assistant',
        content: `Project "${name}" created. What would you like to build?`,
        provider: 'CC',
        timestamp: new Date()
      }]);
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const res = await axios.post(`${API_URL}/api/ai/chat`, {
        projectId: currentProject,
        message: text,
        provider: selectedModel === 'auto' ? 'auto' : selectedModel,
        userApiKey: userApiKey || undefined,
        userProvider: userProvider
      }, { timeout: 120000 });

      const aiMsg: Message = {
        id: res.data.message.id || uuidv4(),
        role: 'assistant',
        content: res.data.message.content,
        provider: res.data.provider,
        model: res.data.model,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: err.response?.data?.error || 'Something went wrong. Retrying in a moment...',
        provider: 'System',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);

      if (err.response?.data?.retryAfter) {
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: uuidv4(),
            role: 'assistant',
            content: 'Retrying now...',
            provider: 'System',
            timestamp: new Date()
          }]);
          sendMessage();
        }, (err.response.data.retryAfter + 5) * 1000);
      }
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, currentProject, selectedModel, userApiKey, userProvider]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const models = [
    { id: 'auto', name: 'Auto Route', desc: 'Smart selection' },
    { id: 'cc-v1', name: 'CC v1', desc: 'Deep coding' },
    { id: 'cc-v2', name: 'CC v2', desc: 'Fast inference' },
    { id: 'custom', name: 'Your Key', desc: 'Use your API' }
  ];

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const renderMessage = (msg: Message) => {
    const hasCode = msg.content.includes('```');
    const parts = msg.content.split(/(```[\s\S]*?```)/g);

    return (
      <div className="msg-body">
        <div className="msg-name">{msg.role === 'assistant' ? 'CC' : 'You'}</div>
        <div className={`msg-bubble ${msg.role}`}>
          {parts.map((part, i) => {
            if (part.startsWith('```')) {
              const code = part.replace(/```[\w]*\n?/, '').replace(/```$/, '');
              const lang = part.match(/```(\w+)/)?.[1] || 'code';
              return (
                <div key={i} style={{ marginTop: 8 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', background: '#0a0a0f', borderRadius: '8px 8px 0 0',
                    borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 11, color: '#4b5563'
                  }}>
                    <span>{lang}</span>
                    <button onClick={() => copyCode(code)} style={{
                      background: 'transparent', border: 'none', color: '#6b7280',
                      fontSize: 11, cursor: 'pointer'
                    }}>Copy</button>
                  </div>
                  <pre style={{ borderRadius: '0 0 8px 8px', marginTop: 0 }}>
                    <code>{code}</code>
                  </pre>
                </div>
              );
            }
            return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
          })}
          {msg.role === 'assistant' && hasCode && (
            <div className="msg-actions">
              <button className="msg-action primary">▶ Run</button>
              <button className="msg-action">📋 Copy All</button>
              <button className="msg-action">🔍 Explain</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="header">
        <button className="menu-btn" onClick={() => setDrawerOpen(true)}>☰</button>
        <div className="brand">
          <span className="brand-dot"></span>
          CC <span>- indirect</span>
        </div>
        <div className="header-right">
          <span className="status-text">● online</span>
        </div>
      </header>

      <main className="main" ref={mainRef}>
        <div className="hero">
          <h1>Build with<br /><span>intelligence.</span></h1>
          <p>Describe what you want. The AI writes, debugs, and deploys — all in one chat.</p>
        </div>

        <div className="chat-area">
          {messages.map((msg) => (
            <div key={msg.id} className="msg" style={{ animation: 'msgIn 0.25s ease' }}>
              <div className={`msg-avatar ${msg.role}`}>
                {msg.role === 'assistant' ? '◈' : '◉'}
              </div>
              {renderMessage(msg)}
            </div>
          ))}

          {isTyping && (
            <div className="msg">
              <div className="msg-avatar ai">◈</div>
              <div className="msg-body">
                <div className="msg-name">CC</div>
                <div className="msg-bubble ai" style={{ padding: '14px 16px' }}>
                  <span className="typing-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#4b5563', marginRight: 4 }}></span>
                  <span className="typing-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#4b5563', marginRight: 4 }}></span>
                  <span className="typing-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#4b5563' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <div className="input-wrap">
        <div className="input-box">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Describe what to build..."
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={handleKeyDown}
          />
          <button className="send-btn" onClick={sendMessage} disabled={isTyping || !input.trim()}>
            ↑
          </button>
        </div>
        <div className="input-hint">Enter to send · Shift+Enter for new line</div>
      </div>

      <div className={`drawer-overlay ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-logo">◈</div>
          <div className="drawer-header-text">
            <div className="drawer-header-title">CC - indirect</div>
            <div className="drawer-header-sub">v1.0.0</div>
          </div>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <div className="drawer-section-title">Workspace</div>
            <div className="drawer-item" onClick={() => { setActiveTab('projects'); }}>
              <span className="drawer-item-icon">📁</span>
              <span className="drawer-item-text">Projects</span>
              <span className="drawer-item-arrow">›</span>
            </div>
            {activeTab === 'projects' && (
              <div className="drawer-sub open">
                <div className="drawer-sub-item" onClick={() => {
                  const name = prompt('Project name?');
                  if (name) createProject(name);
                }}>+ New Project</div>
                {projects.map(p => (
                  <div key={p.id} className="drawer-sub-item" onClick={() => {
                    setCurrentProject(p.id);
                    setDrawerOpen(false);
                  }}>{p.name}</div>
                ))}
              </div>
            )}
            <div className="drawer-item">
              <span className="drawer-item-icon">🗑️</span>
              <span className="drawer-item-text">Clear Chat</span>
            </div>
          </div>

          <div className="drawer-section">
            <div className="drawer-section-title">AI Model</div>
            <div className="drawer-item" onClick={() => setShowModelSelect(!showModelSelect)}>
              <span className="drawer-item-icon">🤖</span>
              <span className="drawer-item-text">
                {models.find(m => m.id === selectedModel)?.name || 'Auto'}
              </span>
              <span className="drawer-item-arrow">›</span>
            </div>
            {showModelSelect && (
              <div className="model-list">
                {models.map(m => (
                  <div key={m.id} className={`model-item ${selectedModel === m.id ? 'selected' : ''}`}
                    onClick={() => { setSelectedModel(m.id); setShowModelSelect(false); }}>
                    <span className={`model-item-dot ${m.id !== 'custom' ? 'on' : 'off'}`} />
                    <span className="model-item-name">{m.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="drawer-section">
            <div className="drawer-section-title">API Keys</div>
            <div className="drawer-item" onClick={() => setActiveTab(activeTab === 'keys' ? '' : 'keys')}>
              <span className="drawer-item-icon">🔑</span>
              <span className="drawer-item-text">Your Keys</span>
              <span className="drawer-item-arrow">›</span>
            </div>
            {activeTab === 'keys' && (
              <div className="key-section">
                <div className="key-label">Your API Key (Optional)</div>
                <input
                  className="key-input"
                  type="password"
                  placeholder="sk-..."
                  value={userApiKey}
                  onChange={(e) => setUserApiKey(e.target.value)}
                />
                <div className="key-label">Provider</div>
                <select
                  className="key-input"
                  value={userProvider}
                  onChange={(e) => setUserProvider(e.target.value)}
                  style={{ color: '#9ca3af' }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="gemini">Gemini</option>
                  <option value="anthropic">Anthropic</option>
                </select>
                <button className="key-save" onClick={() => {
                  alert('Key saved!');
                  setDrawerOpen(false);
                }}>Save Key</button>
              </div>
            )}
          </div>

          <div className="drawer-section">
            <div className="drawer-section-title">System</div>
            <div className="drawer-item">
              <span className="drawer-item-icon">🌙</span>
              <span className="drawer-item-text">Dark Mode</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#374151' }}>On</span>
            </div>
            <div className="drawer-item">
              <span className="drawer-item-icon">ℹ️</span>
              <span className="drawer-item-text">About</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

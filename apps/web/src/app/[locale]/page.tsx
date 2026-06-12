'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from '@/components/Icon';
import { VPSourceCard } from '@/components/validity/SourceCard';
import { DocumentModal } from '@/components/validity/DocumentModal';
import type { Source } from '@/lib/validity-ui';

type Message = {
  role: 'user' | 'ai';
  content: string;
  sources?: Source[];
  time?: string;
};

const SUGGESTIONS = [
  'Berapa tarif pajak sarang burung walet?',
  'Apa sanksi jika tidak melaporkan SPTPD?',
  'Kewajiban hotel terkait narkotika',
  'Bagaimana retribusi parkir dihitung?',
];

export default function Home() {
  const [isChatStarted, setIsChatStarted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Source | null>(null);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load history + theme preference
  useEffect(() => {
    const savedMessages = localStorage.getItem('vp_chat_history');
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages) as Message[];
        if (parsed.length > 0) {
          setMessages(parsed);
          setIsChatStarted(true);
        }
      } catch (e) {
        console.error(e);
      }
    }
    const savedTheme = localStorage.getItem('vp_theme');
    if (savedTheme === 'dark') setIsDarkMode(true);
  }, []);

  // Toggle .dark on <html> so CSS variables flip
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Persist history
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('vp_chat_history', JSON.stringify(messages));
    }
  }, [messages]);

  // Auto-scroll on new messages if user is near the bottom
  useEffect(() => {
    if (messages.length > 0 || loading) {
      const container = chatContainerRef.current;
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 250) {
        setTimeout(() => container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }), 80);
      }
    }
  }, [messages, loading]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('vp_theme', newMode ? 'dark' : 'light');
    setIsMenuOpen(false);
  };

  const getCurrentTime = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleNewChat = () => {
    if (confirm('Hapus semua percakapan dan mulai baru?')) {
      setMessages([]);
      localStorage.removeItem('vp_chat_history');
      setIsChatStarted(false);
    }
  };

  const submitQuery = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;

    const userTime = getCurrentTime();
    // Send the prior turns so the assistant has conversation context (answers
    // follow-ups, greets only once). Keep it compact: last 8 turns, role+content.
    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
    const baseMessages: Message[] = [...messages, { role: 'user', content: q, time: userTime }];
    setMessages(baseMessages);
    setQuery('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, history }),
      });
      if (!response.ok) throw new Error('Terjadi kesalahan.');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('Tidak ada stream.');

      let aiMessageContent = '';
      let aiSources: Source[] = [];
      const aiTime = getCurrentTime();
      setMessages([...baseMessages, { role: 'ai', content: '', time: aiTime }]);
      setLoading(false);

      let isDone = false;
      let buffer = '';
      while (!isDone) {
        const { done, value } = await reader.read();
        if (done) { isDone = true; break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'sources') aiSources = parsed.data;
            else if (parsed.type === 'text') aiMessageContent += parsed.data;
            else if (parsed.type === 'error') aiMessageContent += '\n[Error: ' + parsed.data + ']';
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'ai',
                content: aiMessageContent,
                sources: aiSources.length > 0 ? aiSources : undefined,
                time: aiTime,
              };
              return updated;
            });
          } catch (e) {
            console.error('Error parsing NDJSON chunk', e);
          }
        }
      }
    } catch {
      setMessages([...baseMessages, { role: 'ai', content: 'Maaf, terjadi kesalahan server.', time: getCurrentTime() }]);
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuery(query);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setIsChatStarted(true);
    submitQuery(suggestion);
  };

  const canSend = query.trim().length > 0 && !loading;

  return (
    <div className="vp-app">
      {/* Header */}
      <header className="vp-header">
        <button
          type="button"
          className="vp-header-btn"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Menu"
        >
          <Icon name={isMenuOpen ? 'x' : 'menu'} size={20} />
        </button>
        <div className="vp-header-brand">
          <span className="vp-header-title">Vector Pasal</span>
          <span className="vp-header-subtitle">Satpol PP Bolaang Mongondow</span>
        </div>
        <div className="vp-header-right">
          {isChatStarted && (
            <button
              type="button"
              className="vp-header-btn vp-new-chat-btn"
              onClick={handleNewChat}
              aria-label="Chat baru"
            >
              <Icon name="rotate-ccw" size={18} />
              <span>Baru</span>
            </button>
          )}
        </div>
      </header>

      {isMenuOpen && (
        <>
          <div className="vp-menu-overlay" onClick={() => setIsMenuOpen(false)} />
          <nav className="vp-menu">
            <button type="button" className="vp-menu-item" onClick={toggleDarkMode}>
              <Icon name={isDarkMode ? 'sun' : 'moon'} size={16} />
              <span>{isDarkMode ? 'Mode Terang' : 'Mode Gelap'}</span>
            </button>
            <div className="vp-menu-divider" />
            <button
              type="button"
              className="vp-menu-item"
              onClick={() => { setShowGuideModal(true); setIsMenuOpen(false); }}
            >
              <Icon name="book-open" size={16} />
              <span>Panduan Aplikasi</span>
            </button>
            <button
              type="button"
              className="vp-menu-item"
              onClick={() => { setShowAboutModal(true); setIsMenuOpen(false); }}
            >
              <Icon name="info" size={16} />
              <span>Tentang</span>
            </button>
          </nav>
        </>
      )}

      <div className="vp-chat-area" ref={chatContainerRef}>
        <div className="vp-chat-inner">
          {!isChatStarted && messages.length === 0 ? (
            <div className="vp-welcome">
              <div className="vp-welcome-icon">
                <img src="/icon.png" alt="Vector Pasal" className="vp-logo-img" />
              </div>
              <div className="vp-welcome-label">Asisten Hukum AI</div>
              <h2 className="vp-welcome-heading">
                Halo! Ada yang bisa dibantu tentang Peraturan Daerah Bolaang Mongondow?
              </h2>
              <div className="vp-welcome-divider" />
              <span className="vp-welcome-hint">Coba tanyakan</span>
              <div className="vp-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="vp-suggestion-chip"
                    onClick={() => handleSuggestionClick(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.length > 0 && (
                <div className="vp-date-divider"><span>Hari Ini</span></div>
              )}
              {messages.map((msg, i) => msg.role === 'user' ? (
                <div key={i} className="vp-message vp-message-user">
                  <div className="vp-bubble-user">
                    <p>{msg.content}</p>
                    {msg.time && (
                      <span className="vp-msg-meta vp-msg-meta-user">
                        {msg.time}
                        <Icon name="check-check" size={13} strokeWidth={2} style={{ marginLeft: 4, opacity: 0.7 }} />
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div key={i} className="vp-message vp-message-ai">
                  <div className="vp-ai-avatar">
                    <img src="/icon.png" alt="Vector Pasal" className="vp-logo-img" />
                  </div>
                  <div className="vp-ai-body">
                    <span className="vp-ai-name">Vector Pasal</span>
                    <div className="vp-ai-content vp-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="vp-sources">
                        <span className="vp-sources-label">
                          <Icon name="file-text" size={12} style={{ marginRight: 4 }} />
                          Sumber Dokumen
                        </span>
                        {msg.sources.map((src, idx) => (
                          <VPSourceCard key={idx} source={src} onViewFull={setSelectedDocument} />
                        ))}
                      </div>
                    )}
                    {msg.time && <span className="vp-msg-meta">{msg.time}</span>}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="vp-message vp-message-ai">
                  <div className="vp-ai-avatar">
                    <img src="/icon.png" alt="Vector Pasal" className="vp-logo-img" />
                  </div>
                  <div className="vp-typing">
                    <div className="vp-typing-dots">
                      <span className="vp-dot" />
                      <span className="vp-dot" />
                      <span className="vp-dot" />
                    </div>
                  </div>
                </div>
              )}
              <div style={{ height: 32 }} />
            </>
          )}
        </div>
      </div>

      <div className="vp-gradient-mask" />
      <div className="vp-input-area">
        <form className="vp-input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="vp-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tanya seputar Perda Bolmong..."
            disabled={loading}
            autoComplete="off"
          />
          <button
            type="submit"
            className={`vp-send-btn ${canSend ? 'vp-send-active' : ''}`}
            disabled={!canSend}
            aria-label="Kirim"
          >
            <Icon name="arrow-up" size={18} strokeWidth={2.25} />
          </button>
        </form>
        <p className="vp-disclaimer">AI dapat membuat kesalahan. Verifikasi dengan dokumen resmi.</p>
        <p className="vp-footer-credit">Vector Pasal v1.4 · Develop by Viddie Pilat</p>
      </div>

      {/* Document modal */}
      {selectedDocument && (
        <DocumentModal source={selectedDocument} onClose={() => setSelectedDocument(null)} />
      )}

      {/* Guide modal */}
      {showGuideModal && (
        <div className="vp-modal-overlay" onClick={() => setShowGuideModal(false)}>
          <div className="vp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vp-modal-header">
              <h3 className="vp-modal-title">
                <Icon name="book-open" size={18} style={{ marginRight: 8 }} />
                Panduan Aplikasi
              </h3>
              <button type="button" className="vp-modal-close" onClick={() => setShowGuideModal(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="vp-modal-body">
              <div className="vp-guide-steps">
                <div className="vp-guide-step">
                  <div className="vp-guide-num">1</div>
                  <div>
                    <h4 className="vp-guide-step-title">Ajukan Pertanyaan</h4>
                    <p className="vp-guide-step-desc">Gunakan bahasa sehari-hari. Contoh: &ldquo;Apa aturan tentang hewan ternak di jalan?&rdquo;</p>
                  </div>
                </div>
                <div className="vp-guide-step">
                  <div className="vp-guide-num">2</div>
                  <div>
                    <h4 className="vp-guide-step-title">Periksa Sumber</h4>
                    <p className="vp-guide-step-desc">Klik &ldquo;Buka Dokumen&rdquo; pada sumber untuk melihat teks asli Peraturan Daerah.</p>
                  </div>
                </div>
                <div className="vp-guide-step">
                  <div className="vp-guide-num">3</div>
                  <div>
                    <h4 className="vp-guide-step-title">Verifikasi</h4>
                    <p className="vp-guide-step-desc">AI dapat membuat kesalahan. Selalu verifikasi dengan dokumen fisik untuk keperluan hukum resmi.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="vp-modal-footer">
              <button type="button" className="vp-btn-primary vp-btn-full" onClick={() => setShowGuideModal(false)}>
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About modal */}
      {showAboutModal && (
        <div className="vp-modal-overlay" onClick={() => setShowAboutModal(false)}>
          <div className="vp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vp-modal-header">
              <h3 className="vp-modal-title">Tentang</h3>
              <button type="button" className="vp-modal-close" onClick={() => setShowAboutModal(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="vp-modal-body" style={{ textAlign: 'center' }}>
              <div className="vp-about-icon">
                <img src="/icon.png" alt="Vector Pasal" className="vp-logo-img" />
              </div>
              <h3 className="vp-about-name">Vector Pasal</h3>
              <p className="vp-about-tagline">Smart Legal Assistant</p>
              <p className="vp-about-desc">
                Asisten digital berbasis AI untuk mendigitalisasi dan memudahkan akses informasi hukum bagi petugas Satpol PP Kabupaten Bolaang Mongondow.
              </p>
              <div className="vp-about-dev">
                <div className="vp-about-avatar">V</div>
                <div className="vp-about-dev-info">
                  <span className="vp-about-dev-name">Viddie Pilat</span>
                  <span className="vp-about-dev-role">Developer &amp; Architect</span>
                </div>
                <span className="vp-about-version">v1.4</span>
              </div>
            </div>
            <div className="vp-modal-footer">
              <button type="button" className="vp-btn-primary vp-btn-full" onClick={() => setShowAboutModal(false)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

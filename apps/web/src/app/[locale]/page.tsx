'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- COMPONENT: Expandable Source Card ---
// UPDATED: Added onViewFull function prop
function ExpandableSource({ source, isDarkMode, onViewFull }: { source: any, isDarkMode: boolean, onViewFull: (s: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = source.content.length > 100;

  const meta = source.metadata || {};
  
  // Format the citation header
  const perdaType = meta.type === 'PERDA_KAB' ? 'Perda Kab.' : (meta.type || 'Perda');
  const perdaInfo = `${perdaType} No. ${meta.number || '?'}/${meta.year || '?'}`;
  
  // Format Pasal and Ayat
  const pasalLabel = `Pasal ${meta.pasal || '?'}`;
  const ayatLabel = meta.ayat ? `Ayat (${meta.ayat})` : "";

  return (
    <div
      onClick={() => isLong && setExpanded(!expanded)}
      className={`p-5 rounded-2xl text-[13px] transition-all duration-300 border mb-1
        ${isDarkMode
          ? 'bg-[#0f172a] border-emerald-900/30 text-gray-300 hover:bg-[#1e293b]'
          : 'bg-white border-emerald-50 text-slate-700 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-emerald-100'} 
        ${isLong ? 'cursor-pointer' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex flex-col gap-0.5">
          <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${isDarkMode ? 'text-emerald-500' : 'text-emerald-700'}`}>
            {perdaInfo}
          </span>
          <span className={`text-[13px] font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
            {pasalLabel}{ayatLabel ? ` • ${ayatLabel}` : ''}
          </span>
        </div>
        <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${isDarkMode ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'}`}>
          SUMBER
        </div>
      </div>

      <div className={`${expanded ? '' : 'line-clamp-2'} leading-relaxed font-serif text-[13.5px]`}>
        {source.content}
      </div>
      
      {isLong && !expanded && (
        <span className={`font-bold text-[10px] uppercase tracking-wider mt-3 block ${isDarkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>
          Lihat selengkapnya ▾
        </span>
      )}
      {isLong && expanded && (
        <span className={`font-bold text-[10px] uppercase tracking-wider mt-4 block ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
          Tutup teks ▴
        </span>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onViewFull(source); }}
        className={`mt-4 w-full py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all flex justify-center items-center gap-2 group
          ${isDarkMode
            ? 'bg-transparent border border-emerald-900/50 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50'
            : 'bg-emerald-50/50 border border-emerald-100 text-emerald-800 hover:bg-white hover:border-emerald-400 hover:text-emerald-900 hover:shadow-sm'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        Buka Dokumen Penuh
      </button>
    </div>
  );
}

export default function Home() {
  const [isChatStarted, setIsChatStarted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; sources?: any[]; time?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // --- STATE ---
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null); // NEW: Tracks which document is currently open in the modal
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // --- LOAD PREFERENCES (HISTORY & THEME) ---
  useEffect(() => {
    const savedMessages = localStorage.getItem('vp_chat_history');
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        if (parsed.length > 0) {
          setMessages(parsed);
          setIsChatStarted(true);
        }
      } catch (e) { console.error(e); }
    }

    const savedTheme = localStorage.getItem('vp_theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
    }
  }, []);

  // --- SAVE THEME PREFERENCE ---
  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('vp_theme', newMode ? 'dark' : 'light');
    setIsMenuOpen(false);
  };

  // --- SAVE HISTORY WHENEVER MESSAGES CHANGE ---
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('vp_chat_history', JSON.stringify(messages));
    }
  }, [messages]);

  // --- SMART AUTOSCROLL LOGIC ---
  useEffect(() => {
    if (messages.length > 0 || loading) {
      const container = chatContainerRef.current;
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        // If user is within 200px of bottom, auto-scroll to show new content
        if (distanceFromBottom < 200) {
          setTimeout(() => {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: 'smooth'
            });
          }, 100);
        }
      }
    }
  }, [messages, loading]);

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleNewChat = () => {
    if (confirm("Hapus semua percakapan dan mulai baru?")) {
      setMessages([]);
      localStorage.removeItem('vp_chat_history');
      setIsChatStarted(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userTime = getCurrentTime();
    const newMessages = [...messages, { role: 'user', content: query, time: userTime }];
    setMessages(newMessages);
    setQuery('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query }),
      });

      if (!response.ok) throw new Error("Terjadi kesalahan.");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Tidak ada stream.");

      let aiMessageContent = "";
      let aiSources: any[] = [];
      const aiTime = getCurrentTime();

      setMessages([...newMessages, { role: 'ai', content: "", time: aiTime }]);
      setLoading(false); // Hide the loading bouncing dots, stream is starting

      let isDone = false;
      let buffer = '';

      while (!isDone) {
        const { done, value } = await reader.read();
        if (done) {
          isDone = true;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsedData = JSON.parse(line);
              if (parsedData.type === 'sources') {
                aiSources = parsedData.data;
              } else if (parsedData.type === 'text') {
                aiMessageContent += parsedData.data;
              } else if (parsedData.type === 'error') {
                aiMessageContent += "\n[Error: " + parsedData.data + "]";
              }

              // Update the last message dynamically
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'ai',
                  content: aiMessageContent,
                  sources: aiSources.length > 0 ? aiSources : undefined,
                  time: aiTime
                };
                return updated;
              });

            } catch (e) {
              console.error("Error parsing NDJSON chunk", e);
            }
          }
        }
      }
    } catch (error: any) {
      setMessages([...newMessages, { role: 'ai', content: 'Maaf, terjadi kesalahan server.', time: getCurrentTime() }]);
      setLoading(false);
    }
  };

  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);

  const handleMenuClick = (item: string) => {
    if (item === "Panduan Aplikasi") setShowGuideModal(true);
    if (item === "Tentang") setShowAboutModal(true);
    setIsMenuOpen(false);
  };

  return (
    <div className={`${isDarkMode ? 'dark bg-background' : 'bg-background'} min-h-screen flex justify-center font-sans transition-colors duration-500 text-foreground`}>
      <main className={`w-full max-w-4xl h-[100dvh] relative flex flex-col transition-colors duration-500 ${isDarkMode ? 'bg-background text-foreground' : 'bg-background'}`}>

        {/* Universal Top Header */}
        <header className={`flex justify-between items-center py-5 px-8 flex-shrink-0 transition-colors duration-500 sticky top-0 z-40 backdrop-blur-md ${isDarkMode ? 'bg-background/80 border-b border-white/5' : 'bg-white/80 border-b border-emerald-100/50'}`}>
          <div className="relative">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`transition-colors font-medium flex items-center gap-2 ${isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
              <span className="hidden sm:inline text-sm">Menu</span>
            </button>
            {isMenuOpen && (
              <div className={`absolute top-12 left-0 w-64 rounded-2xl shadow-2xl py-2 z-50 transform origin-top-left transition-all ${isDarkMode ? 'bg-card shadow-emerald-950/20 ring-1 ring-white/10' : 'bg-white ring-1 ring-emerald-50 shadow-emerald-900/5'}`}>
                <button onClick={toggleDarkMode} className={`w-full text-left px-5 py-3 text-[13px] font-medium flex items-center gap-3 transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {isDarkMode ? <><span className="text-amber-400">☀️</span> Mode Terang</> : <><span className="text-slate-700">🌙</span> Mode Gelap</>}
                </button>
                <div className={`h-[1px] w-full my-1 ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}></div>
                <button onClick={() => handleMenuClick("Panduan Aplikasi")} className={`w-full text-left px-5 py-3 text-[13px] font-medium flex items-center gap-3 transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-emerald-900/20' : 'text-slate-600 hover:bg-emerald-50'}`}><span className="text-emerald-600">ℹ️</span> Panduan Aplikasi</button>
                <button onClick={() => handleMenuClick("Tentang")} className={`w-full text-left px-5 py-3 text-[13px] font-medium flex items-center gap-3 transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-emerald-900/20' : 'text-slate-600 hover:bg-emerald-50'}`}><span className="text-emerald-500">🏢</span> Tentang</button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center">
            <h1 className={`font-semibold text-[15px] tracking-tight flex items-center justify-center gap-3 ${isDarkMode ? 'text-slate-100' : 'text-foreground'}`}>
              <Image
                src="/icon.png"
                alt="Vector Pasal Logo"
                width={32}
                height={32}
                priority
                className="object-contain"
                style={{
                  filter: isDarkMode
                    ? 'invert(1) brightness(2) drop-shadow(0 0 8px rgba(212, 175, 55, 0.3))'
                    : 'drop-shadow(0 0 8px rgba(212, 175, 55, 0.3))'
                }}
              />
              Vector Pasal
            </h1>
            <span className={`text-[10px] tracking-widest uppercase font-semibold mt-0.5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Satpol PP Bolaang Mongondow</span>
          </div>

          <div className="flex space-x-4 items-center w-12 justify-end">
            {isChatStarted && (
              <button onClick={handleNewChat} className={`text-sm font-medium transition-colors ${isDarkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-red-600'}`}>Tutup</button>
            )}
          </div>
        </header>

        {/* --- SCREEN 1: WELCOME SCREEN --- */}
        {!isChatStarted ? (
          <div className="flex-1 flex flex-col relative z-0">
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className={`w-full max-w-lg flex flex-col items-center text-center px-6 py-12 rounded-[2rem] transition-all duration-500 border-0 ${isDarkMode ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/40 via-background to-background shadow-[0_0_40px_-10px_rgba(16,185,129,0.1)]' : 'bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]'}`}>

                {/* Government Crest Logo Concept */}
                <div className={`w-20 h-20 rounded-full p-1 flex items-center justify-center shadow-lg transition-transform hover:scale-105 duration-300 ${isDarkMode ? 'bg-gradient-to-br from-emerald-800 to-emerald-950 border border-white/5 shadow-emerald-950/20' : 'bg-gradient-to-br from-emerald-900 to-emerald-800 border border-emerald-700/50 shadow-emerald-900/20'}`}>
                  <Image
                    src="/icon.png"
                    alt="Welcome Logo"
                    width={80}
                    height={80}
                    priority
                    className="object-contain w-full h-full drop-shadow-sm"
                    style={{ filter: 'invert(1) brightness(2) drop-shadow(0 0 8px rgba(212, 175, 55, 0.3))' }}
                  />
                </div>

                <h2 className={`mt-8 text-3xl font-bold tracking-tight ${isDarkMode ? 'text-white drop-shadow-md' : 'text-emerald-950'}`}>
                  Asisten <span className={isDarkMode ? 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500' : 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-800 to-emerald-600'}>Hukum AI</span>
                </h2>

                <p className={`mt-5 leading-relaxed text-[15px] max-w-md ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Portal pencarian cerdas untuk Peraturan Daerah. Dirancang khusus untuk efisiensi dan akurasi petugas Satpol PP.
                </p>

                <button onClick={() => setIsChatStarted(true)} className={`mt-10 px-10 py-3.5 rounded-full font-semibold text-[15px] transition-all duration-300 shadow-lg flex items-center gap-2 group
                  ${isDarkMode
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 hover:scale-105 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                    : 'bg-emerald-900 text-white hover:bg-emerald-800 hover:shadow-[0_8px_20px_-4px_rgba(6,78,59,0.3)] hover:-translate-y-0.5'}`}>
                  Mulai Konsultasi
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </div>
            </div>
            <div className={`py-8 flex flex-col items-center justify-center text-center ${isDarkMode ? 'text-slate-700' : 'text-slate-400'}`}>
              <span className="text-xs tracking-widest uppercase font-semibold mb-1.5">Vector Pasal v1.3</span>
              <span className={`text-[10px] tracking-wider uppercase font-medium ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Develop by Viddie Pilat</span>
            </div>
          </div>
        ) : (

          /* --- SCREEN 2: CHAT SCREEN --- */
          <div className="flex-1 flex flex-col relative z-0 min-h-0">
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8 pb-32 scroll-smooth"
            >

              <div className="w-full max-w-3xl mx-auto space-y-8">

                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center animate-fade-in mt-10">
                    <span className={`text-4xl mb-4 opacity-50 ${isDarkMode ? 'text-emerald-500' : 'text-emerald-900'}`}>💬</span>
                    <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Sistem siap. Silakan ketik pertanyaan terkait Perda.</p>
                  </div>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end gap-3`}>

                        {/* Avatar */}
                        {msg.role === 'ai' && (
                          <div className={`w-12 h-12 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center shadow-sm mb-1 p-0.5 ${isDarkMode ? 'bg-gradient-to-br from-emerald-600 to-teal-700' : 'bg-gradient-to-br from-emerald-900 to-emerald-800'}`}>
                            <img src="/icon.png" alt="AI Icon" className="w-full h-full object-contain" style={{ filter: 'invert(1) brightness(2)' }} />
                          </div>
                        )}

                        {/* Message Bubble Minimalist Notion Style */}
                        <div className="flex flex-col gap-1 w-full max-w-full">
                          {/* Sender & Time metadata aligned correctly outside the bubble */}
                          <div className={`text-[10px] uppercase font-bold tracking-wider px-1 mb-1 ${msg.role === 'user' ? 'text-right' : 'text-left'} ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                            {msg.role === 'user' ? 'Anda' : 'Sistem AI'} <span className="opacity-50 mx-1">•</span> {msg.time}
                          </div>

                          <div className={`px-5 py-4 rounded-2xl text-[14.5px] leading-relaxed break-words overflow-x-hidden w-full
                            ${msg.role === 'user'
                              ? isDarkMode
                                ? 'bg-emerald-900/30 text-emerald-50 ring-1 ring-emerald-500/20 rounded-br-sm'
                                : 'bg-emerald-50 text-emerald-900 rounded-br-sm'
                              : isDarkMode
                                ? 'bg-card text-slate-300 ring-1 ring-white/5 rounded-bl-sm shadow-xl shadow-black/20'
                                : 'bg-white text-slate-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] rounded-bl-sm border border-emerald-50'
                            }`}>

                            {msg.role === 'user' ? (
                              msg.content
                            ) : (
                              <div className={`[&>p]:mb-4 last:[&>p]:mb-0 [&>ul]:list-none [&>ul>li]:relative [&>ul]:pl-5 [&>ul>li]:before:content-[''] [&>ul>li]:before:absolute [&>ul>li]:before:left-[-15px] [&>ul>li]:before:top-[8px] [&>ul>li]:before:h-1.5 [&>ul>li]:before:w-1.5 [&>ul>li]:before:bg-amber-400 [&>ul>li]:before:rounded-full [&>ol]:list-decimal [&>ol]:ml-5 [&>strong]:font-semibold ${isDarkMode ? '[&>strong]:text-white' : '[&>strong]:text-slate-900'} w-full overflow-hidden break-words`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                              </div>
                            )}

                            {msg.sources && msg.sources.length > 0 && (
                              <div className="mt-6 flex flex-col space-y-3">
                                <div className={`h-[1px] w-full ${isDarkMode ? 'bg-gradient-to-r from-white/10 to-transparent' : 'bg-gradient-to-r from-slate-200 to-transparent'}`}></div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center mb-2 ${isDarkMode ? 'text-emerald-500' : 'text-emerald-800'}`}>
                                  Sumber Dokumen
                                </span>
                                {msg.sources.map((source, idx) => (
                                  <ExpandableSource key={idx} source={source} isDarkMode={isDarkMode} onViewFull={setSelectedDocument} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  ))
                )}

                {loading && (
                  <div className="flex w-full justify-start">
                    <div className="flex max-w-[85%] flex-row items-end gap-3">
                      <div className={`w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center shadow-sm mb-1 p-0.5 ${isDarkMode ? 'bg-gradient-to-br from-emerald-600 to-teal-700' : 'bg-gradient-to-br from-emerald-900 to-emerald-800'}`}>
                        <img src="/icon.png" alt="AI Icon" className="w-full h-full object-contain" style={{ filter: 'invert(1) brightness(2)' }} />
                      </div>
                      <div className={`px-5 py-4 rounded-2xl rounded-bl-sm flex items-center space-x-2 h-12 ${isDarkMode ? 'bg-card shadow-xl ring-1 ring-white/5' : 'bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-emerald-50'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-800'}`}></div>
                        <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-75 ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-800'}`}></div>
                        <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-150 ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-800'}`}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Floating Input Area (Notion style decoupled bar) */}
            <div className="absolute bottom-6 left-0 right-0 px-4 sm:px-8 pointer-events-none z-20">
              <div className="max-w-3xl mx-auto pointer-events-auto">
                <form onSubmit={handleSubmit} className={`relative flex items-center rounded-2xl shadow-2xl transition-all duration-300 ring-1 focus-within:ring-2 ${isDarkMode ? 'bg-card/95 backdrop-blur-xl ring-white/10 focus-within:ring-emerald-500/50 shadow-emerald-950/20' : 'bg-white/95 backdrop-blur-xl ring-emerald-100 focus-within:ring-emerald-800/20 shadow-[0_8px_30px_rgb(0,0,0,0.08)]'}`}>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Tanya seputar aturan Perda Bolmong..."
                    className={`flex-1 px-6 py-4 bg-transparent text-[14px] focus:outline-none placeholder-opacity-70 ${isDarkMode ? 'text-white placeholder-slate-500' : 'text-slate-800 placeholder-slate-400'}`}
                    disabled={loading}
                  />
                  <div className="pr-3">
                    <button
                      type="submit"
                      disabled={loading || !query.trim()}
                      className={`px-5 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 font-bold text-[13px] shadow-sm
                        ${loading || !query.trim()
                          ? (isDarkMode ? 'bg-emerald-950/50 text-emerald-800' : 'bg-emerald-50 text-emerald-300')
                          : (isDarkMode
                            ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400 hover:scale-105 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-95'
                            : 'bg-emerald-900 text-white hover:bg-emerald-800 hover:shadow-[0_8px_20px_-4px_rgba(6,78,59,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95')
                        }`}
                    >
                      <span className="hidden xs:inline">Kirim</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 rotate-90 transition-transform duration-300 ${!query.trim() ? '' : 'group-hover:translate-x-0.5'}`} viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                      </svg>
                    </button>
                  </div>
                </form>
                <div className={`text-center mt-3 text-[10.5px] tracking-wide font-medium ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  AI dapat membuat kesalahan. Harap verifikasi dokumen asli.
                </div><div className={`text-center mt-3 text-[10.5px] tracking-wide font-medium ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  Vector Pasal 1.3 . Develop by Viddie Pilat.
                </div>
              </div>
            </div>

            {/* Soft gradient mask at the bottom to fade out content behind the floating bar */}
            <div className={`absolute bottom-0 left-0 right-0 h-32 pointer-events-none bg-gradient-to-t z-10 ${isDarkMode ? 'from-background to-transparent' : 'from-background to-transparent'}`}></div>

          </div>
        )}

        {/* --- DOCUMENT MODAL (Refined aesthetics) --- */}
        {selectedDocument && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-emerald-950/60 backdrop-blur-md transition-all duration-300 animate-in fade-in" onClick={() => setSelectedDocument(null)}>
            <div
              className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ${isDarkMode ? 'bg-card ring-white/10 shadow-emerald-950/40' : 'bg-white ring-emerald-100 shadow-emerald-900/10'}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className={`flex justify-between items-center px-6 py-5 border-b ${isDarkMode ? 'border-white/5 bg-background shadow-sm' : 'border-emerald-50 bg-emerald-50/30'}`}>
                <h3 className={`font-semibold text-[15px] tracking-tight flex items-center gap-3 ${isDarkMode ? 'text-slate-100' : 'text-emerald-900'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-emerald-950 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  Detail Dokumen Resmi
                </h3>
                <button onClick={() => setSelectedDocument(null)} className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isDarkMode ? 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Modal Body - Notion styling */}
              <div className={`p-8 overflow-y-auto flex-1 scroll-smooth ${isDarkMode ? 'bg-card' : 'bg-white'}`}>
                <div className={`whitespace-pre-wrap font-serif text-[15px] leading-[1.8] ${isDarkMode ? 'text-slate-300 selection:bg-emerald-900/50' : 'text-slate-700 selection:bg-emerald-100'}`}>
                  {selectedDocument.content}
                </div>
              </div>

              {/* Modal Footer */}
              <div className={`px-6 py-4 border-t flex flex-wrap gap-3 justify-between items-center ${isDarkMode ? 'border-white/5 bg-background' : 'border-emerald-50 bg-emerald-50/30'}`}>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const textToCopy = selectedDocument.content;
                      if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(textToCopy);
                      } else {
                        const textArea = document.createElement("textarea");
                        textArea.value = textToCopy;
                        document.body.appendChild(textArea);
                        textArea.select();
                        try { document.execCommand('copy'); } catch (err) { }
                        document.body.removeChild(textArea);
                      }
                    }}
                    className={`px-4 py-2 text-[12px] font-semibold rounded-xl border transition-all flex items-center gap-2 ${isDarkMode ? 'bg-card border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20' : 'bg-white border-emerald-100 text-emerald-800 hover:bg-emerald-50 hover:border-emerald-200 shadow-sm'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012-2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                    Salin
                  </button>

                  <button
                    onClick={async () => {
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            title: 'Vector Pasal - Referensi Hukum',
                            text: selectedDocument.content,
                            url: window.location.href,
                          });
                        } catch (err) { }
                      }
                    }}
                    className={`px-4 py-2 text-[12px] font-semibold rounded-xl border transition-all flex items-center gap-2 ${isDarkMode ? 'bg-card border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20' : 'bg-white border-emerald-100 text-emerald-800 hover:bg-emerald-50 hover:border-emerald-200 shadow-sm'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    Bagikan
                  </button>
                </div>

                <button onClick={() => setSelectedDocument(null)} className={`px-6 py-2.5 text-[12px] font-bold rounded-xl transition-all shadow-md ${isDarkMode ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400 hover:shadow-emerald-500/20' : 'bg-emerald-900 text-white hover:bg-emerald-800 hover:shadow-emerald-900/20'}`}>
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- PANDUAN MODAL --- */}
        {showGuideModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-emerald-950/60 backdrop-blur-md transition-all duration-300 animate-in fade-in" onClick={() => setShowGuideModal(false)}>
            <div
              className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ${isDarkMode ? 'bg-card ring-white/10' : 'bg-white ring-emerald-100'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`px-6 py-5 border-b flex justify-between items-center ${isDarkMode ? 'bg-background border-white/5' : 'bg-emerald-50/30 border-emerald-50'}`}>
                <h3 className={`font-semibold text-base flex items-center gap-3 ${isDarkMode ? 'text-white' : 'text-emerald-950'}`}>
                  <span className="text-xl">📖</span> Panduan Aplikasi
                </h3>
                <button onClick={() => setShowGuideModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex gap-4">
                  <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold ${isDarkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-800'}`}>1</div>
                  <div>
                    <h4 className={`font-bold text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Cari Aturan</h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Gunakan bahasa sehari-hari. Contoh: "Apa aturan tentang hewan ternak di jalan?"</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold ${isDarkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-800'}`}>2</div>
                  <div>
                    <h4 className={`font-bold text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Periksa Sumber</h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Klik "Buka Dokumen Penuh" pada sumber untuk melihat teks asli Peraturan Daerah.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold ${isDarkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-800'}`}>3</div>
                  <div>
                    <h4 className={`font-bold text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Verifikasi</h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>AI dapat membuat kesalahan. Selalu verifikasi jawaban dengan dokumen fisik untuk keperluan hukum resmi.</p>
                  </div>
                </div>
                <button onClick={() => setShowGuideModal(false)} className={`w-full py-3 rounded-2xl font-bold text-sm transition-all mt-4 ${isDarkMode ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400' : 'bg-emerald-900 text-white hover:bg-emerald-800'}`}>
                  Saya Mengerti
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- TENTANG MODAL --- */}
        {showAboutModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-emerald-950/60 backdrop-blur-md transition-all duration-300 animate-in fade-in" onClick={() => setShowAboutModal(false)}>
            <div
              className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ${isDarkMode ? 'bg-card ring-white/10' : 'bg-white ring-emerald-100'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`px-6 py-10 flex flex-col items-center text-center ${isDarkMode ? 'bg-background' : 'bg-emerald-50/30'}`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${isDarkMode ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-emerald-900'}`}>
                  <Image src="/icon.png" alt="Logo" width={40} height={40} style={{ filter: 'invert(1) brightness(2)' }} />
                </div>
                <h3 className={`font-bold text-2xl tracking-tight ${isDarkMode ? 'text-white' : 'text-emerald-950'}`}>Vector Pasal</h3>
                <p className={`text-[11px] font-bold uppercase tracking-[0.2em] mt-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Smart Legal Assistant</p>
              </div>
              <div className="p-8 space-y-6">
                <p className={`text-sm leading-relaxed text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Vector Pasal adalah asisten digital berbasis AI yang dirancang untuk mendigitalisasi dan memudahkan akses informasi hukum bagi petugas <strong>Satpol PP Kabupaten Bolaang Mongondow</strong>.
                </p>
                <div className={`p-4 rounded-2xl flex items-center gap-4 ${isDarkMode ? 'bg-white/5 border border-white/5' : 'bg-slate-50 border border-slate-100'}`}>
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-lg">V</div>
                  <div className="flex-1">
                    <h4 className={`font-bold text-[13px] ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Viddie Pilat</h4>
                    <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Developer & Architect</p>
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-800'}`}>v1.3</div>
                </div>
                <button onClick={() => setShowAboutModal(false)} className={`w-full py-3 rounded-2xl font-bold text-sm transition-all ${isDarkMode ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400' : 'bg-emerald-900 text-white hover:bg-emerald-800'}`}>
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
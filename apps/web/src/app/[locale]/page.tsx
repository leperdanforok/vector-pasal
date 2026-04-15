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

  return (
    <div
      onClick={() => isLong && setExpanded(!expanded)}
      className={`p-4 rounded-xl text-[13px] transition-all duration-300
        ${isDarkMode
          ? 'bg-[#0f172a] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] text-gray-300 hover:bg-[#1e293b]'
          : 'bg-white shadow-[0_2px_10px_-3px_rgba(30,58,138,0.05)] text-slate-700 hover:shadow-[0_4px_12px_-3px_rgba(30,58,138,0.1)]'} 
        ${isLong ? 'cursor-pointer' : ''}
      `}
    >
      <div className={`${expanded ? '' : 'line-clamp-2'} leading-relaxed font-serif`}>
        {source.content}
      </div>
      {isLong && !expanded && (
        <span className={`font-medium text-[11px] mt-2 block ${isDarkMode ? 'text-amber-400' : 'text-blue-800'}`}>
          Baca selengkapnya ▾
        </span>
      )}
      {isLong && expanded && (
        <span className={`font-medium text-[11px] mt-3 block ${isDarkMode ? 'text-gray-500' : 'text-slate-400'}`}>
          Sembunyikan teks ▴
        </span>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onViewFull(source); }}
        className={`mt-4 w-full py-2.5 rounded-lg text-[12px] font-medium transition-all flex justify-center items-center gap-2 group
          ${isDarkMode
            ? 'bg-transparent border border-cyan-900/50 text-cyan-400 hover:bg-cyan-950/30 hover:border-cyan-500/50'
            : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-white hover:border-amber-400/50 hover:text-blue-900 hover:shadow-sm'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
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

  const handleMenuClick = (item: string) => {
    alert(`Fitur "${item}" akan segera hadir!`);
    setIsMenuOpen(false);
  };

  return (
    <div className={`${isDarkMode ? 'dark bg-[#020617]' : 'bg-[#F7F5F0]'} min-h-screen flex justify-center font-sans transition-colors duration-500 text-slate-900`}>
      <main className={`w-full max-w-4xl h-[100dvh] relative flex flex-col transition-colors duration-500 ${isDarkMode ? 'bg-[#020617] text-slate-100' : 'bg-[#F7F5F0]'}`}>

        {/* Universal Top Header */}
        <header className={`flex justify-between items-center py-5 px-8 flex-shrink-0 transition-colors duration-500 sticky top-0 z-40 backdrop-blur-md ${isDarkMode ? 'bg-[#020617]/80 border-b border-white/5' : 'bg-white/80 border-b border-slate-200/60'}`}>
          <div className="relative">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`transition-colors font-medium flex items-center gap-2 ${isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
              <span className="hidden sm:inline text-sm">Menu</span>
            </button>
            {isMenuOpen && (
              <div className={`absolute top-12 left-0 w-64 rounded-2xl shadow-2xl py-2 z-50 transform origin-top-left transition-all ${isDarkMode ? 'bg-[#0f172a] shadow-cyan-900/10 ring-1 ring-white/10' : 'bg-white ring-1 ring-slate-100'}`}>
                <button onClick={toggleDarkMode} className={`w-full text-left px-5 py-3 text-[13px] font-medium flex items-center gap-3 transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {isDarkMode ? <><span className="text-amber-400">☀️</span> Mode Terang</> : <><span className="text-slate-700">🌙</span> Mode Gelap</>}
                </button>
                <div className={`h-[1px] w-full my-1 ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}></div>
                <button onClick={() => handleMenuClick("Panduan Aplikasi")} className={`w-full text-left px-5 py-3 text-[13px] font-medium flex items-center gap-3 transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'}`}><span className="text-blue-500">ℹ️</span> Panduan Aplikasi</button>
                <button onClick={() => handleMenuClick("Tentang")} className={`w-full text-left px-5 py-3 text-[13px] font-medium flex items-center gap-3 transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'}`}><span className="text-emerald-500">🏢</span> Tentang</button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center">
            <h1 className={`font-semibold text-[15px] tracking-tight flex items-center justify-center gap-3 ${isDarkMode ? 'text-slate-100' : 'text-[#0f172a]'}`}>
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
            <span className={`text-[10px] tracking-widest uppercase font-semibold mt-0.5 ${isDarkMode ? 'text-cyan-500' : 'text-amber-500'}`}>Satpol PP Bolaang Mongondow</span>
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
              <div className={`w-full max-w-lg flex flex-col items-center text-center px-6 py-12 rounded-[2rem] transition-all duration-500 border-0 ${isDarkMode ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-[#020617] shadow-[0_0_40px_-10px_rgba(8,145,178,0.1)]' : 'bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]'}`}>

                {/* Government Crest Logo Concept */}
                <div className={`w-20 h-20 rounded-full p-1 flex items-center justify-center shadow-lg transition-transform hover:scale-105 duration-300 ${isDarkMode ? 'bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 shadow-cyan-900/20' : 'bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-700/50 shadow-blue-900/20'}`}>
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

                <h2 className={`mt-8 text-3xl font-bold tracking-tight ${isDarkMode ? 'text-white drop-shadow-md' : 'text-[#0f172a]'}`}>
                  Asisten <span className={isDarkMode ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500' : 'text-transparent bg-clip-text bg-gradient-to-r from-blue-800 to-blue-600'}>Hukum AI</span>
                </h2>

                <p className={`mt-5 leading-relaxed text-[15px] max-w-md ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Portal pencarian cerdas untuk Peraturan Daerah. Dirancang khusus untuk efisiensi dan akurasi petugas Satpol PP.
                </p>

                <button onClick={() => setIsChatStarted(true)} className={`mt-10 px-10 py-3.5 rounded-full font-semibold text-[15px] transition-all duration-300 shadow-lg flex items-center gap-2 group
                  ${isDarkMode
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 hover:scale-105 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                    : 'bg-blue-900 text-white hover:bg-blue-800 hover:shadow-[0_8px_20px_-4px_rgba(30,58,138,0.3)] hover:-translate-y-0.5'}`}>
                  Mulai Konsultasi
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </div>
            </div>
            <div className={`py-8 flex flex-col items-center justify-center text-center ${isDarkMode ? 'text-slate-700' : 'text-slate-400'}`}>
              <span className="text-xs tracking-widest uppercase font-semibold mb-1.5">Vector Pasal v1.0</span>
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
                    <span className={`text-4xl mb-4 opacity-50 ${isDarkMode ? 'text-cyan-500' : 'text-blue-900'}`}>💬</span>
                    <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Sistem siap. Silakan ketik pertanyaan terkait Perda.</p>
                  </div>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end gap-3`}>

                        {/* Avatar */}
                        {msg.role === 'ai' && (
                          <div className={`w-12 h-12 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center shadow-sm mb-1 p-0.5 ${isDarkMode ? 'bg-gradient-to-br from-cyan-600 to-blue-700' : 'bg-gradient-to-br from-blue-900 to-blue-800'}`}>
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
                                ? 'bg-cyan-900/30 text-cyan-50 ring-1 ring-cyan-500/20 rounded-br-sm'
                                : 'bg-slate-100 text-slate-800 rounded-br-sm'
                              : isDarkMode
                                ? 'bg-[#0f172a] text-slate-300 ring-1 ring-white/5 rounded-bl-sm shadow-xl shadow-black/20'
                                : 'bg-white text-slate-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] rounded-bl-sm border border-slate-100'
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
                                <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center mb-2 ${isDarkMode ? 'text-cyan-500' : 'text-blue-800'}`}>
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
                      <div className={`w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center shadow-sm mb-1 p-0.5 ${isDarkMode ? 'bg-gradient-to-br from-cyan-600 to-blue-700' : 'bg-gradient-to-br from-blue-900 to-blue-800'}`}>
                        <img src="/icon.png" alt="AI Icon" className="w-full h-full object-contain" style={{ filter: 'invert(1) brightness(2)' }} />
                      </div>
                      <div className={`px-5 py-4 rounded-2xl rounded-bl-sm flex items-center space-x-2 h-12 ${isDarkMode ? 'bg-[#0f172a] shadow-xl ring-1 ring-white/5' : 'bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDarkMode ? 'bg-cyan-500' : 'bg-blue-800'}`}></div>
                        <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-75 ${isDarkMode ? 'bg-cyan-500' : 'bg-blue-800'}`}></div>
                        <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-150 ${isDarkMode ? 'bg-cyan-500' : 'bg-blue-800'}`}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Floating Input Area (Notion style decoupled bar) */}
            <div className="absolute bottom-6 left-0 right-0 px-4 sm:px-8 pointer-events-none z-20">
              <div className="max-w-3xl mx-auto pointer-events-auto">
                <form onSubmit={handleSubmit} className={`relative flex items-center rounded-2xl shadow-2xl transition-all duration-300 ring-1 focus-within:ring-2 ${isDarkMode ? 'bg-[#0f172a]/95 backdrop-blur-xl ring-white/10 focus-within:ring-cyan-500/50 shadow-cyan-900/10' : 'bg-white/95 backdrop-blur-xl ring-slate-200 focus-within:ring-blue-800/20 shadow-[0_8px_30px_rgb(0,0,0,0.08)]'}`}>
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
                          ? (isDarkMode ? 'bg-slate-800 text-slate-600' : 'bg-slate-100 text-slate-400')
                          : (isDarkMode
                            ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:scale-105 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95'
                            : 'bg-blue-900 text-white hover:bg-blue-800 hover:shadow-[0_8px_20px_-4px_rgba(30,58,138,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95')
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
                  Vector Pasal 1.0 . Develop by Viddie Pilat.
                </div>
              </div>
            </div>

            {/* Soft gradient mask at the bottom to fade out content behind the floating bar */}
            <div className={`absolute bottom-0 left-0 right-0 h-32 pointer-events-none bg-gradient-to-t z-10 ${isDarkMode ? 'from-[#020617] to-transparent' : 'from-[#F7F5F0] to-transparent'}`}></div>

          </div>
        )}

        {/* --- DOCUMENT MODAL (Refined aesthetics) --- */}
        {selectedDocument && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md transition-all duration-300 animate-in fade-in" onClick={() => setSelectedDocument(null)}>
            <div
              className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ${isDarkMode ? 'bg-[#0f172a] ring-white/10 shadow-cyan-900/20' : 'bg-white ring-slate-200 shadow-slate-300/50'}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className={`flex justify-between items-center px-6 py-5 border-b ${isDarkMode ? 'border-white/5 bg-[#0b1221]' : 'border-slate-100 bg-[#F7F5F0]'}`}>
                <h3 className={`font-semibold text-[15px] tracking-tight flex items-center gap-3 ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-cyan-950 text-cyan-400' : 'bg-amber-100 text-amber-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  Detail Dokumen Resmi
                </h3>
                <button onClick={() => setSelectedDocument(null)} className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isDarkMode ? 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Modal Body - Notion styling */}
              <div className={`p-8 overflow-y-auto flex-1 scroll-smooth ${isDarkMode ? 'bg-[#0f172a]' : 'bg-white'}`}>
                <div className={`whitespace-pre-wrap font-serif text-[15px] leading-[1.8] ${isDarkMode ? 'text-slate-300 selection:bg-cyan-900/50' : 'text-slate-700 selection:bg-amber-200/50'}`}>
                  {selectedDocument.content}
                </div>
              </div>

              {/* Modal Footer */}
              <div className={`px-6 py-4 border-t flex flex-wrap gap-3 justify-between items-center ${isDarkMode ? 'border-white/5 bg-[#0b1221]' : 'border-slate-100 bg-[#F7F5F0]'}`}>
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
                    className={`px-4 py-2 text-[12px] font-semibold rounded-xl border transition-all flex items-center gap-2 ${isDarkMode ? 'bg-[#0f172a] border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm'}`}
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
                    className={`px-4 py-2 text-[12px] font-semibold rounded-xl border transition-all flex items-center gap-2 ${isDarkMode ? 'bg-[#0f172a] border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    Bagikan
                  </button>
                </div>

                <button onClick={() => setSelectedDocument(null)} className={`px-6 py-2.5 text-[12px] font-bold rounded-xl transition-all shadow-md ${isDarkMode ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:shadow-cyan-500/20' : 'bg-blue-900 text-white hover:bg-blue-800 hover:shadow-blue-900/20'}`}>
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
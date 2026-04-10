'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// --- COMPONENT: Expandable Source Card ---
// UPDATED: Added onViewFull function prop
function ExpandableSource({ source, isDarkMode, onViewFull }: { source: any, isDarkMode: boolean, onViewFull: (s: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = source.content.length > 100;

  return (
    <div 
      onClick={() => isLong && setExpanded(!expanded)}
      className={`p-3 rounded-xl text-[12px] border shadow-sm transition-colors
        ${isDarkMode ? 'bg-slate-800 border-slate-700 text-gray-300' : 'bg-white border-gray-200 text-gray-700'} 
        ${isLong ? (isDarkMode ? 'cursor-pointer hover:bg-slate-700' : 'cursor-pointer hover:bg-gray-50') : ''}
      `}
    >
      <div className={expanded ? '' : 'line-clamp-2 leading-relaxed'}>
        {source.content}
      </div>
      {isLong && !expanded && (
        <span className="text-[#0047FF] font-medium text-[10px] mt-1.5 block">Baca selengkapnya ▾</span>
      )}
      {isLong && expanded && (
        <span className="text-gray-400 font-medium text-[10px] mt-2 block">Sembunyikan teks ▴</span>
      )}

      {/* NEW: Button to open full document modal */}
      <button
        onClick={(e) => { e.stopPropagation(); onViewFull(source); }}
        className={`mt-3 w-full py-2 rounded-lg text-[11px] font-medium transition-colors border flex justify-center items-center ${isDarkMode ? 'bg-slate-700 border-slate-600 text-gray-200 hover:bg-slate-600' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
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

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const aiTime = getCurrentTime();
      setMessages([...newMessages, { role: 'ai', content: data.answer, sources: data.sources, time: aiTime }]);
    } catch (error: any) {
      setMessages([...newMessages, { role: 'ai', content: 'Maaf, terjadi kesalahan server.', time: getCurrentTime() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleMenuClick = (item: string) => {
    alert(`Fitur "${item}" akan segera hadir!`);
    setIsMenuOpen(false);
  };

  return (
    <div className={`${isDarkMode ? 'dark bg-slate-950' : 'bg-white'} min-h-screen flex justify-center font-sans transition-colors duration-300`}>
      <main className={`w-full h-[100dvh] ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white'} relative flex flex-col overflow-hidden transition-colors duration-300`}>
        
        {/* Universal Top Header */}
        <header className={`flex justify-between items-center p-5 border-b z-50 flex-shrink-0 shadow-sm transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}>
          <div className="relative">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-gray-400 hover:text-gray-600 font-bold text-xl tracking-widest pb-2">...</button>
            {isMenuOpen && (
              <div className={`absolute top-10 left-0 w-56 border rounded-xl shadow-lg py-2 z-50 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                <button onClick={toggleDarkMode} className={`w-full text-left px-4 py-3 text-sm border-b ${isDarkMode ? 'text-gray-200 hover:bg-slate-700 border-slate-700' : 'text-gray-700 hover:bg-gray-50 border-gray-50'}`}>
                  {isDarkMode ? '☀️ Mode Terang' : '🌙 Mode Gelap'}
                </button>
                <button onClick={() => handleMenuClick("Panduan Aplikasi")} className={`w-full text-left px-4 py-3 text-sm border-b ${isDarkMode ? 'text-gray-200 hover:bg-slate-700 border-slate-700' : 'text-gray-700 hover:bg-gray-50 border-gray-50'}`}>ℹ️ Panduan Aplikasi</button>
                <button onClick={() => handleMenuClick("Tentang")} className={`w-full text-left px-4 py-3 text-sm ${isDarkMode ? 'text-gray-200 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-50'}`}>🏢 Tentang</button>
              </div>
            )}
          </div>
          <h1 className={`font-bold text-lg tracking-wide ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Vector Pasal</h1>
          <div className="flex space-x-4 text-gray-400 items-center">
            {isChatStarted && (
              <button onClick={handleNewChat} className="hover:text-red-500 transition-colors text-lg font-bold">✕</button>
            )}
          </div>
        </header>

        {/* --- SCREEN 1: WELCOME SCREEN --- */}
        {!isChatStarted ? (
          <div className={`flex-1 flex flex-col relative z-0 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className={`border rounded-2xl shadow-sm w-full max-w-md flex flex-col items-center p-8 text-center relative mt-10 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="absolute -top-12 w-24 h-24 bg-[#22c55e] rounded-full shadow-md border-4 border-white flex items-center justify-center">
                   <span className="text-4xl text-white">⚖️</span>
                </div>
                <h2 className={`mt-14 text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>AI Perda Assistant</h2>
                <p className={`mt-4 leading-relaxed text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Halo! Saya adalah asisten untuk Sat-Pol PP Kabupaten Bolaang Mongondow. Saya siap membantu Anda mencari aturan dan pasal Peraturan Daerah dengan cepat.
                </p>
                <button onClick={() => setIsChatStarted(true)} className="mt-8 w-full bg-[#0047FF] text-white font-medium py-3.5 rounded-xl hover:bg-blue-700 transition-colors shadow-md text-lg">
                  Mulai Chat
                </button>
              </div>
            </div>
            <div className={`py-6 text-center text-xs flex-shrink-0 border-t ${isDarkMode ? 'bg-slate-900 border-slate-800 text-gray-500' : 'bg-white border-gray-100 text-gray-400'}`}>
              Dikembangkan oleh <span className={`font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Viddie Pilat</span>
            </div>
          </div>
        ) : (

        /* --- SCREEN 2: CHAT SCREEN --- */
          <div className={`flex-1 flex flex-col relative z-0 min-h-0 ${isDarkMode ? 'bg-slate-950' : 'bg-[#F9FAFB]'}`}>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-24 scroll-smooth flex flex-col items-center">
              <div className="w-full max-w-3xl space-y-6">
                
                {messages.length === 0 ? (
                  <div className="flex flex-col items-start mt-4">
                     <p className={`text-xs mb-1 ml-10 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Livechat {getCurrentTime()}</p>
                     <div className={`border p-5 rounded-2xl rounded-tl-none shadow-sm text-sm ${isDarkMode ? 'bg-slate-800 border-slate-700 text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}>
                        Selamat Datang!<br/><br/>Silahkan mulai percakapan dengan mengetik pertanyaan terkait Perda di kolom bawah.
                     </div>
                  </div>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <p className={`text-[10px] mb-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} ${msg.role === 'user' ? 'mr-2' : 'ml-12'}`}>
                        {msg.role === 'user' ? 'Anda' : 'Vector Pasal'} • {msg.time}
                      </p>
                      
                      <div className="flex items-end space-x-3 max-w-full">
                        {msg.role === 'ai' && (
                          <div className="w-10 h-10 bg-[#0047FF] rounded-full flex-shrink-0 flex items-center justify-center text-white shadow-sm">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                          </div>
                        )}
                        <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[85%] p-4 sm:p-5 rounded-2xl text-sm leading-relaxed shadow-sm
                          ${msg.role === 'user' 
                            ? 'bg-[#0047FF] text-white rounded-br-sm' 
                            : isDarkMode 
                              ? 'bg-slate-800 border border-slate-700 text-gray-200 rounded-bl-sm' 
                              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                          }`}>
                          {msg.role === 'user' ? (
                            msg.content
                          ) : (
                            <div className="[&>p]:mb-3 [&>ul]:list-disc [&>ul]:ml-5 [&>ul]:mb-3 [&>ol]:list-decimal [&>ol]:ml-5 [&>ol]:mb-3 [&>strong]:font-bold">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          )}

                          {/* UPDATED: Passing the onViewFull prop */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className={`mt-4 pt-4 border-t flex flex-col space-y-2 ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                              <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center mb-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                Sumber Hukum Referensi
                              </span>
                              {msg.sources.map((source, idx) => (
                                <ExpandableSource key={idx} source={source} isDarkMode={isDarkMode} onViewFull={setSelectedDocument} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                
                {loading && (
                  <div className="flex flex-col items-start">
                     <div className={`ml-12 flex space-x-2 border p-4 rounded-2xl rounded-tl-none shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                       <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                       <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-75"></div>
                       <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-150"></div>
                     </div>
                  </div>
                )}
              </div>
            </div>

            {/* Floating Action Button (New Chat) */}
            {messages.length > 0 && (
              <button 
                onClick={handleNewChat} 
                className={`absolute bottom-24 right-6 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-20 ${isDarkMode ? 'bg-white text-slate-900 hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'}`} 
                title="Obrolan Baru"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
            )}

            {/* Input Area */}
            <div className={`border-t p-3 sm:p-4 flex flex-col items-center relative z-10 flex-shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className="w-full max-w-3xl">
                <form onSubmit={handleSubmit} className={`flex items-center space-x-2 border rounded-full px-2 py-1 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-300'}`}>
                  <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tanya seputar aturan Perda di sini..." className={`flex-1 px-4 py-3 bg-transparent text-sm focus:outline-none ${isDarkMode ? 'text-white placeholder-gray-500' : 'text-gray-800'}`} disabled={loading} />
                  <button type="submit" disabled={loading || !query.trim()} className={`p-3 text-white bg-[#0047FF] rounded-full transition-colors shadow-sm ${loading || !query.trim() ? (isDarkMode ? 'opacity-50 bg-slate-600' : 'opacity-50 bg-gray-300') : 'hover:bg-blue-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-90" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                  </button>
                </form>
                <div className={`text-center mt-2 text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Vector Pasal dapat membuat kesalahan. Harap periksa kembali sumber hukum.
                </div>
              </div>
            </div>
          </div>
        )}

      {/* --- DOCUMENT MODAL --- */}
              {selectedDocument && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedDocument(null)}>
                  <div 
                    className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}
                    onClick={(e) => e.stopPropagation()} 
                  >
                    {/* Modal Header */}
                    <div className={`flex justify-between items-center p-4 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                      <h3 className={`font-bold text-lg flex items-center ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                        <span className="text-xl mr-2">📄</span> Detail Dokumen Hukum
                      </h3>
                      <button onClick={() => setSelectedDocument(null)} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isDarkMode ? 'bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700' : 'bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200'}`}>
                        ✕
                      </button>
                    </div>
                    
                    {/* Modal Body */}
                    <div className={`p-6 overflow-y-auto flex-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <div className="whitespace-pre-wrap leading-relaxed text-sm font-serif">
                        {selectedDocument.content}
                      </div>
                    </div>
                    
                    {/* Modal Footer */}
                    <div className={`p-4 border-t flex flex-wrap gap-2 justify-between items-center ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-gray-100 bg-gray-50'}`}>
                      <div className="flex gap-2">
                        {/* COPY BUTTON */}
                        <button 
                          onClick={() => {
                            const textToCopy = selectedDocument.content;

                            // Try the modern API first
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                              navigator.clipboard.writeText(textToCopy)
                                .then(() => alert("Teks berhasil disalin!"))
                                .catch(() => alert("Gagal menyalin teks."));
                            } else {
                              // Fallback for non-HTTPS connections
                              const textArea = document.createElement("textarea");
                              textArea.value = textToCopy;
                              document.body.appendChild(textArea);
                              textArea.select();
                              try {
                                document.execCommand('copy');
                                alert("Teks berhasil disalin! (via fallback)");
                              } catch (err) {
                                alert("Maaf, browser Anda tidak mengizinkan penyalinan.");
                              }
                              document.body.removeChild(textArea);
                            }
                          }}
                          className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center ${isDarkMode ? 'bg-slate-800 border-slate-700 text-gray-300 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012-2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                          Salin
                        </button>

                        {/* NATIVE SHARE BUTTON */}
                        <button 
                          onClick={async () => {
                            if (navigator.share) {
                              try {
                                await navigator.share({
                                  title: 'Vector Pasal - Referensi Hukum',
                                  text: selectedDocument.content,
                                  url: window.location.href,
                                });
                              } catch (err) { console.error(err); }
                            } else {
                              alert("Fitur bagi tidak didukung di browser ini.");
                            }
                          }}
                          className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center ${isDarkMode ? 'bg-slate-800 border-slate-700 text-gray-300 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                          Bagikan
                        </button>
                      </div>

                      <button onClick={() => setSelectedDocument(null)} className="px-6 py-2 bg-[#0047FF] text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md">
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
import React, { useMemo, useState, useEffect } from 'react';
import { MessageSquare, Calendar, Search, Send, User, MapPin, ChevronRight } from 'lucide-react';

const API_BASE = 'https://jobs-direction-epa-elections.trycloudflare.com/api';

const getWebApp = () => {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('baikal_user_token'));
  const [messages, setMessages] = useState([
    { id: 1, role: 'ai', text: 'Привет! Я твой ИИ-консьерж BaikalRent. Могу помочь с бронированием жилья, проката и экскурсий.' },
  ]);
  const [input, setInput] = useState('');
  const [listings, setListings] = useState([]);
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      const WebApp = getWebApp();
      if (!WebApp || !WebApp.initData) return;
      WebApp.ready();
      WebApp.expand();

      try {
        const res = await fetch(`${API_BASE}/auth/telegram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: WebApp.initData })
        });
        const data = await res.json();
        if (data.token) {
          setToken(data.token);
          localStorage.setItem('baikal_user_token', data.token);
          setUser(data.user);
        }
      } catch (e) { console.error('Auth error:', e); }
    };

    const fetchLocations = async () => {
      try {
        const res = await fetch(`${API_BASE}/locations`);
        const data = await res.json();
        setLocations(data);
      } catch (e) { console.error(e); }
    };

    initAuth();
    fetchLocations();
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text }]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/ai/concierge`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: text, history: messages.slice(-5) })
      });
      const data = await res.json();
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'ai', text: data.text || 'Не удалось получить ответ.' }]);
      if (data.listings && data.listings.length > 0) {
        setListings(data.listings);
        setActiveTab('catalog');
      }
    } catch (e) {
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'ai', text: 'Ошибка связи с сервером. Попробуй позже!' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBooking = (listing) => {
    const WebApp = getWebApp();
    if (WebApp) {
      WebApp.showConfirm(`Вы хотите забронировать "${listing.title}"?`, (ok) => {
        if (ok) WebApp.showAlert('Заявка отправлена партнеру! С вами свяжутся.');
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <div className="bg-white px-5 py-4 border-b flex items-center justify-between shadow-sm shrink-0">
        <div className="font-extrabold text-2xl tracking-tighter text-blue-600">BaikalRent</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-lg border">{user?.full_name || 'Гость'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {activeTab === 'chat' ? (
          <div className="p-5 space-y-5">
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar -mx-5 px-5">
              {locations.map((loc) => (
                <button key={loc.id} onClick={() => setSelectedLocation(loc)} className="min-w-[150px] bg-white border border-gray-100 rounded-[24px] overflow-hidden text-left shadow-sm active:scale-95 transition-all">
                  <img src={loc.metadata?.image_url || 'https://via.placeholder.com/150'} className="w-full h-24 object-cover" alt="" />
                  <div className="p-3">
                    <div className="font-bold text-xs truncate text-gray-800">{loc.name}</div>
                    <div className="text-[9px] text-gray-400 font-bold uppercase mt-1">О локации</div>
                  </div>
                </button>
              ))}
            </div>

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1`}>
                <div className={`max-w-[85%] px-5 py-3 rounded-[24px] shadow-sm text-[15px] leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none font-medium' 
                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest pl-2 animate-pulse">Помощник думает...</div>}
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <h2 className="text-2xl font-bold text-gray-800">Каталог Байкала</h2>
            {listings.map((l) => (
              <div key={l.id} className="bg-white border border-gray-50 rounded-[32px] p-5 shadow-sm flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                <img src={l.metadata?.image_url || 'https://via.placeholder.com/400'} className="w-full h-48 rounded-[24px] object-cover shadow-inner" alt="" />
                <div>
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-lg text-gray-800 leading-tight">{l.title}</div>
                    <div className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider">{l.category}</div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2 leading-relaxed">{l.description}</p>
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-50">
                    <div className="font-extrabold text-xl text-blue-600">{l.metadata?.price_label || 'Цена по запросу'}</div>
                    <button onClick={() => handleBooking(l)} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-blue-100 active:scale-95 transition-transform flex items-center gap-2">
                      Забронировать <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {listings.length === 0 && (
              <div className="text-center py-20 text-gray-300">
                <Search size={48} className="mx-auto mb-4 opacity-20" />
                <p className="font-medium">Напишите ИИ-помощнику,<br/>чтобы он подобрал варианты под ваш запрос.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedLocation && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-6 z-[100] animate-in fade-in duration-300" onClick={() => setSelectedLocation(null)}>
          <div className="bg-white rounded-[40px] overflow-hidden max-w-sm w-full shadow-2xl animate-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
            <img src={selectedLocation.metadata?.image_url || 'https://via.placeholder.com/400'} className="w-full h-56 object-cover" alt="" />
            <div className="p-8">
              <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">{selectedLocation.name}</h2>
              <p className="text-gray-500 mt-4 leading-relaxed text-[15px]">{selectedLocation.metadata?.description || 'Место, которое стоит посетить. Подробности появятся совсем скоро.'}</p>
              <button 
                onClick={() => { setInput(`Расскажи про ${selectedLocation.name}`); setSelectedLocation(null); setActiveTab('chat'); }} 
                className="w-full bg-blue-600 text-white py-5 rounded-2xl font-bold mt-8 shadow-xl shadow-blue-100 active:scale-95 transition-all"
              >
                Спросить консьержа
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="fixed bottom-16 left-0 right-0 p-5 bg-white/80 backdrop-blur-xl border-t z-50">
          <div className="flex gap-2 bg-white border border-gray-100 p-2 rounded-[24px] shadow-sm">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Напр: жилье на Ольхоне" className="flex-1 bg-transparent px-4 py-3 outline-none text-[15px]" />
            <button onClick={sendMessage} className="bg-blue-600 text-white p-4 rounded-[20px] shadow-lg active:scale-90 transition-transform"><Send size={20} /></button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t py-4 flex justify-around z-50 shadow-2xl">
        <button onClick={() => setActiveTab('chat')} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'chat' ? 'text-blue-600 scale-110' : 'text-gray-300 hover:text-gray-400'}`}>
          <MessageSquare size={26} strokeWidth={2.5} />
          <span className="text-[9px] font-black uppercase tracking-widest">ИИ-Чат</span>
        </button>
        <button onClick={() => setActiveTab('catalog')} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'catalog' ? 'text-blue-600 scale-110' : 'text-gray-300 hover:text-gray-400'}`}>
          <Search size={26} strokeWidth={2.5} />
          <span className="text-[9px] font-black uppercase tracking-widest">Каталог</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-gray-200">
          <Calendar size={26} strokeWidth={2.5} />
          <span className="text-[9px] font-black uppercase tracking-widest opacity-50">Брони</span>
        </button>
      </div>
    </div>
  );
}

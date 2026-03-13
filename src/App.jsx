import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, MapPin, Search, Send, User, ChevronRight, Filter } from 'lucide-react';

// Safe access to WebApp
const getWebApp = () => {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
};

const BaikalRentApp = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [activeCategory, setActiveCategory] = useState('all');
  const [messages, setMessages] = useState([
    { id: 1, role: 'ai', text: 'Привет! Я твой ИИ-консьерж на Байкале. Помогу найти жилье, забронировать технику или составить маршрут. Что планируешь?' }
  ]);
  const [input, setInput] = useState('');
  const [listings, setListings] = useState([]);
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const categories = [
    { id: 'all', name: 'Все', icon: '🌟' },
    { id: 'stay', name: 'Проживание', icon: '🏠' },
    { id: 'rental', name: 'Прокат', icon: '🚲' },
    { id: 'food', name: 'Покушать', icon: '🍽️' },
    { id: 'excursion', name: 'Экскурсии', icon: '🗺️' },
    { id: 'poi', name: 'Интересное', icon: '🏛️' },
    { id: 'bundle', name: 'Пакеты', icon: '🎁' },
  ];

  const fetchLocations = async () => {
    try {
      const response = await fetch('https://jobs-direction-epa-elections.trycloudflare.com/api/locations');
      const data = await response.json();
      if (Array.isArray(data)) setLocations(data);
    } catch (e) { 
      console.error('Fetch locations error:', e); 
    }
  };

  useEffect(() => {
    const WebApp = getWebApp();
    if (WebApp) {
      WebApp.ready();
      WebApp.expand();
      if (WebApp.themeParams && WebApp.themeParams.bg_color) {
        document.body.style.backgroundColor = WebApp.themeParams.bg_color;
      }
    }
    fetchLocations();
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMsg = { id: Date.now(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 20000);

      const response = await fetch('https://jobs-direction-epa-elections.trycloudflare.com/api/ai/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history: messages.slice(-5) }),
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'AI request failed');
      
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: data.text || 'Прости, я отвлекся. Попробуй еще раз?' }]);
      if (data.listings && data.listings.length > 0) {
        setListings(data.listings);
        setActiveTab('catalog');
      }
    } catch (e) {
      console.error('AI Error:', e);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: 'Ошибка связи с сервером. Проверь интернет или попробуй позже.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBooking = (listing) => {
    const WebApp = getWebApp();
    if (WebApp) {
      WebApp.showAlert(`Бронирование "${listing.title}" пока в разработке!`);
    } else {
      alert(`Бронирование "${listing.title}"!`);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {/* Header */}
      <div className="bg-white px-4 py-3 border-b flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">B</div>
          <h1 className="font-semibold text-lg">BaikalRent</h1>
        </div>
        <User size={20} className="text-gray-400" />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-32">
        {activeTab === 'chat' ? (
          <div className="p-4 space-y-4">
            {/* Location Cards */}
            {locations.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
                {locations.map(loc => (
                  <div 
                    key={loc.id} 
                    onClick={() => setSelectedLocation(loc)}
                    className="min-w-[140px] bg-white rounded-xl shadow-sm border overflow-hidden shrink-0 active:scale-95 transition-transform"
                  >
                    <img src={loc.metadata?.image_url || 'https://via.placeholder.com/150?text=Baikal'} className="w-full h-20 object-cover" alt={loc.name} />
                    <div className="p-2">
                      <p className="font-bold text-xs truncate">{loc.name}</p>
                      <p className="text-[10px] text-gray-400">Узнать больше</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white text-gray-800 border rounded-tl-none'
                }`}>
                  <p className="text-[15px] leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start pl-2">
                <div className="bg-white border p-2 rounded-xl shadow-sm animate-pulse text-gray-400 text-xs">Печатаю...</div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${
                    activeCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-xl text-gray-800">Каталог</h2>
            </div>
            
            {listings.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Search size={48} className="mx-auto mb-4 opacity-20" />
                <p>Начни чат с ИИ-консьержем,<br/>чтобы подобрать варианты</p>
                <button onClick={() => setActiveTab('chat')} className="mt-4 text-blue-600 font-semibold underline">Перейти в чат</button>
              </div>
            ) : (
              listings.map(l => (
                <div key={l.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-4 transition-transform active:scale-[0.98]">
                  <div className="h-48 bg-gray-200 relative">
                    <img src={l.metadata?.image_url || 'https://via.placeholder.com/400?text=Listing'} alt={l.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg text-gray-800 leading-tight">{l.title}</h3>
                    <div className="flex items-center text-gray-500 text-sm mt-1 mb-3">
                      <MapPin size={14} className="mr-1" />
                      {l.location_id ? 'Байкал' : 'Локация не указана'}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="font-bold text-lg text-blue-600">{l.metadata?.price_label || 'По запросу'}</span>
                      <button onClick={() => handleBooking(l)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2">
                        Бронировать <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal for Location Details */}
      {selectedLocation && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => setSelectedLocation(null)}>
          <div className="bg-white rounded-3xl overflow-hidden max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <img src={selectedLocation.metadata?.image_url || 'https://via.placeholder.com/400?text=Location'} className="w-full h-48 object-cover" alt={selectedLocation.name} />
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-2">{selectedLocation.name}</h2>
              <p className="text-gray-600 leading-relaxed mb-6">{selectedLocation.metadata?.description || 'Описание скоро появится...'}</p>
              <button 
                onClick={() => {
                  setInput(`Расскажи подробнее про ${selectedLocation.name}`);
                  setSelectedLocation(null);
                }}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold"
              >
                Спросить консьержа
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      {activeTab === 'chat' && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-white border-t z-50">
          <div className="flex items-center gap-2 bg-gray-100 rounded-2xl p-2 pl-4 border border-gray-200">
            <input 
              className="flex-1 bg-transparent border-none outline-none text-gray-800" 
              placeholder="Спроси помощника..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button 
              onClick={sendMessage}
              className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="bg-white border-t px-6 py-2 flex items-center justify-between fixed bottom-0 left-0 right-0 z-50">
        <button onClick={() => setActiveTab('chat')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'chat' ? 'text-blue-600' : 'text-gray-400'}`}>
          <MessageSquare size={24} />
          <span className="text-[10px] font-bold uppercase">ИИ-Чат</span>
        </button>
        <button onClick={() => setActiveTab('catalog')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'catalog' ? 'text-blue-600' : 'text-gray-400'}`}>
          <Search size={24} />
          <span className="text-[10px] font-bold uppercase">Каталог</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <Calendar size={24} />
          <span className="text-[10px] font-bold uppercase">Брони</span>
        </button>
      </div>
    </div>
  );
};

export default BaikalRentApp;

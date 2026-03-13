import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, MapPin, Search, Send, User, ChevronRight, Filter } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

const BaikalRentApp = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([
    { id: 1, role: 'ai', text: 'Привет! Я твой ИИ-консьерж на Байкале. Помогу найти жилье, забронировать технику или составить маршрут. Что планируешь?' }
  ]);
  const [selectedListing, setSelectedListing] = useState(null);
  const [bookingData, setBookingData] = useState({ dates: '', guests: 1 });

  const handleBooking = async (listing) => {
    setSelectedListing(listing);
    // Open TWA Main Button for confirmation
    WebApp.MainButton.setText(`Забронировать: ${listing.metadata?.price_label || 'уточнить'}`);
    WebApp.MainButton.show();
    WebApp.MainButton.onClick(() => {
      confirmBooking(listing);
    });
  };

  const confirmBooking = async (listing) => {
    WebApp.MainButton.showProgress();
    try {
      const response = await fetch('/api/bookings/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          unitId: listing.units?.[0]?.id, // Default to first unit for MVP
          startsAt: new Date().toISOString(), // In real app, take from state
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          price: parseFloat(listing.metadata?.price_label) || 0
        })
      });
      const data = await response.json();
      if (data.id) {
        WebApp.showAlert('✅ Заявка создана! Номер: ' + data.id.slice(0,8));
        setActiveTab('chat');
        setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: `Отлично! Я создал заявку на "${listing.title}". Менеджер свяжется с тобой в ближайшее время.` }]);
      }
    } catch (e) {
      WebApp.showAlert('Ошибка бронирования');
    } finally {
      WebApp.MainButton.hide();
      WebApp.MainButton.hideProgress();
    }
  };

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    // Theme setup
    document.body.style.backgroundColor = WebApp.themeParams.bg_color || '#ffffff';
    document.body.style.color = WebApp.themeParams.text_color || '#000000';
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMsg = { id: Date.now(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Logic for AI Concierge call
      const response = await fetch('/api/ai/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history: messages.slice(-5) })
      });
      const data = await response.json();
      
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: data.text }]);
      if (data.listings && data.listings.length > 0) {
        setListings(data.listings);
        setActiveTab('catalog');
      }
    } catch (e) {
      console.error('AI Error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-white px-4 py-3 border-b flex items-center justify-between shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">B</div>
          <h1 className="font-semibold text-lg text-gray-800">BaikalRent</h1>
        </div>
        <div className="flex items-center gap-3">
          <Filter size={20} className="text-gray-400" />
          <User size={20} className="text-gray-400" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {activeTab === 'chat' && (
          <div className="p-4 space-y-4">
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
              <div className="flex justify-start">
                <div className="bg-white border p-3 rounded-2xl shadow-sm rounded-tl-none animate-pulse text-gray-400">Пишу...</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'catalog' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-xl text-gray-800">Найденные варианты</h2>
              <span className="text-sm text-blue-600 font-medium">Сбросить поиск</span>
            </div>
            {listings.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Search size={48} className="mx-auto mb-4 opacity-20" />
                <p>Начни чат с ИИ-консьержем,<br/>чтобы подобрать жилье</p>
                <button onClick={() => setActiveTab('chat')} className="mt-4 text-blue-600 font-semibold underline">Перейти в чат</button>
              </div>
            ) : (
              listings.map(l => (
                <div key={l.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-4 transition-transform active:scale-[0.98]">
                  <div className="h-48 bg-gray-200 relative">
                    <img src={l.metadata?.image_url || '/placeholder.jpg'} alt={l.title} className="w-full h-full object-cover" />
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-xs font-bold shadow-sm">
                      {l.category === 'stay' ? '🏠 Жилье' : l.category === 'equipment' ? '🚲 Прокат' : '🚤 Тур'}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-lg text-gray-800 leading-tight">{l.title}</h3>
                      <div className="flex items-center text-orange-500 font-bold">
                        <span className="text-sm">★ 4.9</span>
                      </div>
                    </div>
                    <div className="flex items-center text-gray-500 text-sm mb-3">
                      <MapPin size={14} className="mr-1" />
                      {l.location_id ? 'Ольхон, Хужир' : 'Локация не указана'}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">Цена</span>
                        <span className="font-bold text-lg text-blue-600">{l.metadata?.price_label || 'По запросу'}</span>
                      </div>
                      <button className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200">
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

      {/* Floating Input for Chat */}
      {activeTab === 'chat' && (
        <div className="p-4 bg-white border-t fixed bottom-16 w-full z-50 shadow-2xl">
          <div className="flex items-center gap-2 bg-gray-100 rounded-2xl p-2 pl-4 border border-gray-200">
            <input 
              className="flex-1 bg-transparent border-none outline-none text-gray-800 placeholder:text-gray-400" 
              placeholder="Пример: Хочу дом на Ольхоне..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button 
              onClick={sendMessage}
              className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white transition-transform active:scale-90"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="bg-white/80 backdrop-blur-md border-t px-6 py-2 flex items-center justify-between fixed bottom-0 w-full z-50">
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

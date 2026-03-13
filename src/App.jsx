import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, MapPin, Search, Send, User, ChevronRight, Filter } from 'lucide-react';

const WebApp = window.Telegram?.WebApp;

const BaikalRentApp = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { id: 'all', name: 'Все', icon: '🌟' },
    { id: 'stay', name: 'Проживание', icon: '🏠' },
    { id: 'rental', name: 'Прокат', icon: '🚲' },
    { id: 'food', name: 'Покушать', icon: '🍽️' },
    { id: 'excursion', name: 'Экскурсии', icon: '🗺️' },
    { id: 'poi', name: 'Интересное', icon: '🏛️' },
    { id: 'bundle', name: 'Пакеты', icon: '🎁' },
  ];
  const [messages, setMessages] = useState([
    { id: 1, role: 'ai', text: 'Привет! Я твой ИИ-консьерж на Байкале. Помогу найти жилье, забронировать технику или составить маршрут. Что планируешь?' }
  ]);
  const [input, setInput] = useState('');
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (WebApp) {
      WebApp.ready();
      WebApp.expand();
      document.body.style.backgroundColor = WebApp.themeParams?.bg_color || '#f9fafb';
    }
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = { id: Date.now(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('https://von-untitled-arg-modem.trycloudflare.com/api/ai/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history: messages.slice(-5) })
      });
      const data = await response.json();
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: data.text || 'Прости, я отвлекся. Попробуй еще раз?' }]);
      if (data.listings?.length > 0) {
        setListings(data.listings);
        setActiveTab('catalog');
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: 'Ошибка связи с сервером. Проверь интернет или попробуй позже.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBooking = (listing) => {
    if (WebApp) {
      WebApp.showAlert(`Бронирование "${listing.title}" пока в разработке!`);
    } else {
      alert(`Бронирование "${listing.title}"!`);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden">
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
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-800'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-gray-400 text-sm animate-pulse pl-2">Печатаю...</div>}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <h2 className="font-bold text-xl mb-4">Каталог объектов</h2>
            {listings.length === 0 ? (
              <p className="text-gray-400 text-center py-10">Тут пока пусто. Попроси ИИ найти что-нибудь!</p>
            ) : (
              listings.map(l => (
                <div key={l.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 p-4">
                   <h3 className="font-bold text-lg">{l.title}</h3>
                   <p className="text-gray-500 text-sm mb-2">{l.metadata?.price_label || 'Цена по запросу'}</p>
                   <button onClick={() => handleBooking(l)} className="w-full bg-blue-600 text-white py-2 rounded-xl font-bold">Забронировать</button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Input */}
      {activeTab === 'chat' && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-white border-t">
          <div className="flex gap-2 bg-gray-100 rounded-2xl p-2 pl-4 border border-gray-200">
            <input 
              className="flex-1 bg-transparent border-none outline-none" 
              placeholder="Хочу дом на Ольхоне..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage} className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-3">
        <button onClick={() => setActiveTab('chat')} className={activeTab === 'chat' ? 'text-blue-600' : 'text-gray-400'}>Чат</button>
        <button onClick={() => setActiveTab('catalog')} className={activeTab === 'catalog' ? 'text-blue-600' : 'text-gray-400'}>Поиск</button>
      </div>
    </div>
  );
};

export default BaikalRentApp;

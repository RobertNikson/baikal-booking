import React, { useMemo, useState, useEffect } from 'react';
import { MessageSquare, Calendar, Search, Send, User } from 'lucide-react';

const API_BASE = 'https://ones-msg-diana-wyoming.trycloudflare.com/api';

const LOCATIONS = [
  { name: 'Листвянка', image: 'https://images.unsplash.com/photo-1548013146-72479768bbaa?q=80&w=1000', description: 'Ворота Байкала: нерпинарий, музей, набережная, катера.' },
  { name: 'Большие Коты', image: 'https://images.unsplash.com/photo-1472396961693-142e6e269027?q=80&w=1000', description: 'Тихий поселок для треккинга и спокойного отдыха.' },
  { name: 'Порт Байкал', image: 'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?q=80&w=1000', description: 'Историческая точка КБЖД, прогулки и виды на озеро.' },
  { name: 'Большое Голоустное', image: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=1000', description: 'Пляжи, смотровые точки и выезды на природу.' },
  { name: 'Остров Ольхон', image: 'https://images.unsplash.com/photo-1590505299054-938833919967?q=80&w=1000', description: 'Место силы: Шаманка, степи, закаты и туры на мыс Хобой.' },
  { name: 'Малое море', image: 'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?q=80&w=1000', description: 'Бухты и базы отдыха, удобный формат для семей.' },
  { name: 'Хужир', image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1000', description: 'Главная точка Ольхона: кафе, экскурсии, прокат.' },
  { name: 'Байкальск', image: 'https://images.unsplash.com/photo-1482192505345-5655af888cc4?q=80&w=1000', description: 'Южное побережье, горнолыжка и активный отдых.' },
  { name: 'Бухта Песчаная', image: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?q=80&w=1000', description: 'Одна из самых красивых бухт, пляжный формат отдыха.' },
  { name: 'Бухта Зуун Хагуун', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000', description: 'Удаленная бухта для приватного и спокойного отдыха.' },
  { name: 'Сарайский пляж', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000', description: 'Длинный песчаный пляж рядом с Хужиром.' },
  { name: 'Гранатовый пляж', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000', description: 'Живописная точка для фотосетов и отдыха у воды.' },
];

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
    initAuth();
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
    } catch (e) {
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'ai', text: 'Ошибка связи с сервером. Но я все еще помню локации!' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <div className="bg-white px-4 py-3 border-b flex items-center justify-between shadow-sm">
        <div className="font-bold text-xl text-blue-600">BaikalRent</div>
        <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">{user?.full_name || 'Гость'}</div>
      </div>

      <div className="flex-1 overflow-y-auto pb-28">
        {activeTab === 'chat' ? (
          <div className="p-4 space-y-4">
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {LOCATIONS.map((loc) => (
                <button key={loc.name} onClick={() => setSelectedLocation(loc)} className="min-w-[140px] bg-white border rounded-2xl overflow-hidden text-left shadow-sm active:scale-95 transition-transform">
                  <img src={loc.image} className="w-full h-20 object-cover" />
                  <div className="p-2 text-xs font-bold truncate">{loc.name}</div>
                </button>
              ))}
            </div>

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border shadow-sm rounded-tl-none'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-xs text-gray-400 animate-pulse pl-2">Печатаю...</div>}
          </div>
        ) : (
          <div className="p-4 grid gap-4">
            <h2 className="text-xl font-bold">Каталог Байкала</h2>
            {LOCATIONS.map((l) => (
              <div key={l.name} className="bg-white border rounded-2xl p-4 shadow-sm flex gap-4" onClick={() => setSelectedLocation(l)}>
                <img src={l.image} className="w-20 h-20 rounded-xl object-cover" />
                <div className="flex-1">
                  <div className="font-bold">{l.name}</div>
                  <div className="text-xs text-gray-500 line-clamp-2 mt-1">{l.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedLocation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100]" onClick={() => setSelectedLocation(null)}>
          <div className="bg-white rounded-3xl overflow-hidden max-w-sm w-full animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <img src={selectedLocation.image} className="w-full h-48 object-cover" />
            <div className="p-6">
              <div className="text-2xl font-bold">{selectedLocation.name}</div>
              <div className="text-gray-600 mt-3 leading-relaxed">{selectedLocation.description}</div>
              <button onClick={() => { setInput(`Расскажи подробнее про ${selectedLocation.name}`); setSelectedLocation(null); setActiveTab('chat'); }} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold mt-6">Спросить ИИ</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t z-50">
          <div className="flex gap-2 bg-gray-100 p-2 rounded-2xl border">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Например: жилье на Ольхоне" className="flex-1 bg-transparent px-3 py-2 outline-none" />
            <button onClick={sendMessage} className="bg-blue-600 text-white p-3 rounded-xl shadow-lg active:scale-90 transition-transform"><Send size={18} /></button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t py-3 flex justify-around z-50">
        <button onClick={() => setActiveTab('chat')} className={`flex flex-col items-center gap-1 ${activeTab === 'chat' ? 'text-blue-600' : 'text-gray-400'}`}>
          <MessageSquare size={24} />
          <span className="text-[10px] font-bold uppercase">Чат</span>
        </button>
        <button onClick={() => setActiveTab('catalog')} className={`flex flex-col items-center gap-1 ${activeTab === 'catalog' ? 'text-blue-600' : 'text-gray-400'}`}>
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
}

import React, { useMemo, useState } from 'react';
import { MessageSquare, Calendar, Search, Send, User } from 'lucide-react';

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

function localAnswer(text) {
  const q = text.toLowerCase();
  const found = LOCATIONS.find((l) => q.includes(l.name.toLowerCase()));
  if (found) return `📍 ${found.name}: ${found.description}`;

  if (q.includes('прожив')) return '🏠 Проживание: могу предложить Листвянку, Хужир, Малое море и Байкальск под разный бюджет.';
  if (q.includes('прокат')) return '🚲 Прокат: велосипеды, SUP, катера, авто и снаряжение доступны в Листвянке, Хужире и на Малом море.';
  if (q.includes('экскурс')) return '🗺️ Экскурсии: пешие, с гидом, водные и авто-туры (в т.ч. Хобой/Ольхон/КБЖД).';
  if (q.includes('покуш') || q.includes('еда') || q.includes('кафе')) return '🍽️ По еде: в Листвянке и Хужире лучший выбор кафе и локальной кухни.';
  if (q.includes('пакет') || q.includes('день')) return '🎁 Пакеты: могу собрать маршрут на 1–7 дней по бюджету и активности (лайт/средний/актив).';

  return 'Я помогу подобрать отдых на Байкале: локация, бюджет, активность, проживание/прокат/экскурсии. Напиши критерии 👇';
}

export default function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [messages, setMessages] = useState([
    { id: 1, role: 'ai', text: 'Привет! Я офлайн-консьерж BaikalRent. Уже работаю без туннелей и внешнего AI API.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const quick = useMemo(() => LOCATIONS.slice(0, 8), []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text }]);
    setInput('');
    setIsLoading(true);
    setTimeout(() => {
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'ai', text: localAnswer(text) }]);
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <div className="bg-white px-4 py-3 border-b flex items-center justify-between">
        <div className="font-semibold text-lg">BaikalRent</div>
        <User size={18} className="text-gray-500" />
      </div>

      <div className="flex-1 overflow-y-auto pb-28">
        {activeTab === 'chat' ? (
          <div className="p-4 space-y-3">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {quick.map((loc) => (
                <button key={loc.name} onClick={() => setSelectedLocation(loc)} className="min-w-[130px] bg-white border rounded-xl overflow-hidden text-left">
                  <img src={loc.image} className="w-full h-16 object-cover" />
                  <div className="p-2 text-xs font-semibold truncate">{loc.name}</div>
                </button>
              ))}
            </div>

            {messages.map((msg) => (
              <div key={msg.id} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
                <span className={msg.role === 'user' ? 'inline-block bg-blue-600 text-white px-3 py-2 rounded-2xl' : 'inline-block bg-white border px-3 py-2 rounded-2xl'}>{msg.text}</span>
              </div>
            ))}
            {isLoading && <div className="text-xs text-gray-400">Печатаю...</div>}
          </div>
        ) : (
          <div className="p-4 grid gap-3">
            {LOCATIONS.map((l) => (
              <div key={l.name} className="bg-white border rounded-xl p-3">
                <div className="font-semibold">{l.name}</div>
                <div className="text-sm text-gray-600">{l.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedLocation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedLocation(null)}>
          <div className="bg-white rounded-2xl overflow-hidden max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <img src={selectedLocation.image} className="w-full h-40 object-cover" />
            <div className="p-4">
              <div className="text-lg font-bold">{selectedLocation.name}</div>
              <div className="text-sm text-gray-600 mt-2">{selectedLocation.description}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="fixed bottom-14 left-0 right-0 p-3 bg-white border-t">
          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Например: хочу отдых на Ольхоне 3 дня" className="flex-1 border rounded-xl px-3 py-2" />
            <button onClick={sendMessage} className="bg-blue-600 text-white px-3 rounded-xl"><Send size={16} /></button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t py-2 flex justify-around">
        <button onClick={() => setActiveTab('chat')} className={activeTab === 'chat' ? 'text-blue-600' : 'text-gray-500'}><MessageSquare size={20} /></button>
        <button onClick={() => setActiveTab('catalog')} className={activeTab === 'catalog' ? 'text-blue-600' : 'text-gray-500'}><Search size={20} /></button>
        <button className="text-gray-500"><Calendar size={20} /></button>
      </div>
    </div>
  );
}

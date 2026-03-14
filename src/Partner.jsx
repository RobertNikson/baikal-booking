import React, { useState, useEffect } from 'react';

// Safe access to WebApp
const getWebApp = () => {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
};

const API_BASE = 'https://331a6527c7712888-155-212-230-3.serveousercontent.com/api';

const PartnerDashboard = () => {
  const [user, setUser] = useState(null);
  const [partner, setPartner] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('baikal_partner_token'));
  const [listings, setListings] = useState([]);
  const [locations, setLocations] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentListing, setCurrentListing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      const WebApp = getWebApp();
      if (!WebApp || !WebApp.initData) {
        setIsLoading(false);
        return;
      }
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
          localStorage.setItem('baikal_partner_token', data.token);
          setUser(data.user);
          setPartner(data.partner);
          if (!data.partner) setShowRegister(true);
          else fetchPartnerData(data.token);
        }
      } catch (e) {
        console.error('Auth error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchLocations = async () => {
      try {
        const res = await fetch(`${API_BASE}/locations`);
        const data = await res.json();
        setLocations(Array.isArray(data) ? data : []);
      } catch (e) { console.error(e); }
    };

    initAuth();
    fetchLocations();
  }, []);

  const fetchPartnerData = async (activeToken) => {
    try {
      const res = await fetch(`${API_BASE}/partners/my-listings`, {
        headers: { 'Authorization': `Bearer ${activeToken || token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setListings(data);
    } catch (e) { console.error(e); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = {
      name: formData.get('name'),
      partnerType: formData.get('type'),
      phone: formData.get('phone'),
      email: formData.get('email')
    };

    try {
      const res = await fetch(`${API_BASE}/partners/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.partner) {
        setPartner(data.partner);
        setShowRegister(false);
        const WebApp = getWebApp();
        if (WebApp) WebApp.showAlert('Поздравляем! Вы зарегистрированы как партнер.');
        fetchPartnerData();
      }
    } catch (e) { alert('Ошибка регистрации'); }
  };

  const handleSaveListing = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = {
      title: formData.get('title'),
      category: formData.get('category'),
      locationId: formData.get('locationId'),
      description: formData.get('description'),
      metadata: {
        price_label: formData.get('price'),
        image_url: formData.get('image_url')
      }
    };

    const url = currentListing?.id 
      ? `${API_BASE}/listings/${currentListing.id}` 
      : `${API_BASE}/listings`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.id) {
        setIsEditing(false);
        fetchPartnerData();
        const WebApp = getWebApp();
        if (WebApp) WebApp.showAlert(currentListing?.id ? 'Изменения сохранены!' : 'Карточка добавлена!');
      }
    } catch (e) { alert('Ошибка сохранения'); }
  };

  const handleDeleteListing = async (id) => {
    const WebApp = getWebApp();
    const confirmDelete = () => {
      fetch(`${API_BASE}/listings/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(() => {
        fetchPartnerData();
        if (WebApp) WebApp.showAlert('Удалено');
      });
    };

    if (WebApp) {
      WebApp.showConfirm('Удалить это предложение?', (ok) => {
        if (ok) confirmDelete();
      });
    } else {
      if (window.confirm('Удалить?')) confirmDelete();
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-gray-400 animate-pulse font-medium">Авторизация в BaikalRent...</div>
    </div>
  );

  if (showRegister) {
    return (
      <div className="p-6 bg-white min-h-screen font-sans">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-blue-100">B</div>
          <h1 className="text-2xl font-bold text-gray-800">Стать партнером</h1>
          <p className="text-gray-400 text-sm mt-1">Начните принимать бронирования сегодня</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Название бизнеса</label>
            <input name="name" placeholder="Напр: Гостевой дом 'У Шаманки'" className="w-full border-gray-100 border-2 p-4 rounded-2xl focus:border-blue-600 outline-none transition-colors" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Тип организации</label>
            <select name="type" className="w-full border-gray-100 border-2 p-4 rounded-2xl focus:border-blue-600 outline-none transition-colors appearance-none bg-white">
              <option value="self_employed">Самозанятый</option>
              <option value="ip">ИП</option>
              <option value="ooo">ООО</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Телефон для связи</label>
            <input name="phone" placeholder="+7 (999) 000-00-00" className="w-full border-gray-100 border-2 p-4 rounded-2xl focus:border-blue-600 outline-none transition-colors" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Контактный Email</label>
            <input name="email" type="email" placeholder="example@mail.ru" className="w-full border-gray-100 border-2 p-4 rounded-2xl focus:border-blue-600 outline-none transition-colors" />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-bold shadow-lg shadow-blue-200 mt-4 active:scale-95 transition-transform">
            Создать кабинет
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans">
      <div className="bg-white p-5 border-b flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div>
          <h1 className="font-bold text-xl text-gray-800">{partner?.name}</h1>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Активный партнер</p>
          </div>
        </div>
        <button 
          onClick={() => { setCurrentListing({}); setIsEditing(true); }} 
          className="bg-blue-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100 active:scale-90 transition-transform text-2xl font-bold"
        >
          +
        </button>
      </div>

      <div className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest ml-1">Мои предложения</h2>
        {listings.map(l => (
          <div key={l.id} className="bg-white rounded-3xl p-4 shadow-sm border border-gray-50 flex gap-4 animate-in fade-in slide-in-from-bottom-2">
            <img src={l.metadata?.image_url || 'https://via.placeholder.com/150'} className="w-20 h-20 rounded-2xl object-cover bg-gray-50" alt="" />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-800 truncate">{l.title}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{l.category}</p>
              <div className="flex items-center justify-between mt-3">
                <p className="font-bold text-blue-600">{l.metadata?.price_label || 'Цена не указана'}</p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => { setCurrentListing(l); setIsEditing(true); }}
                    className="bg-gray-50 text-gray-400 px-3 py-1.5 rounded-lg text-xs font-bold"
                  >
                    Изм.
                  </button>
                  <button 
                    onClick={() => handleDeleteListing(l.id)}
                    className="bg-red-50 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold"
                  >
                    Удал.
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {listings.length === 0 && (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100">
            <p className="text-gray-300 font-medium">Здесь пока пусто.<br/>Добавьте свою первую услугу!</p>
          </div>
        )}
      </div>

      {isEditing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end">
          <div className="bg-white w-full rounded-t-[40px] p-8 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800">{currentListing?.id ? 'Редактирование' : 'Новое предложение'}</h2>
              <button onClick={() => setIsEditing(false)} className="bg-gray-100 p-2 rounded-full w-10 h-10 flex items-center justify-center font-bold text-gray-400">×</button>
            </div>
            <form onSubmit={handleSaveListing} className="space-y-5 pb-6">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Название услуги/товара</label>
                <input name="title" defaultValue={currentListing?.title} placeholder="Напр: Прокат байдарок" className="w-full bg-gray-50 border-transparent border-2 p-4 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all" required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Категория</label>
                  <select name="category" defaultValue={currentListing?.category || 'stay'} className="w-full bg-gray-50 border-transparent border-2 p-4 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all appearance-none">
                    <option value="stay">🏠 Жилье</option>
                    <option value="rental">🚲 Прокат</option>
                    <option value="food">🍽️ Еда</option>
                    <option value="excursion">🗺️ Экскурсия</option>
                    <option value="poi">🏛️ Интересное</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Локация</label>
                  <select name="locationId" defaultValue={currentListing?.location_id} className="w-full bg-gray-50 border-transparent border-2 p-4 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all appearance-none">
                    {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Стоимость</label>
                <input name="price" defaultValue={currentListing?.metadata?.price_label} placeholder="Напр: 1500 ₽ / час" className="w-full bg-gray-50 border-transparent border-2 p-4 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Описание</label>
                <textarea name="description" defaultValue={currentListing?.description} placeholder="Опишите ваше предложение подробно..." className="w-full bg-gray-50 border-transparent border-2 p-4 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all" rows="4"></textarea>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">URL Фотографии</label>
                <input name="image_url" defaultValue={currentListing?.metadata?.image_url} placeholder="https://ссылка-на-фото.jpg" className="w-full bg-gray-50 border-transparent border-2 p-4 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all" />
              </div>

              <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-bold shadow-xl shadow-blue-100 mt-4 active:scale-95 transition-transform">
                {currentListing?.id ? 'Сохранить изменения' : 'Опубликовать'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerDashboard;

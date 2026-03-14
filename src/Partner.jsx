import React, { useState, useEffect } from 'react';

// Safe access to WebApp
const getWebApp = () => {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
};

const API_BASE = 'https://ones-msg-diana-wyoming.trycloudflare.com/api'; // Using current active tunnel

const PartnerDashboard = () => {
  const [user, setUser] = useState(null);
  const [partner, setPartner] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('baikal_token'));
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

      try {
        const res = await fetch(`${API_BASE}/auth/telegram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: WebApp.initData })
        });
        const data = await res.json();
        if (data.token) {
          setToken(data.token);
          localStorage.setItem('baikal_token', data.token);
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
        setLocations(data);
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

    try {
      const res = await fetch(`${API_BASE}/listings`, {
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
        if (WebApp) WebApp.showAlert('Карточка успешно добавлена!');
      }
    } catch (e) { alert('Ошибка сохранения'); }
  };

  if (isLoading) return <div className="p-10 text-center text-gray-400">Авторизация...</div>;

  if (showRegister) {
    return (
      <div className="p-6 bg-white min-h-screen">
        <h1 className="text-2xl font-bold mb-6">Регистрация партнёра</h1>
        <form onSubmit={handleRegister} className="space-y-4">
          <input name="name" placeholder="Название компании / Имя" className="w-full border p-3 rounded-xl" required />
          <select name="type" className="w-full border p-3 rounded-xl">
            <option value="self_employed">Самозанятый</option>
            <option value="ip">ИП</option>
            <option value="ooo">ООО</option>
          </select>
          <input name="phone" placeholder="Телефон" className="w-full border p-3 rounded-xl" required />
          <input name="email" placeholder="Email (необязательно)" className="w-full border p-3 rounded-xl" />
          <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">Зарегистрироваться</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white p-4 border-b flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="font-bold text-xl">Кабинет: {partner?.name}</h1>
          <p className="text-xs text-gray-400">ID: {partner?.id?.slice(0,8)}</p>
        </div>
        <button onClick={() => { setCurrentListing({}); setIsEditing(true); }} className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg">+</button>
      </div>

      <div className="p-4 space-y-4">
        {listings.map(l => (
          <div key={l.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-4">
            <img src={l.metadata?.image_url || 'https://via.placeholder.com/80'} className="w-20 h-20 rounded-xl object-cover" />
            <div className="flex-1">
              <h3 className="font-bold text-gray-800">{l.title}</h3>
              <p className="text-sm text-gray-500">{l.category}</p>
              <p className="font-bold text-blue-600 mt-1">{l.metadata?.price_label || '0 ₽'}</p>
            </div>
          </div>
        ))}
        {listings.length === 0 && <p className="text-center text-gray-400 py-10">У вас пока нет активных предложений.</p>}
      </div>

      {isEditing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Новое предложение</h2>
              <button onClick={() => setIsEditing(false)} className="text-gray-400">Закрыть</button>
            </div>
            <form onSubmit={handleSaveListing} className="space-y-4">
              <input name="title" placeholder="Название" className="w-full border p-3 rounded-xl" required />
              <select name="category" className="w-full border p-3 rounded-xl">
                <option value="stay">Проживание</option>
                <option value="rental">Прокат</option>
                <option value="food">Покушать</option>
                <option value="excursion">Экскурсия</option>
                <option value="poi">Интересное</option>
              </select>
              <select name="locationId" className="w-full border p-3 rounded-xl">
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
              <input name="price" placeholder="Цена (напр: 5000 руб/сут)" className="w-full border p-3 rounded-xl" />
              <textarea name="description" placeholder="Описание" className="w-full border p-3 rounded-xl" rows="3"></textarea>
              <input name="image_url" placeholder="Ссылка на фото (URL)" className="w-full border p-3 rounded-xl" />
              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">Опубликовать</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerDashboard;

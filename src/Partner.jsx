import React, { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { Plus, Edit, Trash2, Save, X, Image as ImageIcon, MapPin, Tag } from 'lucide-react';

const PartnerDashboard = () => {
  const [listings, setListings] = useState([]);
  const [locations, setLocations] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentListing, setCurrentListing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Mock Partner ID for MVP (in production should come from Auth/JWT)
  const partnerId = '00000000-0000-0000-0000-000000000000'; 

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // 1. Fetch locations for dropdown
      const locRes = await fetch('https://von-untitled-arg-modem.trycloudflare.com/locations');
      const locData = await locRes.json();
      setLocations(locData);

      // 2. Fetch partner listings (mocked for now, needs real endpoint)
      // In a real app, we'd use /partners/:id/listings
      const listRes = await fetch('https://von-untitled-arg-modem.trycloudflare.com/catalog?locationId=' + locData[0]?.id);
      const listData = await listRes.json();
      setListings(listData);
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
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
      // Mocking save logic - in real app would hit POST /partners/:id/listings
      WebApp.showConfirm('Сохранить изменения?', (ok) => {
        if (ok) {
          WebApp.showAlert('✅ Карточка сохранена!');
          setIsEditing(false);
          // Refresh list...
        }
      });
    } catch (e) {
      WebApp.showAlert('Ошибка сохранения');
    }
  };

  if (isLoading) return <div className="p-10 text-center text-gray-400">Загрузка кабинета...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white p-4 border-b flex justify-between items-center sticky top-0 z-10">
        <h1 className="font-bold text-xl">Кабинет партнёра</h1>
        <button 
          onClick={() => { setCurrentListing({}); setIsEditing(true); }}
          className="bg-blue-600 text-white p-2 rounded-full shadow-lg"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Stats Summary */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100">
          <span className="text-xs text-blue-400 font-bold uppercase">Активные</span>
          <p className="text-2xl font-bold text-blue-700">{listings.length}</p>
        </div>
        <div className="bg-orange-50 p-3 rounded-2xl border border-orange-100">
          <span className="text-xs text-orange-400 font-bold uppercase">Брони</span>
          <p className="text-2xl font-bold text-orange-700">0</p>
        </div>
      </div>

      {/* Listing List */}
      <div className="p-4 space-y-4">
        <h2 className="font-bold text-gray-500 uppercase text-xs tracking-wider">Ваши предложения</h2>
        {listings.map(l => (
          <div key={l.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-4">
            <img src={l.metadata?.image_url || 'https://via.placeholder.com/80'} className="w-20 h-20 rounded-xl object-cover bg-gray-100" />
            <div className="flex-1">
              <h3 className="font-bold text-gray-800 leading-tight">{l.title}</h3>
              <div className="flex items-center text-xs text-gray-400 mt-1">
                <Tag size={12} className="mr-1" /> {l.category}
              </div>
              <p className="font-bold text-blue-600 mt-2">{l.metadata?.price_label || '0 ₽'}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => { setCurrentListing(l); setIsEditing(true); }} className="p-2 text-gray-400 hover:text-blue-600"><Edit size={18} /></button>
              <button className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">{currentListing?.id ? 'Редактировать' : 'Новая карточка'}</h2>
              <button onClick={() => setIsEditing(false)} className="bg-gray-100 p-2 rounded-full"><X size={20} /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Название</label>
                <input name="title" defaultValue={currentListing?.title} className="w-full bg-gray-50 border rounded-xl p-3 outline-none focus:border-blue-600" required placeholder="Напр: Прокат SUP-бордов" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Категория</label>
                  <select name="category" defaultValue={currentListing?.category} className="w-full bg-gray-50 border rounded-xl p-3 outline-none appearance-none">
                    <option value="stay">Проживание</option>
                    <option value="rental">Прокат</option>
                    <option value="food">Покушать</option>
                    <option value="excursion">Экскурсия</option>
                    <option value="poi">Интересное</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Локация</label>
                  <select name="locationId" defaultValue={currentListing?.location_id} className="w-full bg-gray-50 border rounded-xl p-3 outline-none appearance-none">
                    {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Цена (текстом)</label>
                <input name="price" defaultValue={currentListing?.metadata?.price_label} className="w-full bg-gray-50 border rounded-xl p-3 outline-none focus:border-blue-600" placeholder="Напр: 1500 ₽ / час" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Описание</label>
                <textarea name="description" defaultValue={currentListing?.description} rows="3" className="w-full bg-gray-50 border rounded-xl p-3 outline-none focus:border-blue-600" placeholder="Подробное описание услуги..." />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ссылка на фото</label>
                <div className="flex gap-2">
                  <div className="bg-gray-100 p-3 rounded-xl"><ImageIcon className="text-gray-400" /></div>
                  <input name="image_url" defaultValue={currentListing?.metadata?.image_url} className="flex-1 bg-gray-50 border rounded-xl p-3 outline-none focus:border-blue-600" placeholder="https://..." />
                </div>
              </div>

              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
                <Save size={20} /> Сохранить карточку
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerDashboard;

-- Обновление описаний локаций
UPDATE locations SET 
  metadata = jsonb_build_object(
    'description', 'Главные ворота Байкала. Здесь находится Нерпинарий, Музей Байкала и знаменитый рыбный рынок.',
    'image_url', 'https://images.unsplash.com/photo-1548013146-72479768bbaa?q=80&w=1000'
  ) WHERE slug = 'listvyanka';

UPDATE locations SET 
  metadata = jsonb_build_object(
    'description', 'Сердце Байкала. Место силы, Скала Шаманка и бескрайние степи.',
    'image_url', 'https://images.unsplash.com/photo-1590505299054-938833919967?q=80&w=1000'
  ) WHERE slug = 'olkhon-island';

UPDATE locations SET 
  metadata = jsonb_build_object(
    'description', 'Горнолыжный курорт "Гора Соболиная" и уникальный пляж с красным песком.',
    'image_url', 'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?q=80&w=1000'
  ) WHERE slug = 'baikalsk';

-- Добавление новых категорий в перечисление (если нужно, но в схеме это текст)
-- Пример пакетного тура
INSERT INTO bundles (location_id, title, description, price_label, is_active)
SELECT id, 'Выходные в Листвянке', '2 дня: Отель + Нерпинарий + Прогулка на катере', '15 000 ₽', true
FROM locations WHERE slug = 'listvyanka' LIMIT 1;

INSERT INTO bundles (location_id, title, description, price_label, is_active)
SELECT id, 'Неделя на Ольхоне', '7 дней: Хужир + Мыс Хобой + Палаточный лагерь + ГАЗ-66 экспириенс', '45 000 ₽', true
FROM locations WHERE slug = 'olkhon-island' LIMIT 1;

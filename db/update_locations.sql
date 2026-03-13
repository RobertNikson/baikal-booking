-- Clear existing locations if needed (optional, safer to keep what exists but for fresh start:)
-- TRUNCATE locations CASCADE;

INSERT INTO locations (name, slug, type, is_active) VALUES 
('Листвянка', 'listvyanka', 'settlement', true),
('Большие Коты', 'bolshie-koty', 'settlement', true),
('Порт Байкал', 'port-baikal', 'settlement', true),
('Большое Голоустное', 'bolshoe-goloustnoe', 'settlement', true),
('Остров Ольхон', 'olkhon-island', 'area', true),
('Малое море', 'maloe-more', 'area', true),
('Хужир', 'khuzhir', 'settlement', true),
('Южное побережье', 'south-coast', 'region', true),
('Байкальск', 'baikalsk', 'settlement', true),
('Бухта Песчаная', 'peschanaya-bay', 'bay', true),
('Бухта Зуун Хагуун', 'zuun-khaguun-bay', 'bay', true),
('Сарайский пляж', 'saraisky-beach', 'poi', true),
('Гранатовый пляж', 'garnet-beach', 'poi', true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = true;

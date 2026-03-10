-- Root
insert into locations(name,slug,type) values ('Байкал','baikal','region')
on conflict (slug) do nothing;

-- Areas/settlements
with root as (select id from locations where slug='baikal')
insert into locations(parent_id,name,slug,type) values
((select id from root),'Листвянка','listvyanka','settlement'),
((select id from root),'Ольхон','olkhon','area'),
((select id from root),'МРС','mrs','settlement'),
((select id from root),'Малое море','maloe-more','area')
on conflict (slug) do nothing;

-- Bays examples
insert into locations(parent_id,name,slug,type)
select id,'Бухта Песчаная','bukhta-peschanaya','bay' from locations where slug='baikal'
on conflict (slug) do nothing;

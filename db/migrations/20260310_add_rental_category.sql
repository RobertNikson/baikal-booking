alter table listings drop constraint if exists listings_category_check;
alter table listings add constraint listings_category_check check (category in ('equipment','stay','activity','rental'));

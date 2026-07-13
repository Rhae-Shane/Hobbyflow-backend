-- Unique illustration per hobby category (keys map to app SVG components / storage paths).

alter table public.hobby_category
  add column if not exists illustration_key text,
  add column if not exists illustration_url text;

update public.hobby_category set illustration_key = v.key, illustration_url = v.url
from (values
  (1,  'sports-fitness',           'illustrations/categories/sports-fitness.svg'),
  (2,  'outdoor-nature',           'illustrations/categories/outdoor-nature.svg'),
  (3,  'arts-crafts',              'illustrations/categories/arts-crafts.svg'),
  (4,  'music',                    'illustrations/categories/music.svg'),
  (5,  'collecting',               'illustrations/categories/collecting.svg'),
  (6,  'games-puzzles',            'illustrations/categories/games-puzzles.svg'),
  (7,  'cooking-food',             'illustrations/categories/cooking-food.svg'),
  (8,  'writing-literature',       'illustrations/categories/writing-literature.svg'),
  (9,  'technology-science',       'illustrations/categories/technology-science.svg'),
  (10, 'performing-arts',          'illustrations/categories/performing-arts.svg'),
  (11, 'water-sports',             'illustrations/categories/water-sports.svg'),
  (12, 'winter-sports',            'illustrations/categories/winter-sports.svg'),
  (13, 'animal-pet',               'illustrations/categories/animal-pet.svg'),
  (14, 'travel-exploration',       'illustrations/categories/travel-exploration.svg'),
  (15, 'diy-home',                 'illustrations/categories/diy-home.svg'),
  (16, 'social-community',         'illustrations/categories/social-community.svg'),
  (17, 'mind-body-wellness',       'illustrations/categories/mind-body-wellness.svg'),
  (18, 'photography-visual',       'illustrations/categories/photography-visual.svg'),
  (19, 'automotive-mechanical',    'illustrations/categories/automotive-mechanical.svg'),
  (20, 'miscellaneous',            'illustrations/categories/miscellaneous.svg')
) as v(id, key, url)
where hobby_category.id = v.id;

alter table public.hobby_category
  alter column illustration_key set not null;

alter table public.hobby_category
  drop constraint if exists hobby_category_illustration_key_unique;

alter table public.hobby_category
  add constraint hobby_category_illustration_key_unique unique (illustration_key);

alter table public.hobby_category
  drop constraint if exists hobby_category_illustration_key_nonempty;

alter table public.hobby_category
  add constraint hobby_category_illustration_key_nonempty
    check (char_length(trim(illustration_key)) > 0);

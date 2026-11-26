-- =====================================================================
-- Tag list update (owner's request)
--   Rename: "Beaten 1v1" -> "1v1 Defence" (same tag, so existing clips keep it)
--   Add:    "1v1 Attack", "Shooting", "Pressing"
--   Order:  1v1 Attack, 1v1 Defence, Passing, Duels, First touch, Shooting,
--           Positioning, Pressing, Defending, Transition
-- =====================================================================

update public.tags set name = '1v1 Defence' where name = 'Beaten 1v1';

insert into public.tags (name) values ('1v1 Attack'), ('Shooting'), ('Pressing')
on conflict (name) do nothing;

update public.tags t set sort_order = o.pos
from (values
  ('1v1 Attack', 1), ('1v1 Defence', 2), ('Passing', 3), ('Duels', 4), ('First touch', 5),
  ('Shooting', 6), ('Positioning', 7), ('Pressing', 8), ('Defending', 9), ('Transition', 10)
) as o(name, pos)
where t.name = o.name;

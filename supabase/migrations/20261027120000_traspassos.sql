-- Traspassos entre comptes (D-049, 2026-10-27).
-- Un moviment marcat és diners que passen d'un compte de la falla a un altre: no és ni ingrés ni despesa. Els informes
-- no el compten; el saldo de cada compte sí. Una regla d'importació marcada posa la marca als moviments que casen.
-- Qui no té l'Historial en edició no la pot canviar: t30_columnes només li deixa canviar el concepte i l'import.

alter table public.moviments add column traspas boolean not null default false;
comment on column public.moviments.traspas is
  'Traspàs entre comptes de la falla (D-049): no compta com a ingrés ni despesa; sí al saldo del compte.';

alter table public.regles_importacio add column traspas boolean not null default false;
comment on column public.regles_importacio.traspas is
  'Els moviments importats que casen amb la regla es marquen com a traspàs (D-049).';

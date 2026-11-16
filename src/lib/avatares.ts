// ---------------------------------------------------------------------
// Personajes elegidos por las cuentas: se piden una sola vez y se guardan
// en memoria mientras la app está abierta.
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const cache = new Map<string, string | null>();

export function olvidarAvatar(id: string) {
  cache.delete(id);
}

/** Devuelve { id: personaje } para las cuentas pedidas */
export function useAvatares(ids: (string | null | undefined)[]): Record<string, string | null> {
  const lista = [...new Set(ids.filter(Boolean) as string[])].sort();
  const clave = lista.join(',');
  const armar = () => Object.fromEntries(lista.filter((id) => cache.has(id)).map((id) => [id, cache.get(id) ?? null]));
  const [mapa, setMapa] = useState<Record<string, string | null>>(armar);

  useEffect(() => {
    const faltan = lista.filter((id) => !cache.has(id));
    if (!faltan.length) {
      setMapa(armar());
      return;
    }
    let vivo = true;
    supabase.rpc('avatares', { p_ids: faltan }).then(({ data }) => {
      faltan.forEach((id) => cache.set(id, null));
      ((data ?? []) as { id: string; avatar: string }[]).forEach((x) => cache.set(x.id, x.avatar));
      if (vivo) setMapa(armar());
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return mapa;
}

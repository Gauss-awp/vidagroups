import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Perfil, Red } from '@/lib/types';

interface AuthContextValue {
  session: Session | null;
  perfil: Perfil | null;
  /** Redes que esta persona administra (Encargado, Pastor asignado o Apóstol) */
  redesAdmin: Red[];
  /** Redes en las que esta persona es Consolidador/a */
  redesConsolida: Red[];
  cargando: boolean;
  errorPerfil: string | null;
  refrescarPerfil: () => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function cargarRedesConsolida(perfil: Perfil): Promise<Red[]> {
  if (perfil.estado !== 'activo') return [];
  const { data } = await supabase.from('redes_consolidadores').select('red_id').eq('perfil_id', perfil.id);
  const ids = (data ?? []).map((x: { red_id: string }) => x.red_id);
  if (perfil.rol === 'consolidacion' && perfil.red_id && !ids.includes(perfil.red_id)) ids.push(perfil.red_id);
  if (ids.length === 0) return [];
  const { data: redes } = await supabase.from('redes').select('id, nombre').in('id', ids).order('nombre');
  return (redes ?? []) as Red[];
}

async function cargarRedesAdmin(perfil: Perfil): Promise<Red[]> {
  if (perfil.estado !== 'activo') return [];

  if (perfil.rol === 'apostol') {
    const { data } = await supabase.from('redes').select('id, nombre').order('nombre');
    return (data ?? []) as Red[];
  }

  const [enc, pas] = await Promise.all([
    supabase.from('redes_encargados').select('red_id').eq('perfil_id', perfil.id),
    perfil.rol === 'pastor'
      ? supabase.from('redes_pastores').select('red_id').eq('perfil_id', perfil.id)
      : Promise.resolve({ data: [] as { red_id: string }[] }),
  ]);
  const ids = [...new Set([...(enc.data ?? []), ...(pas.data ?? [])].map((x: { red_id: string }) => x.red_id))];
  if (ids.length === 0) return [];
  const { data } = await supabase.from('redes').select('id, nombre').in('id', ids).order('nombre');
  return (data ?? []) as Red[];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [redesAdmin, setRedesAdmin] = useState<Red[]>([]);
  const [redesConsolida, setRedesConsolida] = useState<Red[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);

  const cargarPerfil = useCallback(async (uid: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) {
      setPerfil(null);
      setErrorPerfil(error.message);
      return;
    }
    if (!data) {
      setPerfil(null);
      setErrorPerfil('No encontramos tu perfil. Verificá que ejecutaste los archivos SQL en Supabase.');
      return;
    }
    const p = data as Perfil;
    const [adm, cons] = await Promise.all([cargarRedesAdmin(p), cargarRedesConsolida(p)]);
    setRedesAdmin(adm);
    setRedesConsolida(cons);
    setErrorPerfil(null);
    setPerfil(p);
  }, []);

  useEffect(() => {
    let activo = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return;
      setSession(data.session);
      if (data.session) await cargarPerfil(data.session.user.id);
      if (activo) setCargando(false);
    });

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion);
      if (nuevaSesion) {
        // Supabase recomienda no llamar a la API dentro de este callback directamente
        setTimeout(() => {
          cargarPerfil(nuevaSesion.user.id);
        }, 0);
      } else {
        setPerfil(null);
        setRedesAdmin([]);
        setRedesConsolida([]);
        setErrorPerfil(null);
      }
    });

    return () => {
      activo = false;
      suscripcion.subscription.unsubscribe();
    };
  }, [cargarPerfil]);

  const refrescarPerfil = useCallback(async () => {
    if (session) await cargarPerfil(session.user.id);
  }, [session, cargarPerfil]);

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, perfil, redesAdmin, redesConsolida, cargando, errorPerfil, refrescarPerfil, cerrarSesion }),
    [session, perfil, redesAdmin, redesConsolida, cargando, errorPerfil, refrescarPerfil, cerrarSesion]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth tiene que usarse dentro de AuthProvider');
  return ctx;
}

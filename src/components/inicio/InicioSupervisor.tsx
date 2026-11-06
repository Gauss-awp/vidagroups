import React, { useCallback, useEffect, useState } from 'react';
import {RefreshControl, ScrollView, Text, View, TouchableOpacity, KeyboardAvoidingView, Platform, Pressable, Modal, TextInput, Switch} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Grupo, Perfil } from '@/lib/types';
import { Card, Pantalla, SeccionTitulo, TituloGrande, PasosConsolidacion, SelectorPilares, SelectorPosEncuentro, DespuesDelEncuentro, CLASES_POS_ENCUENTRO } from '@/components/ui';
import { formatoFecha } from '@/lib/utils';
import { EquipoLista } from '@/components/EquipoLista';
import { FormTarjeta } from '@/components/mision_joven/FormTarjeta';
import { useAuth } from '@/context/AuthContext';
import { Exportador } from '@/components/red/Exportador';
import { alerta } from '@/lib/alerta';

export function InicioSupervisor({ perfil }: { perfil: Perfil }) {
  const { redesConsolida } = useAuth();
  // Red de la que se exportan las tarjetas: la que consolida (o la suya)
  const redExport = redesConsolida[0] ?? (perfil.red_id ? { id: perfil.red_id, nombre: 'mi red' } : null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const [misGrupos, setMisGrupos] = useState<Grupo[]>([]);
  const [todosLosGrupos, setTodosLosGrupos] = useState<Grupo[]>([]);
  const [tarjetas, setTarjetas] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [verCompletadas, setVerCompletadas] = useState(false);
  const [vista, setVista] = useState<'normal' | 'sin_fono' | 'salieron'>('normal');
  const [guias, setGuias] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [seleccionada, setSeleccionada] = useState<any>(null);
  const [modal, setModal] = useState(false);

   const cargarTodo = useCallback(async () => {
    const redIds = redesConsolida.length ? redesConsolida.map((r) => r.id) : perfil.red_id ? [perfil.red_id] : [];
    let consultaGrupos = supabase.from('groups').select('*').order('nombre');
    if (redIds.length) consultaGrupos = consultaGrupos.in('red_id', redIds);
    const [{ data: tarjetasData }, { data: todosData }] = await Promise.all([
      supabase.from('tarjetas_consolidacion').select('*').order('creado_en', { ascending: false }),
      consultaGrupos,
    ]);
    // Nombres de los guías, para mostrar "Grupo de vida 04 · Catt"
    const idsGuias = [...new Set(((todosData ?? []) as Grupo[]).map((g) => g.guia_id).filter(Boolean))];
    if (idsGuias.length) {
      const { data: pg } = await supabase.from('profiles').select('id, nombre, apellido').in('id', idsGuias);
      setGuias(Object.fromEntries(((pg ?? []) as { id: string; nombre: string | null; apellido: string | null }[]).map((x) => [x.id, (x.nombre ?? '').trim()])));
    }

    setTarjetas(tarjetasData || []);
    setMisGrupos((todosData ?? []) as Grupo[]); // para consolidación misGrupos = todos
    setTodosLosGrupos((todosData ?? []) as Grupo[]);
  }, [perfil.id, perfil.red_id, redesConsolida]);
  useEffect(() => { cargarTodo(); }, [cargarTodo, refreshKey]);

  useEffect(() => {
    const channel = supabase.channel('tarjetas-panel-consolidacion')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tarjetas_consolidacion' }, () => cargarTodo())
  .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cargarTodo]);

  const asignarGV = async (tarjetaId: string, grupoId: string) => {
    const { error } = await supabase.from('tarjetas_consolidacion').update({ grupo_id: grupoId }).eq('id', tarjetaId);
    if (error) alerta('Error', error.message);
    else cargarTodo();
  };

  const cambiarEstado = async (completada: boolean) => {
    const { error } = await supabase.from('tarjetas_consolidacion')
      .update({ estado: completada ? 'completada' : 'nueva' }).eq('id', seleccionada.id);
    if (error) alerta('Error', error.message);
    else { setModal(false); cargarTodo(); }
  };

  const abrirEdicion = (t: any) => { setSeleccionada(t); setModal(true); };

  const guardarEdicion = async () => {
    const { error } = await supabase.from('tarjetas_consolidacion').update({
      nombre: seleccionada.nombre,
      telefono: seleccionada.telefono,
      zona: seleccionada.zona,
      edad: seleccionada.edad? Number(seleccionada.edad) : null,
      gv_asignado: seleccionada.gv_asignado,
      linea_lider: seleccionada.linea_lider || null,
      fonovisita: seleccionada.fonovisita,
      visita: seleccionada.visita,
      pilares: seleccionada.pilares,
      pilar_1: !!seleccionada.pilar_1,
      pilar_2: !!seleccionada.pilar_2,
      pilar_3: !!seleccionada.pilar_3,
      pilar_4: !!seleccionada.pilar_4,
      pilar_5: !!seleccionada.pilar_5,
      comenzo_gv: seleccionada.comenzo_gv,
      encuentro: seleccionada.encuentro,
      pos_encuentro: seleccionada.pos_encuentro ?? [],
      reencuentro: !!seleccionada.reencuentro,
      observacion: seleccionada.observacion,
    }).eq('id', seleccionada.id);
    if(error) alerta("Error", error.message);
    else { setModal(false); cargarTodo(); }
  };

  const borrar = () => {
    alerta("¿Borrar?", `¿Borrar a ${seleccionada.nombre}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        await supabase.from('tarjetas_consolidacion').delete().eq('id', seleccionada.id);
        setModal(false); cargarTodo();
      }}
    ]);
  };

  // ---------------- Organización del panel ----------------
  const texto = busqueda.trim().toLowerCase();
  const coincide = (x: any) => !texto || `${x.nombre ?? ''} ${x.telefono ?? ''} ${x.zona ?? ''}`.toLowerCase().includes(texto);
  const hace3dias = Date.now() - 3 * 86400000;
  const activas = tarjetas.filter((x) => x.estado !== 'completada' && coincide(x));
  const completadas = tarjetas.filter((x) => x.estado === 'completada' && coincide(x));
  const sinAsignar = activas.filter((x) => !x.grupo_id && !x.gv_asignado);
  const sinFono = activas.filter((x) => !x.fonovisita && new Date(x.creado_en).getTime() < hace3dias);
  const salieron = sinAsignar.filter((x) => /Salió del/i.test(x.observacion ?? ''));
  const deGrupo = (x: any) => x.grupo_id ?? todosLosGrupos.find((g) => g.nombre === x.gv_asignado)?.id ?? 'otro';
  const porGrupo = todosLosGrupos
    .map((g) => {
      const lista = activas.filter((x) => (x.grupo_id || x.gv_asignado) && deGrupo(x) === g.id);
      return { grupo: g, lista, sinFono: lista.filter((x) => !x.fonovisita).length };
    })
    .filter((x) => x.lista.length > 0)
    .sort((a, b) => b.sinFono - a.sinFono || b.lista.length - a.lista.length || a.grupo.nombre.localeCompare(b.grupo.nombre));
  const otros = activas.filter((x) => (x.grupo_id || x.gv_asignado) && deGrupo(x) === 'otro');

  // Para derivar: primero los grupos de su misma zona
  const gruposPara = (x: any) =>
    todosLosGrupos
      .filter((g) => !x.red_id || !(g as any).red_id || (g as any).red_id === x.red_id)
      .sort((a, b) => {
        const z = (x.zona ?? '').toLowerCase().trim();
        const enZona = (g: any) => (z && `${g.barrio ?? ''}`.toLowerCase().includes(z) ? 0 : 1);
        return enZona(a) - enZona(b) || a.nombre.localeCompare(b.nombre);
      });

  const Badge = ({ activo, texto }: { activo: boolean, texto: string }) => (
    <View style={{ backgroundColor: activo? colors.successBg : colors.cardAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 6, marginTop: 4 }}>
      <Text style={{ fontSize: 11, color: activo? colors.success : colors.textTer, fontWeight: '700' }}>{activo? '✅' : '⏳'} {texto}</Text>
    </View>
  );

  /** Tarjeta completa, con los botones para derivar a un grupo */
  const TarjetaGrande = ({ t }: { t: any }) => (
    <Pressable onPress={() => abrirEdicion(t)}>
      <Card style={{ borderLeftWidth: 4, borderLeftColor: t.encuentro ? colors.success : t.visita ? colors.warning : colors.border }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
          {t.nombre} {t.edad ? `- ${t.edad} años` : ''}
        </Text>
        <Text style={{ color: colors.textSec, fontSize: 12, marginTop: 2 }}>
          {[t.linea_lider ? `Línea: ${t.linea_lider}` : null, t.zona, t.telefono, `GV: ${t.gv_asignado || 'Sin asignar'}`].filter(Boolean).join(' · ')}
        </Text>
        <PasosConsolidacion tarjeta={t} />
        {t.observacion ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, backgroundColor: colors.warningBg, padding: 8, borderRadius: 8 }}>
            <Ionicons name="document-text-outline" size={14} color={colors.warning} />
            <Text style={{ fontSize: 12, color: colors.warning, flex: 1 }}>{t.observacion}</Text>
          </View>
        ) : null}
        {!t.grupo_id && !t.gv_asignado && todosLosGrupos.length > 0 ? (
          <>
            <Text style={{ fontSize: 12, color: colors.textSec, marginTop: 12, marginBottom: 6 }}>Derivar a:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {gruposPara(t).map((g) => (
                <TouchableOpacity
                  key={g.id}
                  onPress={() => asignarGV(t.id, g.id)}
                  style={{ backgroundColor: colors.success, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginRight: 6 }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>→ {g.nombre}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}
        <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 8 }}>Tocá para editar</Text>
      </Card>
    </Pressable>
  );

  /** Fila corta: nombre y los 5 pasos en puntitos */
  const FilaCompacta = ({ t }: { t: any }) => {
    const n = [t.pilar_1, t.pilar_2, t.pilar_3, t.pilar_4, t.pilar_5].filter(Boolean).length || (t.pilares ? 5 : 0);
    const pasos = [
      { l: 'F', ok: !!t.fonovisita },
      { l: 'V', ok: !!t.visita },
      { l: n > 0 && n < 5 ? String(n) : 'P', ok: n === 5, parcial: n > 0 && n < 5 },
      { l: 'G', ok: !!t.comenzo_gv },
      { l: 'E', ok: !!t.encuentro },
      (() => {
        const np = (t.pos_encuentro ?? []).length;
        return { l: np > 0 && np < CLASES_POS_ENCUENTRO ? String(np) : 'PE', ok: np >= CLASES_POS_ENCUENTRO, parcial: np > 0 && np < CLASES_POS_ENCUENTRO };
      })(),
      { l: 'RE', ok: !!t.reencuentro },
    ];
    return (
      <Pressable onPress={() => abrirEdicion(t)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{t.nombre}</Text>
          {t.telefono || t.zona ? <Text style={{ color: colors.textTer, fontSize: 12 }}>{[t.zona, t.telefono].filter(Boolean).join(' · ')}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {pasos.map((p, i) => (
            <View
              key={i}
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: p.ok ? colors.success : 'transparent',
                borderWidth: 1.5,
                borderColor: p.ok || (p as any).parcial ? colors.success : colors.border,
              }}
            >
              <Text style={{ fontSize: p.l.length > 1 ? 8 : 10, fontWeight: '800', color: p.ok ? '#FFFFFF' : (p as any).parcial ? colors.success : colors.textTer }}>{p.l}</Text>
            </View>
          ))}
        </View>
      </Pressable>
    );
  };

  return (
    <Pantalla>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios'? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 400 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefreshKey(k=>k+1); }} tintColor={colors.textSec} />}>

          <TituloGrande titulo="Panel de Consolidación" subtitulo={`Admin: ${perfil.nombre || perfil.email}`} />

          <TouchableOpacity onPress={() => setShowForm(!showForm)}
            style={{ backgroundColor: colors.primary, padding: 13, borderRadius: 12, marginVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <Ionicons name={showForm? "close" : "add"} size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800' }}>{showForm? 'Cerrar' : 'Registrar persona nueva'}</Text>
          </TouchableOpacity>

          {redExport ? <Exportador redId={redExport.id} redNombre={redExport.nombre} soloTarjetas /> : null}

          {showForm && (
            <View style={{ marginBottom: 16 }}>
              {/* FIX: Ahora le pasamos TODOS los grupos para que aparezca el 04.1 */}
              <FormTarjeta grupos={todosLosGrupos} onCreada={() => { setShowForm(false); cargarTodo(); }} onClose={() => setShowForm(false)} />
            </View>
          )}

          {/* Buscador */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, marginTop: 12, borderWidth: 0.5, borderColor: colors.border }}>
            <Ionicons name="search" size={18} color={colors.textTer} />
            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar por nombre, teléfono o zona"
              placeholderTextColor={colors.textTer}
              style={{ flex: 1, padding: 12, color: colors.text }}
            />
            {busqueda ? (
              <Pressable onPress={() => setBusqueda('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textTer} />
              </Pressable>
            ) : null}
          </View>

          {/* Para hacer */}
          {!texto && (sinAsignar.length || sinFono.length || salieron.length) ? (
            <Card style={{ marginTop: 12, backgroundColor: colors.primaryBg }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>Para hacer</Text>
              {sinAsignar.length ? (
                <Text style={{ color: colors.text, fontSize: 14, marginBottom: 4 }}>
                  <Ionicons name="person-add-outline" size={14} color={colors.primary} /> {sinAsignar.length} sin asignar a un grupo
                </Text>
              ) : null}
              {sinFono.length ? (
                <Pressable onPress={() => setVista(vista === 'sin_fono' ? 'normal' : 'sin_fono')}>
                  <Text style={{ color: colors.warning, fontSize: 14, fontWeight: '700', marginBottom: 4 }}>
                    <Ionicons name="call-outline" size={14} color={colors.warning} /> {sinFono.length} sin fonovisita hace más de 3 días ›
                  </Text>
                </Pressable>
              ) : null}
              {salieron.length ? (
                <Pressable onPress={() => setVista(vista === 'salieron' ? 'normal' : 'salieron')}>
                  <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>
                    <Ionicons name="exit-outline" size={14} color={colors.danger} /> {salieron.length} {salieron.length === 1 ? 'salió de su grupo' : 'salieron de su grupo'} ›
                  </Text>
                </Pressable>
              ) : null}
            </Card>
          ) : null}

          {vista !== 'normal' ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <SeccionTitulo titulo={vista === 'sin_fono' ? 'Sin fonovisita' : 'Salieron de su grupo'} />
                <Pressable onPress={() => setVista('normal')} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Ver todo</Text>
                </Pressable>
              </View>
              {(vista === 'sin_fono' ? sinFono : salieron).map((x) => (
                <TarjetaGrande key={x.id} t={x} />
              ))}
            </>
          ) : (
            <>
              {/* Sin asignar: la bandeja de entrada */}
              <SeccionTitulo titulo={`Sin asignar (${sinAsignar.length})`} />
              {sinAsignar.length === 0 ? (
                <Card>
                  <Text style={{ color: colors.textSec }}>{texto ? 'Nadie coincide con la búsqueda.' : 'Todas las personas nuevas tienen grupo.'}</Text>
                </Card>
              ) : (
                sinAsignar.map((x) => <TarjetaGrande key={x.id} t={x} />)
              )}

              {/* Por grupo */}
              <SeccionTitulo titulo="Por grupo" />
              {porGrupo.length ? (
                <Text style={{ color: colors.textTer, fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                  Tocá un grupo para ver sus nuevos · F fono · V visita · P pilares · G va al GV · E encuentro · PE pos-encuentro · RE reencuentro
                </Text>
              ) : null}
              {porGrupo.length === 0 && otros.length === 0 ? (
                <Card>
                  <Text style={{ color: colors.textSec }}>Todavía no hay personas derivadas a grupos.</Text>
                </Card>
              ) : null}
              {porGrupo.map(({ grupo, lista, sinFono: nSinFono }) => {
                const abierto = !!texto || !!abiertos[grupo.id];
                return (
                  <Card key={grupo.id}>
                    <Pressable onPress={() => setAbiertos({ ...abiertos, [grupo.id]: !abiertos[grupo.id] })} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{grupo.nombre}</Text>
                        <Text style={{ color: colors.textSec, fontSize: 13, marginTop: 2 }}>
                          {guias[grupo.guia_id] ? `${guias[grupo.guia_id]} · ` : ''}
                          {lista.length} {lista.length === 1 ? 'nuevo' : 'nuevos'}
                          {nSinFono ? <Text style={{ color: colors.warning, fontWeight: '700' }}> · {nSinFono} sin fonovisita</Text> : null}
                        </Text>
                      </View>
                      <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSec} />
                    </Pressable>
                    {abierto ? lista.map((x) => <FilaCompacta key={x.id} t={x} />) : null}
                  </Card>
                );
              })}
              {otros.length ? (
                <Card>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Otros grupos</Text>
                  <Text style={{ color: colors.textSec, fontSize: 13, marginTop: 2 }}>Asignados a un grupo que no está en la lista</Text>
                  {otros.map((x) => (
                    <FilaCompacta key={x.id} t={x} />
                  ))}
                </Card>
              ) : null}

              {/* Completadas */}
              <Pressable onPress={() => setVerCompletadas(!verCompletadas)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
                <Ionicons name={verCompletadas || texto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSec} />
                <Text style={{ color: colors.textSec, fontWeight: '700', marginLeft: 6 }}>Completadas ({completadas.length})</Text>
              </Pressable>
              {verCompletadas || texto ? (
                <Card>
                  {completadas.length === 0 ? <Text style={{ color: colors.textSec }}>Todavía no hay consolidaciones completadas.</Text> : null}
                  {completadas.map((x) => (
                    <FilaCompacta key={x.id} t={x} />
                  ))}
                </Card>
              ) : null}
            </>
          )}
          <View style={{ height: 24 }} />
          <EquipoLista liderId={perfil.id} refreshKey={refreshKey} textoVacio="Todavía no tenés guías a cargo" />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={modal} animationType="slide" transparent>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:colors.card, borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, maxHeight: '90%'}}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={{ color: colors.text, fontWeight:'800', fontSize:18, marginBottom:12}}>Editar tarjeta</Text>
              <TextInput value={seleccionada?.nombre} onChangeText={v=>setSeleccionada({...seleccionada, nombre:v})} placeholder="Nombre" placeholderTextColor={colors.textTer} style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:10, color: colors.text}} />
              <TextInput value={seleccionada?.telefono} onChangeText={v=>setSeleccionada({...seleccionada, telefono:v})} placeholder="Tel" placeholderTextColor={colors.textTer} style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:10, color: colors.text}} />
              <TextInput value={seleccionada?.zona} onChangeText={v=>setSeleccionada({...seleccionada, zona:v})} placeholder="Zona" placeholderTextColor={colors.textTer} style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:10, color: colors.text}} />
              <TextInput value={seleccionada?.linea_lider ?? ''} onChangeText={v=>setSeleccionada({...seleccionada, linea_lider:v})} placeholder="Línea - Líder (ej: MICA Y SANTI)" placeholderTextColor={colors.textTer} style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:10, color: colors.text}} />
              <Text style={{ color: colors.textSec, fontSize: 13, marginBottom: 6 }}>Grupo de vida</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }} keyboardShouldPersistTaps="handled">
                <Pressable
                  onPress={() => setSeleccionada({ ...seleccionada, gv_asignado: null })}
                  style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginRight: 6, backgroundColor: !seleccionada?.gv_asignado ? colors.primary : colors.cardAlt }}
                >
                  <Text style={{ color: !seleccionada?.gv_asignado ? '#FFFFFF' : colors.text, fontWeight: '600' }}>Sin asignar</Text>
                </Pressable>
                {todosLosGrupos
                  .filter((g) => !seleccionada?.red_id || !(g as any).red_id || (g as any).red_id === seleccionada.red_id)
                  .map((g) => {
                    const activo = seleccionada?.gv_asignado === g.nombre;
                    return (
                      <Pressable
                        key={g.id}
                        onPress={() => setSeleccionada({ ...seleccionada, gv_asignado: g.nombre })}
                        style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginRight: 6, backgroundColor: activo ? colors.primary : colors.cardAlt }}
                      >
                        <Text style={{ color: activo ? '#FFFFFF' : colors.text, fontWeight: '600' }}>{g.nombre}</Text>
                      </Pressable>
                    );
                  })}
              </ScrollView>
              <TextInput value={seleccionada?.observacion} onChangeText={v=>setSeleccionada({...seleccionada, observacion:v})} placeholder="Observación" placeholderTextColor={colors.textTer} style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:15, color: colors.text}} />

              {[
                {k:'fonovisita', l:'Fonovisita'},
                {k:'visita', l:'Visita'},
                {k:'pilares', l:'Pilares'},
                {k:'comenzo_gv', l:'Comenzó GV'},
                {k:'encuentro', l:'Encuentro'},
              ].map(item => item.k === 'pilares' ? (
                <View key="pilares" style={{ borderBottomWidth:1, borderBottomColor:colors.cardAlt }}>
                  <SelectorPilares tarjeta={seleccionada ?? {}} onCambio={(c) => setSeleccionada({ ...seleccionada, ...c })} />
                </View>
              ) : (
                <View key={item.k} style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10, borderBottomWidth:1, borderBottomColor:colors.cardAlt}}>
                  <Text style={{ color: colors.text, fontWeight:'600'}}>{item.l}</Text>
                  <Switch value={!!seleccionada?.[item.k]} onValueChange={v=>setSeleccionada({...seleccionada, [item.k]:v})} />
                </View>
              ))}

              {seleccionada?.encuentro ? (
                <View style={{ borderBottomWidth: 1, borderBottomColor: colors.cardAlt }}>
                  {seleccionada?.encuentro_en ? (
                    <Text style={{ color: colors.textSec, fontSize: 12, marginTop: 10 }}>
                      Encuentro el {formatoFecha(seleccionada.encuentro_en)} · el Reencuentro suele ser desde el{' '}
                      {formatoFecha(`${Number(seleccionada.encuentro_en.slice(0, 4)) + 1}${seleccionada.encuentro_en.slice(4, 10)}`)}
                    </Text>
                  ) : null}
                  <SelectorPosEncuentro hechas={seleccionada?.pos_encuentro ?? []} onCambio={(h) => setSeleccionada({ ...seleccionada, pos_encuentro: h })} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>Reencuentro</Text>
                    <Switch value={!!seleccionada?.reencuentro} onValueChange={(v) => setSeleccionada({ ...seleccionada, reencuentro: v })} />
                  </View>
                </View>
              ) : null}

              {seleccionada?.estado === 'completada' ? (
                <Pressable onPress={() => cambiarEstado(false)} style={{backgroundColor: colors.warningBg, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 20}}>
                  <Text style={{color: colors.warning, fontWeight: '800'}}>Reabrir seguimiento</Text>
                </Pressable>
              ) : seleccionada?.encuentro && seleccionada?.comenzo_gv ? (
                <Pressable onPress={() => cambiarEstado(true)} style={{backgroundColor: colors.success, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 20}}>
                  <Text style={{color: 'white', fontWeight: '800'}}>Marcar como completada</Text>
                </Pressable>
              ) : (
                <Text style={{marginTop: 16, color: colors.textSec, fontSize: 12, textAlign: 'center'}}>Para completar la consolidación tiene que haber hecho el Encuentro y estar yendo al GV.</Text>
              )}

              <Pressable onPress={guardarEdicion} style={{backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12}}>
                <Text style={{color: 'white', fontWeight: '800'}}>Guardar Cambios</Text>
              </Pressable>
              <Pressable onPress={()=>setModal(false)} style={{marginTop:12, alignItems:'center', padding:10}}><Text style={{color:'gray', fontWeight:'600'}}>Cancelar</Text></Pressable>
              <Pressable onPress={borrar} style={{marginTop:10, alignItems:'center', padding:10}}><Text style={{color: colors.danger, fontWeight:'700'}}>Borrar tarjeta</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Pantalla>
  );
}
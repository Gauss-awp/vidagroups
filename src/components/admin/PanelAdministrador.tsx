import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors, ROL_COLOR } from '@/lib/theme';
import type { Perfil, Rol } from '@/lib/types';
import { ROL_LABEL, ROL_RANGO, formatoFecha } from '@/lib/utils';
import { Boton, Card, Cargando, Chip, HojaModal, Pantalla, SeccionTitulo, TituloGrande, s } from '@/components/ui';
import { EquipoDesdePlanilla } from '@/components/red/EquipoDesdePlanilla';

// ---------- Tipos de lo que devuelven las funciones del Administrador ----------
interface ResumenAdmin {
  cuentas: number;
  pendientes: number;
  inactivas: number;
  activos_7_dias: number;
  nunca_entraron: number;
  por_rol: Record<string, number>;
  versiones: Record<string, number>;
  grupos: number;
  grupos_con_reunion_semana: number;
  grupos_sin_reunion_14: number;
  semanas: { semana: string; grupos: number }[];
  preaprobaciones_pendientes: number;
  registros: { miembros: number; reuniones: number; asistencias: number; tarjetas: number };
  base_bytes: number;
  tablas_sin_seguridad: number;
}
interface Cuenta {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
  rol: Rol;
  estado: 'pendiente' | 'activo' | 'inactivo';
  red_id: string | null;
  red: string | null;
  supervisor_id: string | null;
  supervisor: string | null;
  creado_en: string;
  ultimo_acceso: string | null;
  app_version: string | null;
  grupos_que_guia: number;
  responsabilidades: string[];
}
interface GrupoAdmin {
  id: string;
  nombre: string;
  red_id: string;
  red: string;
  guia_id: string;
  guia: string | null;
  supervisor: string | null;
  segundos: string[];
  miembros: number;
  ultima_reunion: string | null;
  reuniones_4_semanas: number;
}
interface Responsable {
  red_id: string;
  red: string;
  tipo: 'pastor' | 'encargado' | 'consolidador';
  perfil_id: string;
  nombre: string;
}
interface CambioRol {
  fecha: string;
  persona: string;
  rol_antes: string | null;
  rol_despues: string | null;
  estado_antes: string | null;
  estado_despues: string | null;
  quien: string | null;
}
interface Red {
  id: string;
  nombre: string;
}

type Seccion = 'salud' | 'cuentas' | 'grupos' | 'responsables' | 'equipo' | 'cambios';

const nombreDe = (c: { nombre: string | null; apellido?: string | null; email: string }) =>
  `${c.nombre ?? ''} ${c.apellido ?? ''}`.trim() || c.email;

function haceCuanto(iso: string | null): string {
  if (!iso) return 'nunca entró';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `el ${formatoFecha(iso.slice(0, 10))}`;
}

const ROLES: Rol[] = ['guia', 'guia_supervisor', 'consolidacion', 'pastor', 'apostol', 'administrador'];
const TIPOS_RESP: { tipo: Responsable['tipo']; texto: string }[] = [
  { tipo: 'pastor', texto: 'Pastores' },
  { tipo: 'encargado', texto: 'Encargados' },
  { tipo: 'consolidador', texto: 'Consolidadores' },
];

/**
 * Panel del Administrador: cuentas, estructura y salud del sistema.
 * No muestra miembros, asistencia por persona, consolidación, notas, ofrendas ni pagos.
 */
export function PanelAdministrador({ perfil }: { perfil: Perfil }) {
  const [seccion, setSeccion] = useState<Seccion>('salud');
  const [resumen, setResumen] = useState<ResumenAdmin | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [grupos, setGrupos] = useState<GrupoAdmin[]>([]);
  const [responsables, setResponsables] = useState<Responsable[]>([]);
  const [cambios, setCambios] = useState<CambioRol[]>([]);
  const [redes, setRedes] = useState<Red[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [r, c, g, rs, cb, rd] = await Promise.all([
      supabase.rpc('admin_resumen'),
      supabase.rpc('admin_cuentas'),
      supabase.rpc('admin_grupos'),
      supabase.rpc('admin_responsables'),
      supabase.rpc('admin_cambios_roles'),
      supabase.from('redes').select('id, nombre').order('nombre'),
    ]);
    if (r.error) {
      setError(r.error.message);
    } else {
      setError(null);
      setResumen(r.data as ResumenAdmin);
    }
    setCuentas((c.data ?? []) as Cuenta[]);
    setGrupos((g.data ?? []) as GrupoAdmin[]);
    setResponsables((rs.data ?? []) as Responsable[]);
    setCambios((cb.data ?? []) as CambioRol[]);
    setRedes((rd.data ?? []) as Red[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const refrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  };

  if (cargando) return <Cargando texto="Preparando la administración..." />;

  const pestañas: { id: Seccion; texto: string; aviso?: number }[] = [
    { id: 'salud', texto: 'Salud' },
    { id: 'cuentas', texto: 'Cuentas', aviso: resumen?.pendientes },
    { id: 'grupos', texto: 'Grupos' },
    { id: 'responsables', texto: 'Responsables' },
    { id: 'equipo', texto: 'Equipo' },
    { id: 'cambios', texto: 'Cambios' },
  ];

  return (
    <Pantalla>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.textSec} />}
        keyboardShouldPersistTaps="handled"
      >
        <TituloGrande titulo="Administración" subtitulo={`Hola, ${perfil.nombre || 'Administrador'}`} />

        <Card style={{ backgroundColor: colors.cardAlt }}>
          <View style={s.fila}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.textSec} style={{ marginRight: 8 }} />
            <Text style={{ color: colors.textSec, fontSize: 13, flex: 1, lineHeight: 18 }}>
              Administrás cuentas, estructura y el funcionamiento de la app. Por privacidad, desde acá no se ven miembros, asistencia por persona,
              consolidación, notas pastorales, ofrendas ni pagos.
            </Text>
          </View>
        </Card>

        {error ? (
          <Card style={{ backgroundColor: colors.dangerBg }}>
            <Text style={{ color: colors.danger }}>{error}</Text>
          </Card>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {pestañas.map((p) => (
            <Chip
              key={p.id}
              texto={p.aviso ? `${p.texto} (${p.aviso})` : p.texto}
              activo={seccion === p.id}
              onPress={() => setSeccion(p.id)}
            />
          ))}
        </ScrollView>

        {seccion === 'salud' && resumen ? <Salud r={resumen} /> : null}
        {seccion === 'cuentas' ? <Cuentas cuentas={cuentas} redes={redes} yo={perfil.id} onCambio={cargar} /> : null}
        {seccion === 'grupos' ? <Grupos grupos={grupos} cuentas={cuentas} onCambio={cargar} /> : null}
        {seccion === 'responsables' ? <Responsables redes={redes} lista={responsables} cuentas={cuentas} onCambio={cargar} /> : null}
        {seccion === 'equipo' ? <Equipo redes={redes} onCambio={cargar} /> : null}
        {seccion === 'cambios' ? <Cambios cambios={cambios} /> : null}
      </ScrollView>
    </Pantalla>
  );
}

// =====================================================================
// Salud del sistema
// =====================================================================
function Salud({ r }: { r: ResumenAdmin }) {
  const mb = r.base_bytes / (1024 * 1024);
  const pctBase = Math.min(100, Math.round((mb / 500) * 100));
  const dato = (icono: React.ComponentProps<typeof Ionicons>['name'], valor: string, texto: string, color: string = colors.primary) => (
    <View style={{ width: '48%', backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: colors.border, marginBottom: 10 }}>
      <Ionicons name={icono} size={20} color={color} />
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 6 }}>{valor}</Text>
      <Text style={s.textoFilaSec}>{texto}</Text>
    </View>
  );
  const maxSemana = Math.max(1, ...r.semanas.map((x) => x.grupos), r.grupos);

  return (
    <>
      {r.tablas_sin_seguridad > 0 ? (
        <Card style={{ backgroundColor: colors.dangerBg }}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>
            Atención: {r.tablas_sin_seguridad} tablas sin seguridad por filas. Revisalo con el documento de comandos (sección Mantenimiento).
          </Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {dato('people', `${r.activos_7_dias} / ${r.cuentas}`, 'entraron en los últimos 7 días')}
        {dato('time-outline', String(r.pendientes), 'cuentas esperando aprobación', r.pendientes ? colors.warning : colors.success)}
        {dato('calendar', `${r.grupos_con_reunion_semana} / ${r.grupos}`, 'grupos cargaron reunión esta semana', colors.success)}
        {dato('pause-circle', String(r.grupos_sin_reunion_14), 'grupos sin reunión hace 14 días', r.grupos_sin_reunion_14 ? colors.warning : colors.success)}
        {dato('person-remove-outline', String(r.nunca_entraron), 'cuentas activas que nunca entraron', colors.textSec)}
        {dato('mail-unread-outline', String(r.preaprobaciones_pendientes), 'del equipo todavía sin registrarse', colors.teal)}
      </View>

      <SeccionTitulo titulo="Uso semanal" />
      <Card>
        <Text style={[s.textoFilaSec, { marginBottom: 10 }]}>Grupos que cargaron reunión cada semana (de {r.grupos}).</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 6 }}>
          {r.semanas.map((x) => (
            <View key={x.semana} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: colors.textSec, fontSize: 10, marginBottom: 2 }}>{x.grupos}</Text>
              <View style={{ width: '100%', height: Math.max(4, (x.grupos / maxSemana) * 60), backgroundColor: colors.primary, borderRadius: 4 }} />
              <Text style={{ color: colors.textSec, fontSize: 9, marginTop: 4 }}>{formatoFecha(x.semana).slice(0, 5)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <SeccionTitulo titulo="Base de datos" />
      <Card>
        <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 6 }]}>
          <Text style={s.textoFila}>{mb.toFixed(1)} MB de 500 MB</Text>
          <Text style={{ color: pctBase > 80 ? colors.danger : colors.textSec }}>{pctBase}%</Text>
        </View>
        <View style={{ height: 8, backgroundColor: colors.cardAlt, borderRadius: 4, overflow: 'hidden' }}>
          <View style={{ width: `${pctBase}%`, height: '100%', backgroundColor: pctBase > 80 ? colors.danger : colors.success }} />
        </View>
        <Text style={[s.textoFilaSec, { marginTop: 10 }]}>
          {r.registros.miembros} miembros · {r.registros.reuniones} reuniones · {r.registros.asistencias} asistencias · {r.registros.tarjetas} tarjetas
        </Text>
      </Card>

      <SeccionTitulo titulo="Versiones de la app" />
      <Card>
        {Object.entries(r.versiones).length === 0 ? (
          <Text style={s.textoFilaSec}>Todavía no hay datos.</Text>
        ) : (
          Object.entries(r.versiones)
            .sort((a, b) => b[1] - a[1])
            .map(([v, n]) => (
              <View key={v} style={[s.fila, { justifyContent: 'space-between', paddingVertical: 4 }]}>
                <Text style={{ color: colors.text, flex: 1 }}>{v}</Text>
                <Text style={{ color: colors.textSec }}>{n}</Text>
              </View>
            ))
        )}
        <Text style={[s.textoFilaSec, { marginTop: 8 }]}>Sirve para saber quién todavía no instaló el APK nuevo.</Text>
      </Card>

      <SeccionTitulo titulo="Cuentas activas por rol" />
      <Card>
        {Object.entries(r.por_rol).map(([rol, n]) => (
          <View key={rol} style={[s.fila, { justifyContent: 'space-between', paddingVertical: 4 }]}>
            <Text style={{ color: colors.text }}>{ROL_LABEL[rol as Rol] ?? rol}</Text>
            <Text style={{ color: colors.textSec }}>{n}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

// =====================================================================
// Cuentas
// =====================================================================
function Cuentas({ cuentas, redes, yo, onCambio }: { cuentas: Cuenta[]; redes: Red[]; yo: string; onCambio: () => void }) {
  const [filtro, setFiltro] = useState<'pendiente' | 'activo' | 'inactivo' | 'todas'>(cuentas.some((c) => c.estado === 'pendiente') ? 'pendiente' : 'activo');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Cuenta | null>(null);
  const [form, setForm] = useState<{ rol: Rol; estado: Cuenta['estado']; red_id: string | null; supervisor_id: string | null }>({
    rol: 'guia',
    estado: 'activo',
    red_id: null,
    supervisor_id: null,
  });
  const [guardando, setGuardando] = useState(false);

  const lista = cuentas
    .filter((c) => filtro === 'todas' || c.estado === filtro)
    .filter((c) => !busqueda.trim() || `${nombreDe(c)} ${c.email}`.toLowerCase().includes(busqueda.trim().toLowerCase()));

  const abrir = (c: Cuenta) => {
    setEditando(c);
    setForm({ rol: c.rol, estado: c.estado === 'pendiente' ? 'activo' : c.estado, red_id: c.red_id, supervisor_id: c.supervisor_id });
  };

  // Superiores posibles: cuentas activas con un rol mayor (y de la misma red si es Guía Supervisor)
  const superiores = useMemo(() => {
    if (!editando || form.rol === 'apostol' || form.rol === 'administrador') return [];
    return cuentas.filter(
      (c) =>
        c.id !== editando.id &&
        c.estado === 'activo' &&
        c.rol !== 'administrador' &&
        ROL_RANGO[c.rol] > ROL_RANGO[form.rol] &&
        (c.rol !== 'guia_supervisor' || c.red_id === form.red_id)
    );
  }, [cuentas, editando, form.rol, form.red_id]);

  const guardar = async () => {
    if (!editando) return;
    setGuardando(true);
    const supervisor = superiores.some((x) => x.id === form.supervisor_id) ? form.supervisor_id : null;
    const { error } = await supabase.rpc('admin_actualizar_cuenta', {
      p_id: editando.id,
      p_rol: form.rol,
      p_estado: form.estado,
      p_red: form.rol === 'apostol' || form.rol === 'administrador' ? null : form.red_id,
      p_supervisor: supervisor,
    });
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    setEditando(null);
    onCambio();
  };

  const eliminar = () => {
    if (!editando) return;
    Alert.alert('Eliminar cuenta', `¿Eliminar la cuenta de ${nombreDe(editando)}? No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('admin_eliminar_cuenta', { p_id: editando.id });
          if (error) Alert.alert('No se pudo eliminar', error.message);
          else {
            setEditando(null);
            onCambio();
          }
        },
      },
    ]);
  };

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        {(['pendiente', 'activo', 'inactivo', 'todas'] as const).map((f) => (
          <Chip
            key={f}
            texto={
              f === 'pendiente'
                ? `Pendientes (${cuentas.filter((c) => c.estado === 'pendiente').length})`
                : f === 'activo'
                  ? 'Activas'
                  : f === 'inactivo'
                    ? 'Inactivas'
                    : 'Todas'
            }
            activo={filtro === f}
            onPress={() => setFiltro(f)}
          />
        ))}
      </View>
      <TextInput
        placeholder="Buscar por nombre o correo"
        placeholderTextColor={colors.textTer}
        value={busqueda}
        onChangeText={setBusqueda}
        autoCapitalize="none"
        style={{ backgroundColor: colors.card, borderRadius: 12, padding: 12, color: colors.text, marginBottom: 10, borderWidth: 0.5, borderColor: colors.border }}
      />
      {lista.length === 0 ? (
        <Card>
          <Text style={s.textoFilaSec}>No hay cuentas en esta lista.</Text>
        </Card>
      ) : (
        lista.map((c) => (
          <Card key={c.id} onPress={c.id === yo ? undefined : () => abrir(c)}>
            <View style={s.fila}>
              <View style={{ flex: 1 }}>
                <Text style={s.textoFila}>{nombreDe(c)}</Text>
                <Text style={s.textoFilaSec}>{c.email}</Text>
                <Text style={{ color: ROL_COLOR[c.rol] ?? colors.textSec, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                  {ROL_LABEL[c.rol] ?? c.rol}
                  {c.red ? ` · ${c.red}` : ''}
                  {c.responsabilidades.length ? ` · ${c.responsabilidades.join(', ')}` : ''}
                </Text>
                <Text style={[s.textoFilaSec, { fontSize: 12 }]}>
                  {c.estado === 'pendiente' ? 'Esperando aprobación' : `Entró ${haceCuanto(c.ultimo_acceso)}`}
                  {c.app_version ? ` · ${c.app_version}` : ''}
                  {c.supervisor ? ` · sup: ${c.supervisor}` : ''}
                </Text>
              </View>
              {c.id === yo ? <Text style={s.textoFilaSec}>vos</Text> : <Ionicons name="chevron-forward" size={18} color={colors.textTer} />}
            </View>
          </Card>
        ))
      )}

      <HojaModal visible={!!editando} onClose={() => setEditando(null)} titulo={editando ? nombreDe(editando) : ''}>
        {editando ? (
          <>
            <Text style={[s.textoFilaSec, { marginBottom: 12 }]}>
              {editando.email} · registrada el {formatoFecha(editando.creado_en.slice(0, 10))}
              {editando.grupos_que_guia ? ` · guía de ${editando.grupos_que_guia} ${editando.grupos_que_guia === 1 ? 'grupo' : 'grupos'}` : ''}
            </Text>

            <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>Estado</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              <Chip texto="Activa" activo={form.estado === 'activo'} onPress={() => setForm({ ...form, estado: 'activo' })} />
              <Chip texto="Inactiva" activo={form.estado === 'inactivo'} onPress={() => setForm({ ...form, estado: 'inactivo' })} />
            </View>

            <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>Rol</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              {ROLES.map((r) => (
                <Chip key={r} texto={ROL_LABEL[r]} activo={form.rol === r} onPress={() => setForm({ ...form, rol: r })} />
              ))}
            </View>

            {form.rol !== 'apostol' && form.rol !== 'administrador' ? (
              <>
                <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>Red</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {redes.map((r) => (
                    <Chip key={r.id} texto={r.nombre} activo={form.red_id === r.id} onPress={() => setForm({ ...form, red_id: r.id })} />
                  ))}
                </View>

                <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>Supervisor</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <Chip texto="Sin supervisor" activo={!form.supervisor_id} onPress={() => setForm({ ...form, supervisor_id: null })} />
                  {superiores.map((x) => (
                    <Chip key={x.id} texto={`${nombreDe(x)} (${ROL_LABEL[x.rol]})`} activo={form.supervisor_id === x.id} onPress={() => setForm({ ...form, supervisor_id: x.id })} />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Boton titulo={editando.estado === 'pendiente' ? 'Aprobar y guardar' : 'Guardar'} icono="checkmark" onPress={guardar} cargando={guardando} />
            <Boton titulo="Eliminar cuenta" variante="peligro" icono="trash-outline" onPress={eliminar} style={{ marginTop: 10 }} />
          </>
        ) : null}
      </HojaModal>
    </>
  );
}

// =====================================================================
// Grupos (estructura y uso)
// =====================================================================
function Grupos({ grupos, cuentas, onCambio }: { grupos: GrupoAdmin[]; cuentas: Cuenta[]; onCambio: () => void }) {
  const [editando, setEditando] = useState<GrupoAdmin | null>(null);
  const hace14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

  const cambiarGuia = async (perfilId: string) => {
    if (!editando) return;
    const { error } = await supabase.rpc('admin_cambiar_guia', { p_grupo: editando.id, p_perfil: perfilId });
    if (error) Alert.alert('No se pudo cambiar', error.message);
    else {
      setEditando(null);
      onCambio();
    }
  };

  const segundo = async (perfilId: string, agregar: boolean) => {
    if (!editando) return;
    const { error } = await supabase.rpc('admin_segundo_supervisor', { p_grupo: editando.id, p_perfil: perfilId, p_agregar: agregar });
    if (error) Alert.alert('No se pudo guardar', error.message);
    else {
      setEditando(null);
      onCambio();
    }
  };

  const candidatosGuia = editando
    ? cuentas.filter((c) => c.estado === 'activo' && c.red_id === editando.red_id && (c.rol === 'guia' || c.rol === 'guia_supervisor'))
    : [];
  const supervisoresRed = editando ? cuentas.filter((c) => c.estado === 'activo' && c.red_id === editando.red_id && c.rol === 'guia_supervisor') : [];

  return (
    <>
      {grupos.length === 0 ? (
        <Card>
          <Text style={s.textoFilaSec}>Todavía no hay grupos.</Text>
        </Card>
      ) : (
        grupos.map((g) => {
          const parado = !g.ultima_reunion || g.ultima_reunion < hace14;
          return (
            <Card key={g.id} onPress={() => setEditando(g)}>
              <View style={s.fila}>
                <View style={{ flex: 1 }}>
                  <Text style={s.textoFila}>{g.nombre}</Text>
                  <Text style={s.textoFilaSec}>
                    {g.red} · Guía: {g.guia ?? '—'}
                  </Text>
                  <Text style={s.textoFilaSec}>
                    Supervisión: {[g.supervisor, ...g.segundos].filter(Boolean).join(' y ') || '—'}
                  </Text>
                  <Text style={{ color: parado ? colors.warning : colors.textSec, fontSize: 12, marginTop: 2 }}>
                    {g.miembros} miembros · {g.reuniones_4_semanas} reuniones en 4 semanas · última{' '}
                    {g.ultima_reunion ? formatoFecha(g.ultima_reunion) : 'nunca'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTer} />
              </View>
            </Card>
          );
        })
      )}

      <HojaModal visible={!!editando} onClose={() => setEditando(null)} titulo={editando?.nombre ?? ''}>
        {editando ? (
          <>
            <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>Guía (tocá para cambiarlo)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
              {candidatosGuia.map((c) => (
                <Chip key={c.id} texto={nombreDe(c)} activo={c.id === editando.guia_id} onPress={() => c.id !== editando.guia_id && cambiarGuia(c.id)} />
              ))}
            </View>
            <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>
              Supervisor principal: {editando.supervisor ?? '—'} (es el supervisor del guía; se cambia desde Cuentas)
            </Text>
            <Text style={[s.textoFilaSec, { marginBottom: 6, marginTop: 8 }]}>Segundo supervisor (tocá para agregar o quitar)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {supervisoresRed
                .filter((c) => nombreDe(c) !== editando.supervisor)
                .map((c) => {
                  const esta = editando.segundos.includes(nombreDe(c));
                  return <Chip key={c.id} texto={nombreDe(c)} activo={esta} onPress={() => segundo(c.id, !esta)} />;
                })}
            </View>
          </>
        ) : null}
      </HojaModal>
    </>
  );
}

// =====================================================================
// Responsables de cada red
// =====================================================================
function Responsables({ redes, lista, cuentas, onCambio }: { redes: Red[]; lista: Responsable[]; cuentas: Cuenta[]; onCambio: () => void }) {
  const [agregando, setAgregando] = useState<{ red: Red; tipo: Responsable['tipo'] } | null>(null);

  const cambiar = async (red: string, perfil: string, tipo: Responsable['tipo'], agregar: boolean) => {
    const { error } = await supabase.rpc('admin_responsable', { p_red: red, p_perfil: perfil, p_tipo: tipo, p_agregar: agregar });
    if (error) Alert.alert('No se pudo guardar', error.message);
    else {
      setAgregando(null);
      onCambio();
    }
  };

  const candidatos = agregando
    ? cuentas.filter(
        (c) =>
          c.estado === 'activo' &&
          c.rol !== 'administrador' &&
          (agregando.tipo === 'pastor' ? c.rol === 'pastor' : c.red_id === agregando.red.id) &&
          !lista.some((x) => x.red_id === agregando.red.id && x.tipo === agregando.tipo && x.perfil_id === c.id)
      )
    : [];

  return (
    <>
      {redes.map((red) => (
        <Card key={red.id}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 6 }}>{red.nombre}</Text>
          {TIPOS_RESP.map((t) => {
            const de = lista.filter((x) => x.red_id === red.id && x.tipo === t.tipo);
            return (
              <View key={t.tipo} style={{ marginTop: 6 }}>
                <View style={[s.fila, { justifyContent: 'space-between' }]}>
                  <Text style={{ color: colors.textSec, fontSize: 13, fontWeight: '700' }}>{t.texto}</Text>
                  <Pressable onPress={() => setAgregando({ red, tipo: t.tipo })} hitSlop={8}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>+ Agregar</Text>
                  </Pressable>
                </View>
                {de.length === 0 ? (
                  <Text style={[s.textoFilaSec, { fontSize: 13 }]}>—</Text>
                ) : (
                  de.map((x) => (
                    <View key={x.perfil_id} style={[s.fila, { paddingVertical: 3 }]}>
                      <Text style={{ color: colors.text, flex: 1 }}>{x.nombre}</Text>
                      <Pressable onPress={() => cambiar(red.id, x.perfil_id, t.tipo, false)} hitSlop={8}>
                        <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </Card>
      ))}

      <HojaModal
        visible={!!agregando}
        onClose={() => setAgregando(null)}
        titulo={agregando ? `${TIPOS_RESP.find((t) => t.tipo === agregando.tipo)?.texto} de ${agregando.red.nombre}` : ''}
      >
        {agregando ? (
          candidatos.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {candidatos.map((c) => (
                <Chip key={c.id} texto={nombreDe(c)} activo={false} onPress={() => cambiar(agregando.red.id, c.id, agregando.tipo, true)} />
              ))}
            </View>
          ) : (
            <Text style={s.textoFilaSec}>
              {agregando.tipo === 'pastor'
                ? 'No hay cuentas con rol Pastor. Primero cambiale el rol a la persona en Cuentas.'
                : 'No hay cuentas activas en esta red para agregar.'}
            </Text>
          )
        ) : null}
      </HojaModal>
    </>
  );
}

// =====================================================================
// Equipo desde planilla (por red)
// =====================================================================
function Equipo({ redes, onCambio }: { redes: Red[]; onCambio: () => void }) {
  const [red, setRed] = useState<Red | null>(redes.find((r) => r.nombre === 'Misión Joven') ?? redes[0] ?? null);
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        {redes.map((r) => (
          <Chip key={r.id} texto={r.nombre} activo={red?.id === r.id} onPress={() => setRed(r)} />
        ))}
      </View>
      {red ? <EquipoDesdePlanilla key={red.id} redId={red.id} redNombre={red.nombre} onCambio={onCambio} /> : null}
    </>
  );
}

// =====================================================================
// Cambios de rol y estado (auditoría)
// =====================================================================
function Cambios({ cambios }: { cambios: CambioRol[] }) {
  if (!cambios.length) {
    return (
      <Card>
        <Text style={s.textoFilaSec}>Todavía no hay cambios de rol registrados.</Text>
      </Card>
    );
  }
  return (
    <Card>
      {cambios.map((c, i) => (
        <View key={i} style={[s.filaLista, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.textoFila}>{c.persona}</Text>
            <Text style={s.textoFilaSec}>
              {c.rol_antes !== c.rol_despues
                ? `${ROL_LABEL[c.rol_antes as Rol] ?? c.rol_antes ?? '—'} → ${ROL_LABEL[c.rol_despues as Rol] ?? c.rol_despues ?? '—'}`
                : ''}
              {c.rol_antes !== c.rol_despues && c.estado_antes !== c.estado_despues ? ' · ' : ''}
              {c.estado_antes !== c.estado_despues ? `${c.estado_antes ?? '—'} → ${c.estado_despues ?? '—'}` : ''}
            </Text>
            <Text style={[s.textoFilaSec, { fontSize: 12 }]}>
              {formatoFecha(c.fecha.slice(0, 10))}
              {c.quien ? ` · por ${c.quien}` : ' · desde el SQL Editor'}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

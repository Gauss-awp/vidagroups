// ---------------------------------------------------------------------
// Contenido de la Ayuda: preguntas frecuentes por rol.
// Para cambiar o sumar una respuesta, se edita este archivo y se publica.
// ---------------------------------------------------------------------
import type { Rol } from './types';

export interface ItemAyuda {
  titulo: string;
  texto: string;
  /** A quién le aparece primero ("Para vos"). Vacío = a todos. */
  roles?: Rol[];
}

export const AYUDA: ItemAyuda[] = [
  // ------------------------- Guías -------------------------
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: '¿Cómo cargo la reunión de mi grupo?',
    texto:
      'En tu grupo tocá el botón grande "Cargar la reunión". Son tres pasos:\n\n1. ¿Quién vino? Tocá a cada hermano que vino (o "Vinieron todos").\n2. ¿Por qué faltaron? Elegí un motivo para cada ausente y queda la "C". Si todavía no hablaste con alguien, dejalo en "Lo consolido después".\n3. Datos de la reunión: ofrenda, material, quién compartió.\n\nAl final tocá "Terminar". Funciona aunque no tengas señal: se envía sola cuando vuelve la conexión.',
  },
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: 'Me equivoqué en una reunión, ¿cómo la corrijo?',
    texto:
      'Andá a la pestaña "Reuniones" del grupo y tocá la reunión. Se abre con todo lo que habías cargado: cambiá lo que haga falta y tocá "Terminar".\n\nSi ese día no hubo reunión, en el primer paso está "No hubo reunión este día (borrar)".',
  },
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: '¿Cómo completo las consolidaciones (las C)?',
    texto:
      'En la pestaña "Reuniones", las reuniones con ausentes sin C muestran "2 para consolidar · completar ›". Tocalo y vas directo al paso de los motivos. Elegí el motivo de cada uno y tocá "Terminar".\n\nTe llega un recordatorio el martes a las 19 h si te faltan C de la última reunión.',
  },
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: '¿Cómo agrego o quito a un hermano?',
    texto:
      'En la pestaña "Miembros":\n\n• Para agregar: "Agregar miembro".\n• Para editar sus datos o ver su historial: tocalo.\n• Para quitarlo del grupo: mantenelo apretado. Su historial no se pierde: sigue apareciendo en la planilla de los meses en que estuvo.',
  },
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: 'Guío el grupo con otra persona, ¿cómo la sumo?',
    texto:
      'Cuando te registres, en "¿En qué grupo servís?" elegí tu grupo de la lista (o "Es un grupo nuevo" si todavía no está). Quien te aprueba te suma a ese grupo.\n\nSi ya tenés cuenta, tu Guía Supervisor (o los encargados) te suman desde el grupo → "Equipo" → "Agregar".',
  },
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: '¿Cómo cargo el día y la hora de mi grupo?',
    texto:
      'En la tarjeta del grupo tocá "Datos del grupo". Elegí el día, escribí la hora (por ejemplo 21:00), el barrio y la dirección, y guardá.\n\nCon el día y la hora la app te recuerda cargar la reunión 2 horas después del GV.',
  },
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: '¿Cómo saco la planilla de asistencia en Excel?',
    texto:
      'En la pestaña "Reuniones", abajo de todo, tocá "Planilla de asistencia (exportar / importar)". Elegí el año y tocá "Exportar": sale igual a la planilla de la iglesia, con los 12 meses.\n\nDesde ahí también podés importar la planilla que ya tenías, para traer a tus hermanos con su historial.',
  },
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: '¿Cómo sigo a las personas que me derivaron?',
    texto:
      'En la pestaña "Consolidación" del grupo están las personas nuevas que la consolidadora te derivó. Marcá la fonovisita, la visita, los pilares (1 a 5), si comenzó el GV y el Encuentro.\n\nCuando hace el Encuentro aparecen el Pos-encuentro (las 10 clases) y el Reencuentro.',
  },
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: '¿Quién ve las notas pastorales?',
    texto: 'Solo los guías del grupo y sus Guías Supervisores. No las ven los encargados, los pastores ni el Administrador.',
  },

  // ------------------------- Guías Supervisores -------------------------
  {
    roles: ['guia_supervisor'],
    titulo: '¿Qué veo en "Mis Guías"?',
    texto:
      'Los grupos que supervisás: cómo viene la asistencia, quién tiene faltas, los cumpleaños de la semana y las personas nuevas en consolidación.\n\nTocando un grupo entrás a verlo completo, y si el guía no pudo, podés cargar la reunión vos.',
  },

  {
    roles: ['guia_supervisor'],
    titulo: '¿Cómo creo un grupo nuevo?',
    texto:
      'En "Mis Guías" tocá "Crear un grupo" y poné el nombre. Si los guías ya tienen cuenta, elegilos (uno o dos); si todavía no se registraron, dejalo sin guía. Opcional: el día y la hora.\n\nVos quedás como supervisor. Cuando sus guías se registren y elijan ese grupo, el pedido te llega a vos en "Mis Guías": el primero que aprobás queda como guía principal y el segundo como segundo guía.',
  },
  {
    roles: ['guia_supervisor'],
    titulo: '¿Cómo cambio o sumo un guía a un grupo que superviso?',
    texto: 'Entrá al grupo → "Equipo". En "Guías" tocá "Agregar" para sumar, la ✕ para quitar, y la ⭐ para elegir al principal.',
  },

  // ------------------------- Consolidación -------------------------
  {
    roles: ['consolidacion', 'guia_supervisor', 'pastor'],
    titulo: '¿Cómo registro y derivo a una persona nueva?',
    texto:
      'En el panel de Consolidación tocá "Registrar persona nueva" y completá sus datos.\n\nQueda en "Sin asignar". Ahí mismo tocá "→ Grupo…" para derivarla: los grupos de su zona aparecen primero. Desde ese momento la ve el guía de ese grupo.',
  },
  {
    roles: ['consolidacion', 'guia_supervisor', 'pastor'],
    titulo: '¿Cómo está organizado el panel de Consolidación?',
    texto:
      '• "Para hacer": lo urgente (sin asignar, sin fonovisita hace más de 3 días, los que salieron de su grupo).\n• "Sin asignar": las personas nuevas sin grupo.\n• "Por grupo": tocá un grupo para ver a sus nuevos con los pasos en circulitos (F fono, V visita, P pilares, G va al GV, E encuentro).\n• "Completadas": al final.\n\nArriba hay un buscador por nombre, teléfono o zona.',
  },

  // ------------------------- Pastores y encargados -------------------------
  {
    roles: ['pastor', 'guia_supervisor', 'apostol', 'administrador'],
    titulo: '¿Cómo apruebo a alguien que se registró?',
    texto:
      'En "Mi Red" (o en "Mis Guías", si sos Guía Supervisor) aparecen las cuentas que esperan, con el grupo que pidió cada una. Tocá "Aprobar", elegí el rol y el grupo: si es un grupo nuevo, se crea en ese momento. Los Guías Supervisores aprueban guías; los otros roles los aprueban los encargados.',
  },
  {
    roles: ['pastor', 'guia_supervisor', 'apostol'],
    titulo: '¿Cómo armo quién guía y quién supervisa cada grupo?',
    texto:
      'En "Mi Red" → "Gestionar GVs", abrí el grupo y vas a ver el "Equipo del grupo":\n\n• Guías: quiénes lo guían.\n• Supervisión: quiénes lo supervisan.\n\nCon "Agregar" sumás a alguien y con la ✕ lo quitás. La ⭐ marca al principal: tocá la estrella de otra persona para que pase a ser la principal.',
  },

  {
    roles: ['pastor', 'guia_supervisor', 'apostol', 'administrador'],
    titulo: '¿Cómo uso el Centro de Eventos?',
    texto:
      'En "Mi Red" tocá "Centro de Eventos". Ahí ves todos los eventos de la red con lo recaudado, lo que falta cobrar y quiénes pagaron.\n\nEntrando a un evento tenés: Resumen (indicadores y gráficos), Anotados (quién va y cuánto debe; tocá a alguien para anotarlo o registrar un pago), Pagos (el historial) y Planillas (exportar a Excel, importar una planilla y armar el mensaje con los saldos).',
  },
  {
    roles: ['guia', 'guia_supervisor'],
    titulo: '¿Cómo anoto a alguien a un evento y registro sus pagos?',
    texto:
      'En el grupo, pestaña "Eventos", entrá al evento. En "Anotados" → "No anotados" tocá a la persona para anotarla. Para registrar una cuota, tocala en la lista y completá el monto (hay botones para "Todo" y "La mitad"). Al registrar un pago queda anotada sola.',
  },

  // ------------------------- Administrador -------------------------
  {
    roles: ['administrador'],
    titulo: '¿Qué hay en el panel de Administración?',
    texto:
      'Salud del sistema, errores de la app, avisos para todos, mensajes de ayuda, cuentas, grupos, responsables de cada red, la carga de equipo y los cambios de rol. No se ven datos de miembros, asistencia, consolidación, notas ni ofrendas.',
  },

  // ------------------------- Para todos -------------------------
  {
    titulo: '¿Cómo instalo la app en el iPhone?',
    texto:
      'Abrí el link de la app en Safari (tiene que ser Safari). Tocá el botón Compartir (el cuadrado con la flecha) → "Agregar a inicio" → "Agregar". Desde ahí abrila siempre con el ícono.',
  },
  {
    titulo: 'Me registré y no me llega el código',
    texto:
      'Revisá la carpeta de spam o "Promociones". Si no está, en la pantalla del código tocá "Reenviar código". El código nuevo reemplaza al anterior.',
  },
  {
    titulo: 'Dice "Esperando aprobación", ¿qué hago?',
    texto: 'Es normal: tu Guía Supervisor o los encargados de tu red tienen que aprobar tu cuenta y asignarte tu grupo. Mientras esperás, en esa misma pantalla podés elegir o corregir tu grupo. Cuando te aprueben, tocá "Actualizar".',
  },
  {
    titulo: 'Me olvidé la contraseña',
    texto: 'En la pantalla de ingreso tocá "¿Olvidaste tu contraseña?". Te llega un código por correo y elegís una contraseña nueva.',
  },
  {
    titulo: '¿Funciona sin internet?',
    texto:
      'Para cargar la reunión, sí: lo que marques se guarda en el celular y se envía solo cuando vuelve la señal. Para lo demás (planillas, paneles, eventos) necesitás conexión.',
  },
  {
    titulo: '¿Cómo sé si tengo la última versión?',
    texto: 'Las actualizaciones llegan solas al abrir la app. En Perfil, abajo de todo, figura la versión que tenés.',
  },
];

export const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

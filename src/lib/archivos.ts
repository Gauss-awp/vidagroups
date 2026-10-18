// ---------------------------------------------------------------------
// Guardar/compartir y leer archivos de Excel, en el celular y en la web.
// ---------------------------------------------------------------------
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { DocumentPickerAsset } from 'expo-document-picker';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Comparte un archivo (celular) o lo descarga / comparte desde el navegador (web) */
export async function compartirArchivo(base64: string, nombre: string, titulo: string, mime = MIME_XLSX) {
  if (Platform.OS === 'web') {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const ArchivoWeb = (globalThis as any).File;
    const archivo = ArchivoWeb ? new ArchivoWeb([blob], nombre, { type: mime }) : null;
    const nav = (globalThis as any).navigator;
    // En iPhone, el menú de compartir del navegador permite guardarlo en Archivos o mandarlo por WhatsApp
    if (archivo && nav?.canShare?.({ files: [archivo] })) {
      try {
        await nav.share({ files: [archivo], title: titulo });
        return;
      } catch {
        // si cancela o no se puede, se descarga
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }

  const archivo = new File(Paths.cache, nombre);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(base64, { encoding: 'base64' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este dispositivo no permite compartir archivos.');
  await Sharing.shareAsync(archivo.uri, { mimeType: mime, UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: titulo });
}

/** Lee un archivo elegido con el selector, listo para XLSX.read */
export async function leerArchivoElegido(asset: DocumentPickerAsset): Promise<{ datos: string | ArrayBuffer; tipo: 'base64' | 'array' }> {
  if (Platform.OS === 'web') {
    const archivoWeb = (asset as any).file as Blob | undefined;
    const buffer = archivoWeb ? await archivoWeb.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
    return { datos: buffer, tipo: 'array' };
  }
  return { datos: await new File(asset.uri).base64(), tipo: 'base64' };
}

import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * En la web, agrega lo necesario para que en iPhone se pueda "Agregar a inicio"
 * y quede como una app: ícono de Vida Nueva, nombre y pantalla completa.
 */
export function WebHead() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = 'VidaGroups';
    const agregar = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
      const clave = attrs.rel ?? attrs.name;
      if (document.head.querySelector(`${tag}[${attrs.rel ? 'rel' : 'name'}="${clave}"]`)) return;
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    };
    agregar('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });
    agregar('link', { rel: 'manifest', href: '/manifest.json' });
    agregar('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    agregar('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    agregar('meta', { name: 'apple-mobile-web-app-title', content: 'VidaGroups' });
    agregar('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
    agregar('meta', { name: 'theme-color', content: '#FFFFFF' });
  }, []);
  return null;
}

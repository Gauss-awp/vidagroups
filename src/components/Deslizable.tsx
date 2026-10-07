import React, { useRef } from 'react';
import { Animated, Dimensions, PanResponder, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

/**
 * Fila que se puede deslizar hacia la izquierda para descartarla.
 * Usa solo React Native (sin paquetes nuevos), así llega por actualización.
 */
export function Deslizable({ children, onDescartar, texto = 'Descartar' }: { children: React.ReactNode; onDescartar: () => void; texto?: string }) {
  const x = useRef(new Animated.Value(0)).current;
  const ancho = Dimensions.get('window').width;

  const pan = useRef(
    PanResponder.create({
      // Solo toma el gesto si es claramente horizontal: el desplazamiento vertical sigue funcionando
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -90 || g.vx < -0.8) {
          Animated.timing(x, { toValue: -ancho, duration: 180, useNativeDriver: true }).start(() => onDescartar());
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  return (
    <View style={{ overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.textSec,
          borderRadius: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 16,
        }}
      >
        <Ionicons name="eye-off-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{texto}</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from './theme';

/**
 * Simple geometric icons drawn from plain Views. The app deliberately carries no SVG or icon-font
 * dependency (see the eye glyph in ./index.tsx), so these are built from rectangles, circles and
 * rotations. They are meant to be recognised at a glance rather than admired up close — the point is
 * that someone can find "repairs" without reading the word under it.
 */
export type IconName =
  | 'home' | 'check' | 'gauge' | 'cog' | 'clipboard' | 'parts' | 'rig' | 'plus'
  | 'report' | 'clock' | 'people' | 'key' | 'phone' | 'shield' | 'duplicate' | 'more';

export function Icon({ name, size = 28, color = colors.navy800 }: { name: IconName; size?: number; color?: string }) {
  const u = size / 24; // all shapes are described on a 24-unit grid, then scaled
  const box = { width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const };
  const bar = (w: number, h: number, extra?: object) => ({
    position: 'absolute' as const, width: w * u, height: h * u, backgroundColor: color, ...extra,
  });
  const ring = (d: number, thickness: number, extra?: object) => ({
    position: 'absolute' as const, width: d * u, height: d * u, borderRadius: (d * u) / 2,
    borderWidth: thickness * u, borderColor: color, ...extra,
  });

  switch (name) {
    case 'home': // roof over a body
      return (
        <View style={box}>
          <View style={bar(11, 2.6, { transform: [{ translateX: -4 * u }, { translateY: -5 * u }, { rotate: '-40deg' }] })} />
          <View style={bar(11, 2.6, { transform: [{ translateX: 4 * u }, { translateY: -5 * u }, { rotate: '40deg' }] })} />
          <View style={bar(14, 10, { backgroundColor: 'transparent', borderWidth: 2 * u, borderColor: color, transform: [{ translateY: 4 * u }] })} />
        </View>
      );
    case 'check': // a tick
      return (
        <View style={box}>
          <View style={bar(9, 2.6, { transform: [{ translateX: -4 * u }, { translateY: 3 * u }, { rotate: '45deg' }] })} />
          <View style={bar(16, 2.6, { transform: [{ translateX: 2.5 * u }, { translateY: -0.5 * u }, { rotate: '-45deg' }] })} />
        </View>
      );
    case 'gauge': // dial with a needle — machine readings
      return (
        <View style={box}>
          <View style={ring(18, 2)} />
          <View style={bar(7, 2.2, { transform: [{ translateX: 1.5 * u }, { translateY: -1.5 * u }, { rotate: '-35deg' }] })} />
          <View style={bar(3, 3, { borderRadius: 3 * u })} />
        </View>
      );
    case 'cog': // servicing — a spanner drawn from bars read as a percent sign, a cog reads as machinery
      return (
        <View style={box}>
          <View style={ring(13, 2.6)} />
          {[0, 45, 90, 135].map((deg) => (
            <View key={deg} style={bar(20, 3.4, { transform: [{ rotate: `${deg}deg` }] })} />
          ))}
          <View style={bar(11, 11, { borderRadius: 11 * u, backgroundColor: colors.surface })} />
          <View style={ring(11, 2.6)} />
        </View>
      );
    case 'clipboard': // job cards
      return (
        <View style={box}>
          <View style={[bar(15, 18, { backgroundColor: 'transparent', borderWidth: 2 * u, borderColor: color })]} />
          <View style={bar(7, 3.5, { transform: [{ translateY: -8 * u }] })} />
          <View style={bar(8, 1.8, { transform: [{ translateY: 1 * u }] })} />
          <View style={bar(8, 1.8, { transform: [{ translateY: 5 * u }] })} />
        </View>
      );
    case 'parts': // stacked box — the store
      return (
        <View style={box}>
          <View style={bar(17, 11, { backgroundColor: 'transparent', borderWidth: 2 * u, borderColor: color, transform: [{ translateY: 3 * u }] })} />
          <View style={bar(17, 2, { transform: [{ translateY: -2.5 * u }] })} />
          <View style={bar(5, 2, { transform: [{ translateY: -6 * u }] })} />
        </View>
      );
    case 'rig': // machines — a derrick outline read as a chess pawn, so this is a plant vehicle instead
      return (
        <View style={box}>
          <View style={bar(18, 7, { backgroundColor: 'transparent', borderWidth: 2 * u, borderColor: color, transform: [{ translateY: -1 * u }] })} />
          <View style={bar(7, 5, { backgroundColor: 'transparent', borderWidth: 2 * u, borderColor: color, transform: [{ translateX: -5 * u }, { translateY: -7 * u }] })} />
          <View style={ring(6, 2, { transform: [{ translateX: -5 * u }, { translateY: 6 * u }] })} />
          <View style={ring(6, 2, { transform: [{ translateX: 5 * u }, { translateY: 6 * u }] })} />
        </View>
      );
    case 'plus':
      return (
        <View style={box}>
          <View style={bar(16, 2.8)} />
          <View style={bar(2.8, 16)} />
        </View>
      );
    case 'report': // bar chart
      return (
        <View style={box}>
          <View style={bar(3.4, 7, { transform: [{ translateX: -6 * u }, { translateY: 3 * u }] })} />
          <View style={bar(3.4, 13, { transform: [{ translateY: 0 * u }] })} />
          <View style={bar(3.4, 10, { transform: [{ translateX: 6 * u }, { translateY: 1.5 * u }] })} />
          <View style={bar(18, 2, { transform: [{ translateY: 8 * u }] })} />
        </View>
      );
    case 'clock': // already sent / history
      return (
        <View style={box}>
          <View style={ring(18, 2)} />
          <View style={bar(5, 2, { transform: [{ translateX: 1.2 * u }, { translateY: -1.2 * u }, { rotate: '-60deg' }] })} />
          <View style={bar(6, 2, { transform: [{ translateX: 1.5 * u }] })} />
        </View>
      );
    case 'people':
      return (
        <View style={box}>
          <View style={ring(8, 2, { transform: [{ translateY: -5 * u }] })} />
          <View style={bar(16, 8, { backgroundColor: 'transparent', borderTopWidth: 2 * u, borderLeftWidth: 2 * u, borderRightWidth: 2 * u, borderColor: color, borderTopLeftRadius: 8 * u, borderTopRightRadius: 8 * u, transform: [{ translateY: 6 * u }] })} />
        </View>
      );
    case 'key': // roles and permissions
      return (
        <View style={box}>
          <View style={ring(9, 2.4, { transform: [{ translateX: -5 * u }] })} />
          <View style={bar(11, 2.4, { transform: [{ translateX: 4 * u }] })} />
          <View style={bar(2.4, 5, { transform: [{ translateX: 7 * u }, { translateY: 2.5 * u }] })} />
        </View>
      );
    case 'phone': // devices
      return (
        <View style={box}>
          <View style={bar(12, 19, { backgroundColor: 'transparent', borderWidth: 2 * u, borderColor: color, borderRadius: 2 * u })} />
          <View style={bar(4, 1.6, { transform: [{ translateY: 7 * u }] })} />
        </View>
      );
    case 'shield': // security
      return (
        <View style={box}>
          <View style={bar(15, 11, { backgroundColor: 'transparent', borderWidth: 2 * u, borderColor: color, transform: [{ translateY: -3 * u }] })} />
          <View style={bar(10.6, 10.6, { backgroundColor: 'transparent', borderRightWidth: 2 * u, borderBottomWidth: 2 * u, borderColor: color, transform: [{ translateY: 4 * u }, { rotate: '45deg' }, { scaleY: 0.7 }] })} />
        </View>
      );
    case 'duplicate': // two overlapping sheets — rejected duplicates
      return (
        <View style={box}>
          <View style={bar(12, 15, { backgroundColor: 'transparent', borderWidth: 2 * u, borderColor: color, transform: [{ translateX: -3 * u }, { translateY: -2 * u }] })} />
          <View style={bar(12, 15, { backgroundColor: colors.surface, borderWidth: 2 * u, borderColor: color, transform: [{ translateX: 3 * u }, { translateY: 2.5 * u }] })} />
        </View>
      );
    case 'more':
      return (
        <View style={box}>
          <View style={bar(3.6, 3.6, { borderRadius: 3.6 * u, transform: [{ translateX: -6 * u }] })} />
          <View style={bar(3.6, 3.6, { borderRadius: 3.6 * u })} />
          <View style={bar(3.6, 3.6, { borderRadius: 3.6 * u, transform: [{ translateX: 6 * u }] })} />
        </View>
      );
    default:
      return <View style={box} />;
  }
}

export const iconStyles = StyleSheet.create({});

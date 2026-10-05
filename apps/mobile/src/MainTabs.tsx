import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, clearSession, loadSession } from './lib/api';
import { can, type PermissionMatrix } from '@drillex/shared';
import { cached } from './sync/cache';
import { getState } from './sync/outbox';
import HomeScreen from './screens/HomeScreen';
import AssetsScreen from './screens/AssetsScreen';
import ShiftReportsScreen from './screens/ShiftReportsScreen';
import MaintenanceScreen from './screens/MaintenanceScreen';
import HistoryScreen from './screens/HistoryScreen';
import MoreScreen from './screens/MoreScreen';
import type { RootStackParamList } from './navigation';
import { SyncBadge } from './ui/SyncBadge';
import { Icon, type IconName } from './ui/icons';
import { colors } from './ui/theme';

const Tab = createBottomTabNavigator<RootStackParamList>();

/**
 * Persistent bottom navigation. Home used to be the only way anywhere, so every journey was
 * home → tap → screen → back → home. The three destinations a person uses daily sit here permanently;
 * everything rarer collapses into the last tab rather than competing for space.
 *
 * The middle tab is chosen from the signed-in role: a supervisor approves, a technician services, an
 * operator looks back at what they sent.
 */
export default function MainTabs({ navigation }: { navigation: { navigate: (n: 'Outbox') => void; reset: (s: { index: number; routes: { name: 'Login' }[] }) => void } }) {
  const insets = useSafeAreaInsets();
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [role, setRole] = useState<string | undefined>();

  const load = useCallback(async () => {
    const [perms, sess] = await Promise.all([
      cached('permissions', () => api<PermissionMatrix>('/roles/matrix')),
      loadSession(),
    ]);
    setMatrix(perms.data); setRole(sess?.user.role);
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  // In the header of every tab rather than on Home only, so it is one tap away wherever you are. Confirmed
  // first, since a header button is easy to hit by accident, and it warns when entries are still unsent.
  function signOut() {
    const { pending, failed } = getState();
    const unsent = pending + failed;
    Alert.alert(
      'Sign out?',
      unsent ? `${unsent} ${unsent === 1 ? 'entry has' : 'entries have'} not been sent yet. They stay on this phone and send after the next sign-in.` : 'You will need your Employee ID and password to sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: async () => { await clearSession(); navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); } },
      ],
    );
  }

  const allow = (p: Parameters<typeof can>[2]) => !!role && !!matrix && !!can(matrix, role, p);

  const icon = (name: IconName) =>
    ({ color }: { color: string }) => <Icon name={name} size={28} color={color} />;

  // One role-specific tab, so the bar stays at four items on any handset width.
  const primary = allow('shift_report:approve')
    ? { name: 'ShiftReports' as const, component: ShiftReportsScreen, title: 'Approve', icon: 'check' as IconName }
    : allow('maintenance:complete')
      ? { name: 'Maintenance' as const, component: MaintenanceScreen, title: 'Servicing', icon: 'cog' as IconName }
      : { name: 'History' as const, component: HistoryScreen, title: 'Sent', icon: 'clock' as IconName };

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy900 },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        // Navy like the header, so the screen is framed top and bottom; the current tab carries the brand gold.
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: '#D5DEEA',
        tabBarActiveBackgroundColor: colors.navy700,
        tabBarStyle: { backgroundColor: colors.navy900, borderTopWidth: 3, borderTopColor: colors.gold, height: 78 + insets.bottom, paddingBottom: insets.bottom },
        tabBarItemStyle: { paddingVertical: 8 },
        tabBarLabelStyle: { fontSize: 14, fontWeight: '700', marginTop: 4 },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginRight: 14 }}>
            <SyncBadge onPress={() => navigation.navigate('Outbox')} />
            <Pressable onPress={signOut} hitSlop={10} accessibilityRole="button">
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Sign out</Text>
            </Pressable>
          </View>
        ),
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Drillex', tabBarLabel: 'Home', tabBarIcon: icon('home') }}
      />
      {allow('asset:read') && (
        <Tab.Screen
          name="Assets"
          component={AssetsScreen}
          options={{ title: 'Machines', tabBarLabel: 'Machines', tabBarIcon: icon('rig') }}
        />
      )}
      <Tab.Screen
        name={primary.name}
        component={primary.component}
        options={{ title: primary.title, tabBarLabel: primary.title, tabBarIcon: icon(primary.icon) }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        // For an admin this tab is mostly the setting-up tools, so it says so.
        options={role === 'ADMIN'
          ? { title: 'Admin', tabBarLabel: 'Admin', tabBarIcon: icon('more') }
          : { title: 'Everything else', tabBarLabel: 'More', tabBarIcon: icon('more') }}
      />
    </Tab.Navigator>
  );
}

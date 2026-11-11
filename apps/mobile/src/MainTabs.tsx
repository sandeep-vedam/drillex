import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
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
import RequestsScreen from './screens/RequestsScreen';
import SiteScreen from './screens/SiteScreen';
import FinanceScreen from './screens/FinanceScreen';
import PlantHireScreen from './screens/PlantHireScreen';
import { FINANCE_HEADER } from './ui/finance';

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
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [perms, sess] = await Promise.all([
      cached('permissions', () => api<PermissionMatrix>('/roles/matrix')),
      loadSession(),
    ]);
    setMatrix(perms.data); setRole(sess?.user.role);
  }, []);
  // The tabs depend on the role, and the first tab shown is fixed when the navigator mounts, so wait for both.
  useEffect(() => { load().catch(() => {}).finally(() => setReady(true)); }, [load]);

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

  // Finance staff and plant hire supervisors work in their own module (client spec §6, §11): it takes the role-specific
  // slot and is where they land. Managers and admins, who also hold finance access, reach it from More instead.
  const ownModule = allow('finance:read') && !allow('shift_report:approve') && !allow('user:manage')
    ? { name: 'Finance' as const, component: FinanceScreen, title: 'Finance', icon: 'money' as IconName }
    : allow('plant_hire:write') && !allow('finance:read')
      ? { name: 'PlantHire' as const, component: PlantHireScreen, title: 'Plant hire', icon: 'money' as IconName }
      : null;
  // One role-specific tab, so the bar stays at four items on any handset width.
  const primary = ownModule ?? (allow('shift_report:approve')
    ? { name: 'ShiftReports' as const, component: ShiftReportsScreen, title: 'Approve', icon: 'check' as IconName }
    : allow('maintenance:complete')
      ? { name: 'Maintenance' as const, component: MaintenanceScreen, title: 'Servicing', icon: 'cog' as IconName }
      : { name: 'History' as const, component: HistoryScreen, title: 'Sent', icon: 'clock' as IconName });
  // Field operators get the spec's Location / Client Tracker tab in place of the machine register (client spec §4A, §4B);
  // everyone who can raise or handle requests gets a Requests tab. At most five tabs, so labels stay readable.
  const fieldOperator = (allow('daily_reading:create') || allow('shift_report:create')) && !allow('shift_report:approve') && !allow('maintenance:complete');
  const requests = allow('request:create') || allow('request:read') || allow('request:manage');
  const tabCount = 3 + (fieldOperator || allow('asset:read') ? 1 : 0) + (requests ? 1 : 0);

  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.canvas }}><ActivityIndicator color={colors.navy800} /></View>;

  return (
    <Tab.Navigator
      initialRouteName={ownModule?.name ?? 'Home'}
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
        tabBarLabelStyle: { fontSize: tabCount > 4 ? 12 : 14, fontWeight: '700', marginTop: 4 },
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
      {fieldOperator ? (
        <Tab.Screen name="Site" component={SiteScreen} options={{ title: 'Site & client', tabBarLabel: 'Site', tabBarIcon: icon('pin') }} />
      ) : allow('asset:read') && (
        <Tab.Screen
          name="Assets"
          component={AssetsScreen}
          options={{ title: 'Machines', tabBarLabel: 'Machines', tabBarIcon: icon('rig') }}
        />
      )}
      <Tab.Screen
        name={primary.name}
        component={primary.component}
        options={{ title: primary.title, tabBarLabel: primary.title, tabBarIcon: icon(primary.icon), ...(primary.name === 'Finance' ? { headerStyle: { backgroundColor: FINANCE_HEADER } } : {}) }}
      />
      {requests && <Tab.Screen name="Requests" component={RequestsScreen} options={{ title: 'Requests', tabBarLabel: 'Requests', tabBarIcon: icon('chat') }} />}
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

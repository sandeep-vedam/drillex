import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import LockScreen from './src/screens/LockScreen';
import DailyReadingScreen from './src/screens/DailyReadingScreen';
import ShiftReportScreen from './src/screens/ShiftReportScreen';
import OutboxScreen from './src/screens/OutboxScreen';
import MaintenanceScreen from './src/screens/MaintenanceScreen';
import JobCardsScreen from './src/screens/JobCardsScreen';
import JobCardNewScreen from './src/screens/JobCardNewScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import { SyncBadge } from './src/ui/SyncBadge';
import { startSyncLoop } from './src/sync/outbox';
import { loadSession, setSessionExpiredHandler } from './src/lib/api';
import type { RootStackParamList } from './src/navigation';
import { IdleLockProvider, useIdleLock } from './src/security/IdleLock';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navRef = createNavigationContainerRef<RootStackParamList>();

function Root({ initial }: { initial: 'Login' | 'Home' }) {
  const { locked, unlock } = useIdleLock();
  const [route, setRoute] = useState<string | undefined>(initial);
  const signedIn = route !== 'Login';
  return (
    <>
      <NavigationContainer ref={navRef} onStateChange={() => setRoute(navRef.getCurrentRoute()?.name)}>
        <Stack.Navigator initialRouteName={initial} screenOptions={{ headerStyle: { backgroundColor: '#0B1B30' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Drillex Ops', headerRight: () => <SyncBadge onPress={() => navRef.navigate('Outbox')} /> }} />
          <Stack.Screen name="Outbox" component={OutboxScreen} options={{ title: 'Sync queue' }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
          <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
          <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'My submissions' }} />
          <Stack.Screen name="Maintenance" component={MaintenanceScreen} options={{ title: 'Maintenance' }} />
          <Stack.Screen name="JobCards" component={JobCardsScreen} options={{ title: 'Job cards' }} />
          <Stack.Screen name="JobCardNew" component={JobCardNewScreen} options={{ title: 'New job card' }} />
          <Stack.Screen name="DailyReading" component={DailyReadingScreen} options={{ title: 'Daily reading' }} />
          <Stack.Screen name="ShiftReport" component={ShiftReportScreen} options={{ title: 'Shift production report' }} />
        </Stack.Navigator>
      </NavigationContainer>
      {locked && signedIn && (
        <View style={{ position: 'absolute', inset: 0 }}>
          <LockScreen onUnlock={unlock} onSignedOut={() => { unlock(); navRef.reset({ index: 0, routes: [{ name: 'Login' }] }); }} />
        </View>
      )}
    </>
  );
}

export default function App() {
  const [initial, setInitial] = useState<'Login' | 'Home' | null>(null);
  useEffect(() => {
    loadSession().then((s) => setInitial(s ? 'Home' : 'Login')).catch(() => setInitial('Login'));
    // A rejected refresh token is the one auth failure the user has to act on — send them back to Login.
    setSessionExpiredHandler(() => { if (navRef.isReady()) navRef.reset({ index: 0, routes: [{ name: 'Login' }] }); });
    const stopSync = startSyncLoop();
    return () => { setSessionExpiredHandler(null); stopSync(); };
  }, []);
  if (!initial) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <SafeAreaProvider>
      <IdleLockProvider enabled>
        <Root initial={initial} />
      </IdleLockProvider>
    </SafeAreaProvider>
  );
}

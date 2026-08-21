import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import LockScreen from './src/screens/LockScreen';
import DailyReadingScreen from './src/screens/DailyReadingScreen';
import { loadSession } from './src/lib/api';
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
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Drillex Ops' }} />
          <Stack.Screen name="DailyReading" component={DailyReadingScreen} options={{ title: 'Daily reading' }} />
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
  useEffect(() => { loadSession().then((s) => setInitial(s ? 'Home' : 'Login')).catch(() => setInitial('Login')); }, []);
  if (!initial) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <SafeAreaProvider>
      <IdleLockProvider enabled>
        <Root initial={initial} />
      </IdleLockProvider>
    </SafeAreaProvider>
  );
}

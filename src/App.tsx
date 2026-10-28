import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SQLiteProvider } from 'expo-sqlite';
import * as LocalAuthentication from 'expo-local-authentication';
import { StatusBar } from 'expo-status-bar';
import { Button, colors, styles } from './components/ui';
import { DB_NAME, migrate } from './db/database';
import type { RootStackParamList } from './navigation';
import CheckInScreen from './screens/CheckInScreen';
import CustomerDetailScreen from './screens/CustomerDetailScreen';
import CustomersScreen from './screens/CustomersScreen';
import RegisterScreen from './screens/RegisterScreen';
import ScanScreen from './screens/ScanScreen';
import TransferScreen from './screens/TransferScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const LOCK_AFTER_MS = 5 * 60 * 1000;

/**
 * The phone holds customer personal data, so the app asks for the phone's fingerprint / PIN on start
 * and after being in the background for a few minutes. Phones without a screen lock are let through.
 */
function useDeviceLock() {
  const [unlocked, setUnlocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const secured = (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
    if (!secured) { setUnlocked(true); return; }
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Car Park' });
    setUnlocked(r.success);
  }, []);

  useEffect(() => {
    unlock();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') backgroundedAt.current = Date.now();
      if (s === 'active' && backgroundedAt.current && Date.now() - backgroundedAt.current > LOCK_AFTER_MS) {
        setUnlocked(false);
        unlock();
      }
    });
    return () => sub.remove();
  }, [unlock]);

  return { unlocked, unlock };
}

function Loading() {
  return <View style={[styles.screen, { justifyContent: 'center' }]}><ActivityIndicator size="large" /></View>;
}

export default function App() {
  const { unlocked, unlock } = useDeviceLock();

  if (!unlocked) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: 24 }]}>
        <Text style={[styles.h2, { textAlign: 'center' }]}>Car Park is locked</Text>
        <Button title="Unlock" onPress={unlock} />
      </View>
    );
  }

  return (
    <Suspense fallback={<Loading />}>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrate} useSuspense>
        <NavigationContainer>
          <StatusBar style="light" />
          <Stack.Navigator
            screenOptions={{ headerStyle: { backgroundColor: colors.primary }, headerTintColor: '#fff' }}
          >
            <Stack.Screen name="CheckIn" component={CheckInScreen} options={{ title: 'Car Park – Check vehicle' }} />
            <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan parking card' }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Register customer' }} />
            <Stack.Screen name="Customers" component={CustomersScreen} options={{ title: 'Customers' }} />
            <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: 'Customer' }} />
            <Stack.Screen name="Transfer" component={TransferScreen} options={{ title: 'Report & transfer' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </SQLiteProvider>
    </Suspense>
  );
}

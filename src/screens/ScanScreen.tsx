// Scans a customer's windscreen QR card and opens the check screen for that vehicle.

import { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, styles } from '../components/ui';
import { getCustomerByCard, parseCardQr } from '../db/database';
import type { ScreenProps } from '../navigation';

export default function ScanScreen({ navigation }: ScreenProps<'Scan'>) {
  const db = useSQLiteContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const handling = useRef(false); // the camera reports the same code many times per second

  const onScanned = async ({ data }: BarcodeScanningResult) => {
    if (handling.current) return;
    handling.current = true;
    const retry = () => { handling.current = false; };

    const cardId = parseCardQr(data);
    if (!cardId) {
      Alert.alert('Not a parking card', 'This QR code is not one of our cards. Search the vehicle number instead.', [{ text: 'OK', onPress: retry }]);
      return;
    }
    const customer = await getCustomerByCard(db, cardId);
    if (!customer) {
      Alert.alert('Card not valid', 'This card was replaced or is unknown on this phone. Search the vehicle number instead, or import the latest data.',
        [{ text: 'OK', onPress: retry }]);
      return;
    }
    navigation.popTo('CheckIn', { vehicleNo: customer.vehicle_no, scanned: true });
  };

  if (!permission) return <View style={styles.screen} />;

  if (!permission.granted) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: 24 }]}>
        <Text style={[styles.h2, { textAlign: 'center' }]}>Camera permission is needed to scan parking cards.</Text>
        <Button title="Allow camera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <View style={{ padding: 16, backgroundColor: '#000' }}>
        <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 8 }}>
          Point the camera at the QR card behind the windscreen.
        </Text>
        <Button title={torch ? 'Torch off' : 'Torch on'} variant="secondary" onPress={() => setTorch(!torch)} />
      </View>
    </View>
  );
}

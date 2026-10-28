import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Field, styles } from '../components/ui';
import { getCustomer, saveCustomer } from '../db/database';
import { MONTHLY_FEE, displayVehicleNo, normalizeVehicleNo, rupees } from '../lib/format';
import type { ScreenProps } from '../navigation';

export default function RegisterScreen({ navigation, route }: ScreenProps<'Register'>) {
  const db = useSQLiteContext();
  const editing = !!route.params?.edit;
  const [vehicleNo, setVehicleNo] = useState(route.params?.vehicleNo ? displayVehicleNo(route.params.vehicleNo) : '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: editing ? 'Edit customer' : 'Register customer' });
    if (!editing || !route.params?.vehicleNo) return;
    getCustomer(db, route.params.vehicleNo).then((c) => {
      if (!c) return;
      setName(c.name); setPhone(c.phone); setAddress(c.address); setVehicleType(c.vehicle_type); setActive(c.active === 1);
    });
  }, [db, editing, navigation, route.params?.vehicleNo]);

  const save = async () => {
    const v = normalizeVehicleNo(vehicleNo);
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    if (v.length < 3 || v.length > 12) return Alert.alert('Check vehicle number', 'Enter a valid vehicle number.');
    if (!name.trim()) return Alert.alert('Name required', 'Enter the customer name.');
    if (cleanPhone && !/^\+?\d{9,15}$/.test(cleanPhone)) return Alert.alert('Check phone', 'Enter a valid phone number.');

    if (!editing && (await getCustomer(db, v))) {
      return Alert.alert('Already registered', `${displayVehicleNo(v)} is already a registered customer.`);
    }
    await saveCustomer(db, {
      vehicle_no: v,
      name: name.trim().slice(0, 100),
      phone: cleanPhone,
      address: address.trim().slice(0, 300),
      vehicle_type: vehicleType.trim().slice(0, 30),
      active: active ? 1 : 0,
    }, !editing);
    navigation.replace('CustomerDetail', { vehicleNo: v });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Field label="Vehicle number *" value={vehicleNo} onChangeText={setVehicleNo} editable={!editing}
        autoCapitalize="characters" autoCorrect={false} placeholder="CAB-1234" />
      <Field label="Customer name *" value={name} onChangeText={setName} maxLength={100} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="07XXXXXXXX" />
      <Field label="Address" value={address} onChangeText={setAddress} multiline maxLength={300} />
      <Field label="Vehicle type" value={vehicleType} onChangeText={setVehicleType} maxLength={30} placeholder="Car / Van / Three-wheeler" />
      {editing && (
        <View style={[styles.row, { alignItems: 'center', marginBottom: 12 }]}>
          <Text style={styles.label}>Active monthly customer</Text>
          <Switch value={active} onValueChange={setActive} />
        </View>
      )}
      {!editing && <Text style={styles.muted}>Monthly fee: {rupees(MONTHLY_FEE)}, payable on or before the 10th.</Text>}
      <Button title={editing ? 'Save changes' : 'Register'} onPress={() => save().catch((e) => Alert.alert('Error', String(e)))} />
    </ScrollView>
  );
}

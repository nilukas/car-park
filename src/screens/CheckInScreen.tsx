// Main screen: a car arrives, the owner types the number plate and sees what to do.

import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { Badge, Button, Card, Field, Row, colors, styles } from '../components/ui';
import {
  Customer, Payment, getCustomer, getPaymentForMonth, recordCasualParking, recordPayment,
} from '../db/database';
import {
  CASUAL_FEE, DUE_DAY, MONTHLY_FEE, currentMonthStatus, displayVehicleNo, monthKey, monthLabel,
  normalizeVehicleNo, rupees,
} from '../lib/format';
import { casualReceipt, monthlyReceipt, printReceipt, shareReceipt, ReceiptData } from '../lib/receipt';
import type { ScreenProps } from '../navigation';

type Lookup =
  | { kind: 'registered'; customer: Customer; payment: Payment | null }
  | { kind: 'unregistered'; vehicleNo: string };

export default function CheckInScreen({ navigation, route }: ScreenProps<'CheckIn'>) {
  const db = useSQLiteContext();
  const [plate, setPlate] = useState('');
  const [scanned, setScanned] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const month = monthKey();

  // Coming back from the scan screen with a vehicle found by its QR card.
  useEffect(() => {
    const p = route.params;
    if (!p?.vehicleNo) return;
    setPlate(displayVehicleNo(p.vehicleNo));
    setScanned(!!p.scanned);
    navigation.setParams({ vehicleNo: undefined, scanned: undefined });
  }, [navigation, route.params]);

  const search = useCallback(async (text: string) => {
    const vehicleNo = normalizeVehicleNo(text);
    setLastReceipt(null);
    if (!vehicleNo) { setLookup(null); return; }
    const customer = await getCustomer(db, vehicleNo);
    if (customer) {
      setLookup({ kind: 'registered', customer, payment: await getPaymentForMonth(db, vehicleNo, month) });
    } else {
      setLookup({ kind: 'unregistered', vehicleNo });
    }
  }, [db, month]);

  // Refresh after returning from registration / payment screens.
  useFocusEffect(useCallback(() => { if (plate) search(plate); }, [plate, search]));

  const chargeCasual = (vehicleNo: string) => {
    Alert.alert('Charge parking fee', `Collect ${rupees(CASUAL_FEE)} from ${displayVehicleNo(vehicleNo)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Collected',
        onPress: async () => setLastReceipt(casualReceipt(await recordCasualParking(db, vehicleNo))),
      },
    ]);
  };

  const collectMonthly = (customer: Customer) => {
    Alert.alert('Monthly fee', `Collect ${rupees(MONTHLY_FEE)} for ${monthLabel(month)} from ${customer.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Collected',
        onPress: async () => {
          const payment = await recordPayment(db, customer.vehicle_no, month, MONTHLY_FEE);
          setLookup({ kind: 'registered', customer, payment });
          setLastReceipt(monthlyReceipt(payment));
        },
      },
    ]);
  };

  const run = (fn: () => Promise<void>) => () => fn().catch((e) => Alert.alert('Error', String(e?.message ?? e)));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button title="Scan QR card" onPress={() => navigation.navigate('Scan')} style={{ marginTop: 0, marginBottom: 12 }} />
      <Field
        label="…or type the vehicle number"
        placeholder="e.g. CAB-1234"
        autoCapitalize="characters"
        autoCorrect={false}
        value={plate}
        onChangeText={(t) => { setPlate(t); setScanned(false); search(t); }}
        style={{ fontSize: 24, fontWeight: '700', letterSpacing: 1 }}
      />

      {lookup?.kind === 'registered' && (() => {
        const { customer, payment } = lookup;
        const status = currentMonthStatus(!!payment);
        return (
          <Card>
            {scanned && (
              <Text style={{ color: colors.amber, fontWeight: '700', marginBottom: 6 }}>
                Scanned card: check the car's number plate is {displayVehicleNo(customer.vehicle_no)}
              </Text>
            )}
            <Text style={[styles.h2, scanned && { fontSize: 26 }]}>{displayVehicleNo(customer.vehicle_no)} — {customer.name}</Text>
            {customer.active === 0 ? (
              <Badge kind="inactive" text="REGISTRATION DEACTIVATED" />
            ) : status === 'paid' ? (
              <Badge kind="paid" text={`PAID for ${monthLabel(month)}`} />
            ) : status === 'due' ? (
              <Badge kind="due" text={`NOT PAID — due by ${DUE_DAY}th`} />
            ) : (
              <Badge kind="overdue" text={`OVERDUE — ${monthLabel(month)} not paid`} />
            )}
            <View style={{ height: 8 }} />
            <Row label="Phone" value={customer.phone || '-'} />
            {payment && <Row label="Receipt" value={payment.receipt_no} />}
            {status !== 'paid' && customer.active === 1 && (
              <>
                <Text style={[styles.muted, { marginTop: 8 }]}>
                  Tell the customer: "You have not paid this month's fee of {rupees(MONTHLY_FEE)}."
                </Text>
                <Button title={`Collect ${rupees(MONTHLY_FEE)} now`} variant="success" onPress={() => collectMonthly(customer)} />
              </>
            )}
            {customer.active === 0 && (
              <Button title={`Charge ${rupees(CASUAL_FEE)} (one time)`} variant="success" onPress={() => chargeCasual(customer.vehicle_no)} />
            )}
            <Button title="View details & history" variant="secondary"
              onPress={() => navigation.navigate('CustomerDetail', { vehicleNo: customer.vehicle_no })} />
          </Card>
        );
      })()}

      {lookup?.kind === 'unregistered' && (
        <Card>
          <Text style={styles.h2}>{displayVehicleNo(lookup.vehicleNo)}</Text>
          <Badge kind="casual" text="NOT REGISTERED" />
          <Button title={`Charge ${rupees(CASUAL_FEE)} & give receipt`} variant="success"
            onPress={() => chargeCasual(lookup.vehicleNo)} />
          <Button title="Register as monthly customer" variant="secondary"
            onPress={() => navigation.navigate('Register', { vehicleNo: lookup.vehicleNo })} />
        </Card>
      )}

      {lastReceipt && (
        <Card>
          <Text style={styles.h2}>Receipt {lastReceipt.receiptNo}</Text>
          <Row label="Amount" value={rupees(lastReceipt.amount)} />
          <Row label="For" value={lastReceipt.description} />
          <Button title="Print receipt" onPress={run(() => printReceipt(lastReceipt))} />
          <Button title="Share receipt (WhatsApp / SMS)" variant="secondary" onPress={run(() => shareReceipt(lastReceipt))} />
        </Card>
      )}

      <View style={{ height: 16 }} />
      <Button title="Register new customer" variant="secondary" onPress={() => navigation.navigate('Register')} />
      <Button title="Customers & payments" variant="secondary" onPress={() => navigation.navigate('Customers')} />
      <Button title="Today's report & transfer data" variant="secondary" onPress={() => navigation.navigate('Transfer')} />
    </ScrollView>
  );
}

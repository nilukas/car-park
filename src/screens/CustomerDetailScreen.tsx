import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { Badge, Button, Card, Row, colors, styles } from '../components/ui';
import {
  CasualParking, Customer, Payment, deletePayment, getCasualParkingsForVehicle, getCustomer, getPayments,
  recordPayment,
} from '../db/database';
import {
  DUE_DAY, MONTHLY_FEE, addMonths, currentMonthStatus, displayVehicleNo, formatDateTime, monthKey, monthLabel,
  rupees,
} from '../lib/format';
import { monthlyReceipt, printReceipt, shareReceipt } from '../lib/receipt';
import type { ScreenProps } from '../navigation';

export default function CustomerDetailScreen({ navigation, route }: ScreenProps<'CustomerDetail'>) {
  const db = useSQLiteContext();
  const { vehicleNo } = route.params;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [casual, setCasual] = useState<CasualParking[]>([]);
  const [payMonth, setPayMonth] = useState(monthKey());

  const load = useCallback(async () => {
    setCustomer(await getCustomer(db, vehicleNo));
    setPayments(await getPayments(db, vehicleNo));
    setCasual(await getCasualParkingsForVehicle(db, vehicleNo));
  }, [db, vehicleNo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!customer) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.h2}>{displayVehicleNo(vehicleNo)} is not registered.</Text>
        {casual.map((c) => <Row key={c.id} label={formatDateTime(c.parked_at)} value={rupees(c.amount)} />)}
      </ScrollView>
    );
  }

  const thisMonth = monthKey();
  const paidMonths = new Set(payments.map((p) => p.month));
  const status = currentMonthStatus(paidMonths.has(thisMonth));
  const alreadyPaid = paidMonths.has(payMonth);

  const collect = () => {
    Alert.alert('Record payment', `Collect ${rupees(MONTHLY_FEE)} for ${monthLabel(payMonth)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Collected',
        onPress: async () => {
          try {
            const p = await recordPayment(db, vehicleNo, payMonth, MONTHLY_FEE);
            await load();
            Alert.alert('Payment saved', `Receipt ${p.receipt_no}`, [
              { text: 'Done' },
              { text: 'Print', onPress: () => printReceipt(monthlyReceipt(p)) },
              { text: 'Share', onPress: () => shareReceipt(monthlyReceipt(p)) },
            ]);
          } catch (e: any) {
            Alert.alert('Error', String(e?.message ?? e));
          }
        },
      },
    ]);
  };

  const removePayment = (p: Payment) => {
    Alert.alert('Delete payment?', `Remove ${monthLabel(p.month)} payment (${p.receipt_no})? Only do this to fix a mistake.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deletePayment(db, p.id); await load(); } },
    ]);
  };

  // Months since registration that have no payment (excluding the current month while still within grace period).
  const missed: string[] = [];
  if (customer.active === 1) {
    for (let m = monthKey(new Date(customer.registered_at)); m <= thisMonth; m = addMonths(m, 1)) {
      if (!paidMonths.has(m) && !(m === thisMonth && status === 'due')) missed.push(m);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={[styles.h2, { fontSize: 22 }]}>{displayVehicleNo(customer.vehicle_no)}</Text>
        {customer.active === 0
          ? <Badge kind="inactive" text="INACTIVE" />
          : <Badge kind={status} text={status === 'paid' ? `PAID — ${monthLabel(thisMonth)}`
              : status === 'due' ? `DUE by ${DUE_DAY}th ${monthLabel(thisMonth)}` : `OVERDUE — ${monthLabel(thisMonth)}`} />}
        <View style={{ height: 8 }} />
        <Row label="Name" value={customer.name} />
        <Row label="Phone" value={customer.phone || '-'} />
        <Row label="Address" value={customer.address || '-'} />
        <Row label="Vehicle type" value={customer.vehicle_type || '-'} />
        <Row label="Registered" value={formatDateTime(customer.registered_at)} />
        {missed.length > 0 && (
          <Text style={{ color: colors.red, marginTop: 8, fontWeight: '600' }}>
            Unpaid: {missed.map(monthLabel).join(', ')}
          </Text>
        )}
        <Button title="Edit customer" variant="secondary"
          onPress={() => navigation.navigate('Register', { vehicleNo, edit: true })} />
      </Card>

      {customer.active === 1 && (
        <Card>
          <Text style={styles.h2}>Record monthly payment</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Button title="◀" variant="secondary" onPress={() => setPayMonth(addMonths(payMonth, -1))} style={{ width: 56 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{monthLabel(payMonth)}</Text>
            <Button title="▶" variant="secondary" onPress={() => setPayMonth(addMonths(payMonth, 1))} style={{ width: 56 }} />
          </View>
          <Button title={alreadyPaid ? 'Already paid' : `Collect ${rupees(MONTHLY_FEE)}`} variant="success"
            disabled={alreadyPaid} onPress={collect} />
        </Card>
      )}

      <Card>
        <Text style={styles.h2}>Payment history</Text>
        {payments.length === 0 && <Text style={styles.muted}>No payments yet.</Text>}
        {payments.map((p) => (
          <View key={p.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingVertical: 8 }}>
            <Row label={monthLabel(p.month)} value={rupees(p.amount)} />
            <Text style={styles.muted}>{p.receipt_no} · paid {formatDateTime(p.paid_at)}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Print" variant="secondary" style={{ flex: 1 }} onPress={() => printReceipt(monthlyReceipt(p))} />
              <Button title="Share" variant="secondary" style={{ flex: 1 }} onPress={() => shareReceipt(monthlyReceipt(p))} />
              <Button title="Delete" variant="danger" style={{ flex: 1 }} onPress={() => removePayment(p)} />
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

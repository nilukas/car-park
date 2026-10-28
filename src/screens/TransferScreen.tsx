// Daily report plus moving data between phones without any cloud database:
// export creates a JSON file and opens Android's share sheet (Bluetooth, Gmail, WhatsApp, Quick Share…);
// import picks that file on the other phone and merges it.

import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Button, Card, Row, colors, styles } from '../components/ui';
import { Customer, DaySummary, getDaySummary, getUnpaidCustomers } from '../db/database';
import { buildExport, mergeImport, parseExport } from '../db/transfer';
import { DUE_DAY, dayKey, displayVehicleNo, formatDateTime, monthKey, monthLabel, rupees } from '../lib/format';

export default function TransferScreen() {
  const db = useSQLiteContext();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [unpaid, setUnpaid] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setSummary(await getDaySummary(db));
    setUnpaid(await getUnpaidCustomers(db, monthKey()));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exportData = async () => {
    setBusy(true);
    try {
      const data = await buildExport(db);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const file = new File(Paths.cache, `carpark-backup-${stamp}.json`);
      file.create({ overwrite: true });
      await file.write(JSON.stringify(data));
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Send car park data' });
    } catch (e: any) {
      Alert.alert('Export failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const importData = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'application/octet-stream', '*/*'], copyToCacheDirectory: true });
    if (picked.canceled) return;
    setBusy(true);
    try {
      const data = parseExport(await new File(picked.assets[0].uri).text());
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Import data?',
          `File exported ${formatDateTime(data.exported_at)}\n${data.customers.length} customers, ${data.payments.length} monthly payments, ${data.casual_parkings.length} one-time parkings.\n\nData will be merged with this phone. Nothing on this phone is deleted.`,
          [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Import', onPress: () => resolve(true) }],
        ),
      );
      if (!ok) return;
      const r = await mergeImport(db, data);
      await load();
      Alert.alert('Import complete',
        `New customers: ${r.customersAdded}\nUpdated customers: ${r.customersUpdated}\nNew monthly payments: ${r.paymentsAdded}\nNew one-time parkings: ${r.casualAdded}`
        + (r.skipped ? `\nSkipped invalid records: ${r.skipped}` : ''));
    } catch (e: any) {
      Alert.alert('Import failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.h2}>Today ({dayKey()})</Text>
        <Row label={`One-time parkings (${summary?.casualCount ?? 0})`} value={rupees(summary?.casualTotal ?? 0)} />
        <Row label={`Monthly fees (${summary?.monthlyCount ?? 0})`} value={rupees(summary?.monthlyTotal ?? 0)} />
        <View style={{ borderTopWidth: 1, borderColor: colors.border, marginTop: 6, paddingTop: 6 }}>
          <Row label="Total collected" value={rupees((summary?.casualTotal ?? 0) + (summary?.monthlyTotal ?? 0))} />
        </View>
      </Card>

      <Card>
        <Text style={styles.h2}>Not paid for {monthLabel(monthKey())} ({unpaid.length})</Text>
        <Text style={[styles.muted, { marginBottom: 6 }]}>Due on or before the {DUE_DAY}th.</Text>
        {unpaid.slice(0, 30).map((c) => (
          <Row key={c.vehicle_no} label={displayVehicleNo(c.vehicle_no)} value={`${c.name}${c.phone ? ` · ${c.phone}` : ''}`} />
        ))}
        {unpaid.length > 30 && <Text style={styles.muted}>…and {unpaid.length - 30} more (see Customers screen).</Text>}
      </Card>

      <Card>
        <Text style={styles.h2}>Transfer to another phone</Text>
        <Text style={[styles.muted, { marginBottom: 6 }]}>
          1. On this phone tap Export and send the file by Bluetooth, Quick Share, email or WhatsApp.{'\n'}
          2. On the other phone save the file, open this screen and tap Import.{'\n'}
          The file contains customer names and phone numbers — only send it to your own phones.
        </Text>
        <Button title="Export & send data" onPress={exportData} disabled={busy} />
        <Button title="Import data file" variant="secondary" onPress={importData} disabled={busy} />
      </Card>
    </ScrollView>
  );
}

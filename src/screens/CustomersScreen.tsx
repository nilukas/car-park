import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { Badge, Button, Field, colors, styles } from '../components/ui';
import { Customer, searchCustomers } from '../db/database';
import { currentMonthStatus, displayVehicleNo } from '../lib/format';
import type { ScreenProps } from '../navigation';

type Item = Customer & { paid_this_month: number };
type Filter = 'all' | 'unpaid';

export default function CustomersScreen({ navigation }: ScreenProps<'Customers'>) {
  const db = useSQLiteContext();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async (q: string) => {
    setItems(await searchCustomers(db, q));
  }, [db]);

  useFocusEffect(useCallback(() => { load(text); }, [load, text]));

  const shown = filter === 'unpaid' ? items.filter((c) => c.active === 1 && !c.paid_this_month) : items;

  return (
    <View style={styles.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Field label="Search by vehicle, name or phone" value={text} onChangeText={(t) => { setText(t); load(t); }}
          autoCorrect={false} autoCapitalize="characters" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={`All (${items.length})`} variant={filter === 'all' ? 'primary' : 'secondary'}
            onPress={() => setFilter('all')} style={{ flex: 1 }} />
          <Button title="Not paid this month" variant={filter === 'unpaid' ? 'primary' : 'secondary'}
            onPress={() => setFilter('unpaid')} style={{ flex: 1 }} />
        </View>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(c) => c.vehicle_no}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<Text style={styles.muted}>No customers found.</Text>}
        renderItem={({ item }) => {
          const status = currentMonthStatus(!!item.paid_this_month);
          return (
            <Pressable
              onPress={() => navigation.navigate('CustomerDetail', { vehicleNo: item.vehicle_no })}
              style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
            >
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{displayVehicleNo(item.vehicle_no)}</Text>
                <Text style={styles.muted}>{item.name}{item.phone ? ` · ${item.phone}` : ''}</Text>
              </View>
              {item.active === 0
                ? <Badge kind="inactive" text="Inactive" />
                : <Badge kind={status} text={status === 'paid' ? 'Paid' : status === 'due' ? 'Due' : 'Overdue'} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

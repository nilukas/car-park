import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  CheckIn: { vehicleNo?: string; scanned?: boolean } | undefined;
  Scan: undefined;
  Register: { vehicleNo?: string; edit?: boolean } | undefined;
  Customers: undefined;
  CustomerDetail: { vehicleNo: string };
  Transfer: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

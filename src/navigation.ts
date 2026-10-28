import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  CheckIn: undefined;
  Register: { vehicleNo?: string; edit?: boolean } | undefined;
  Customers: undefined;
  CustomerDetail: { vehicleNo: string };
  Transfer: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

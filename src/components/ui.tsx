import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

export const colors = {
  bg: '#F4F6F8',
  card: '#FFFFFF',
  text: '#1B1F24',
  muted: '#5F6B7A',
  border: '#D5DBE1',
  primary: '#1565C0',
  green: '#2E7D32',
  greenBg: '#E8F5E9',
  amber: '#B26A00',
  amberBg: '#FFF4E0',
  red: '#C62828',
  redBg: '#FDECEA',
  grey: '#455A64',
  greyBg: '#ECEFF1',
};

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  const bg = { primary: colors.primary, success: colors.green, danger: colors.red, secondary: colors.card }[variant];
  const fg = variant === 'secondary' ? colors.primary : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.primary },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.style]} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const badgeColors = {
  paid: [colors.green, colors.greenBg],
  due: [colors.amber, colors.amberBg],
  overdue: [colors.red, colors.redBg],
  casual: [colors.grey, colors.greyBg],
  inactive: [colors.grey, colors.greyBg],
} as const;

export function Badge({ kind, text }: { kind: keyof typeof badgeColors; text: string }) {
  const [fg, bg] = badgeColors[kind];
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: fg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  muted: { color: colors.muted },
  button: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', marginVertical: 6 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  label: { color: colors.muted, marginBottom: 4, fontWeight: '600' },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text,
  },
  card: {
    backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  rowLabel: { color: colors.muted },
  rowValue: { color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontWeight: '700' },
});

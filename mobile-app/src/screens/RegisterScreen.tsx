import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '@/contexts/AuthContext';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/theme';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

// ตรงกับ RegisterDto ฝั่ง backend: email ต้องถูกต้อง, password อย่างน้อย 8 ตัวอักษร
function validate(email: string, password: string, confirm: string): string | null {
  if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) return 'กรุณากรอกอีเมลให้ถูกต้อง';
  if (password.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
  if (password !== confirm) return 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
  return null;
}

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    const validationError = validate(email, password, confirm);
    if (validationError) {
      Alert.alert('ตรวจสอบข้อมูล', validationError);
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, inviteCode.trim() || undefined);
    } catch (err) {
      Alert.alert('สมัครสมาชิกไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>สร้างบัญชีใหม่</Text>
          <Text style={styles.subtitle}>
            ผู้ใช้คนแรกของระบบจะได้สิทธิ์ admin อัตโนมัติ คนถัดไปเป็นผู้ใช้ทั่วไป
          </Text>
        </View>

        <TextField
          label="อีเมล"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="รหัสผ่าน"
          value={password}
          onChangeText={setPassword}
          placeholder="อย่างน้อย 8 ตัวอักษร"
          secureTextEntry
          autoCapitalize="none"
        />
        <TextField
          label="ยืนยันรหัสผ่าน"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="พิมพ์รหัสผ่านอีกครั้ง"
          secureTextEntry
          autoCapitalize="none"
        />

        <TextField
          label="รหัสเชิญ (ถ้าเซิร์ฟเวอร์กำหนด)"
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="ขอรหัสจากผู้ดูแลระบบ"
          autoCapitalize="none"
        />

        <Button title="สมัครสมาชิก" onPress={handleRegister} loading={loading} style={styles.submit} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>มีบัญชีอยู่แล้ว?</Text>
          <Text style={styles.link} onPress={() => navigation.navigate('Login')}>
            {' '}เข้าสู่ระบบ
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  header: { marginBottom: spacing.xl },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '700', marginBottom: spacing.xs },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  submit: { marginTop: spacing.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.textSecondary },
  link: { color: colors.primary, fontWeight: '600' },
});

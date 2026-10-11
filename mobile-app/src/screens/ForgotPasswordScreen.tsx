import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { authApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/theme';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

/** ลืมรหัสผ่าน 2 ขั้น: (1) ขอรหัส 8 หลักทางอีเมล (2) กรอกรหัส + ตั้งรหัสผ่านใหม่ */
export function ForgotPasswordScreen({ route, navigation }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestCode() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert('อีเมลไม่ถูกต้อง', 'กรุณากรอกอีเมลที่ใช้สมัคร');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setStep(2);
    } catch (err) {
      Alert.alert('ส่งรหัสไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitReset() {
    if (!/^\d{8}$/.test(code.trim())) {
      Alert.alert('รหัสไม่ถูกต้อง', 'รหัสยืนยันมี 8 หลัก (ตัวเลข)');
      return;
    }
    if (password.length < 8) {
      Alert.alert('รหัสผ่านสั้นไป', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (password !== confirm) {
      Alert.alert('ไม่ตรงกัน', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(email.trim(), code.trim(), password);
      Alert.alert('สำเร็จ', 'ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย', [
        { text: 'ตกลง', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (err) {
      Alert.alert('ไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>ลืมรหัสผ่าน</Text>
          <Text style={styles.subtitle}>
            {step === 1
              ? 'กรอกอีเมลที่ใช้สมัคร เราจะส่งรหัสยืนยัน 8 หลักไปให้ (หมดอายุใน 30 นาที)'
              : `ส่งรหัสไปที่ ${email.trim()} แล้ว (ถ้าอีเมลนี้มีในระบบ) กรอกรหัสและตั้งรหัสผ่านใหม่`}
          </Text>
        </View>

        {step === 1 ? (
          <>
            <TextField
              label="อีเมล"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Button title="ส่งรหัสยืนยัน" onPress={requestCode} loading={loading} />
          </>
        ) : (
          <>
            <TextField label="รหัสยืนยัน 8 หลัก" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={8} />
            <TextField label="รหัสผ่านใหม่" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            <TextField label="ยืนยันรหัสผ่านใหม่" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
            <Button title="ตั้งรหัสผ่านใหม่" onPress={submitReset} loading={loading} />
            <Text style={styles.link} onPress={() => setStep(1)}>
              ขอรหัสใหม่
            </Text>
          </>
        )}

        <Text style={styles.link} onPress={() => navigation.navigate('Login')}>
          กลับไปเข้าสู่ระบบ
        </Text>
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
  link: { color: colors.primary, fontWeight: '600', textAlign: 'center', marginTop: spacing.lg },
});

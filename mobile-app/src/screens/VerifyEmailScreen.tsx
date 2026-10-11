import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { authApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/theme';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

/** ยืนยันอีเมลด้วยรหัส 8 หลักที่ส่งไปทางอีเมลหลังสมัคร */
export function VerifyEmailScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!/^\d{8}$/.test(code.trim())) {
      Alert.alert('รหัสไม่ถูกต้อง', 'รหัสยืนยันมี 8 หลัก (ตัวเลข)');
      return;
    }
    setLoading(true);
    try {
      await authApi.verifyEmail(email, code.trim());
      Alert.alert('ยืนยันแล้ว', 'ยืนยันอีเมลสำเร็จ เข้าสู่ระบบได้เลย', [
        { text: 'ตกลง', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (err) {
      Alert.alert('ไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    try {
      await authApi.resendVerification(email);
      Alert.alert('ส่งแล้ว', 'ส่งรหัสใหม่ไปที่อีเมลแล้ว (ขอได้ทุก 1 นาที)');
    } catch (err) {
      Alert.alert('ไม่สำเร็จ', extractErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>ยืนยันอีเมล</Text>
          <Text style={styles.subtitle}>เราส่งรหัส 8 หลักไปที่ {email} (หมดอายุใน 30 นาที) ตรวจในกล่องจดหมายและโฟลเดอร์สแปมด้วย</Text>
        </View>
        <TextField label="รหัสยืนยัน 8 หลัก" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={8} />
        <Button title="ยืนยัน" onPress={submit} loading={loading} />
        <Text style={styles.link} onPress={resend}>
          ส่งรหัสใหม่
        </Text>
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

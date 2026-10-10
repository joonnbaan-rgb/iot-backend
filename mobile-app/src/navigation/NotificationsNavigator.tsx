import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { NotificationSettingsScreen } from '@/screens/NotificationSettingsScreen';
import { colors } from '@/theme';
import type { NotificationsStackParamList } from './types';

const Stack = createNativeStackNavigator<NotificationsStackParamList>();

export function NotificationsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="NotificationsList" component={NotificationsScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ title: 'ตั้งค่าการแจ้งเตือน' }}
      />
    </Stack.Navigator>
  );
}

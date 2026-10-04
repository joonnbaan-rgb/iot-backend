import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DevicesListScreen } from '@/screens/DevicesListScreen';
import { DeviceDetailScreen } from '@/screens/DeviceDetailScreen';
import { AddDeviceScreen } from '@/screens/AddDeviceScreen';
import { colors } from '@/theme';
import type { DevicesStackParamList } from './types';

const Stack = createNativeStackNavigator<DevicesStackParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.textPrimary,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

export function DevicesNavigator() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="DevicesList" component={DevicesListScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="DeviceDetail"
        component={DeviceDetailScreen}
        options={({ route }) => ({ title: route.params.deviceName })}
      />
      <Stack.Screen name="AddDevice" component={AddDeviceScreen} options={{ title: 'เพิ่มอุปกรณ์' }} />
    </Stack.Navigator>
  );
}

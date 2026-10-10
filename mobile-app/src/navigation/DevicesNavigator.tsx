import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DevicesListScreen } from '@/screens/DevicesListScreen';
import { DeviceDetailScreen } from '@/screens/DeviceDetailScreen';
import { AddDeviceScreen } from '@/screens/AddDeviceScreen';
import { EditDeviceScreen } from '@/screens/EditDeviceScreen';
import { GroupsScreen } from '@/screens/GroupsScreen';
import { GroupEditScreen } from '@/screens/GroupEditScreen';
import { FloorPlanScreen } from '@/screens/FloorPlanScreen';
import { SitesScreen } from '@/screens/SitesScreen';
import { SiteDetailScreen } from '@/screens/SiteDetailScreen';
import { SharingScreen } from '@/screens/SharingScreen';
import { ShareCreateScreen } from '@/screens/ShareCreateScreen';
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
      <Stack.Screen name="EditDevice" component={EditDeviceScreen} options={{ title: 'แก้ไขอุปกรณ์' }} />
      <Stack.Screen name="Groups" component={GroupsScreen} options={{ title: 'กลุ่มอุปกรณ์' }} />
      <Stack.Screen name="GroupEdit" component={GroupEditScreen} options={{ title: 'กลุ่ม' }} />
      <Stack.Screen name="FloorPlan" component={FloorPlanScreen} options={{ title: 'แผนผังอุปกรณ์' }} />
      <Stack.Screen name="Sites" component={SitesScreen} options={{ title: 'ไซต์' }} />
      <Stack.Screen name="SiteDetail" component={SiteDetailScreen} options={{ title: 'ไซต์' }} />
      <Stack.Screen name="Sharing" component={SharingScreen} options={{ title: 'การแชร์' }} />
      <Stack.Screen name="ShareCreate" component={ShareCreateScreen} options={{ title: 'แชร์อุปกรณ์' }} />
    </Stack.Navigator>
  );
}

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { DevicesNavigator } from './DevicesNavigator';
import { NotificationsNavigator } from './NotificationsNavigator';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { colors } from '@/theme';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => {
          const iconName =
            route.name === 'DevicesTab'
              ? 'hardware-chip-outline'
              : route.name === 'NotificationsTab'
                ? 'notifications-outline'
                : 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="DevicesTab" component={DevicesNavigator} options={{ title: 'อุปกรณ์' }} />
      <Tab.Screen name="NotificationsTab" component={NotificationsNavigator} options={{ title: 'แจ้งเตือน' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'บัญชี' }} />
    </Tab.Navigator>
  );
}

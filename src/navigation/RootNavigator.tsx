import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import HistoryScreen from '../screens/HistoryScreen';
import InventoryScreen from '../screens/InventoryScreen';
import ProductsScreen from '../screens/ProductsScreen';
import SalesScreen from '../screens/SalesScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import { useAuth } from '../lib/auth';
import { SettingsStack } from './SettingsStack';
import { colors } from '../theme';

export type RootTabParamList = {
  Sales: undefined;
  Inventory: undefined;
  Products: undefined;
  History: undefined;
  Settings: undefined;
  Attendance: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Sales: 'cash-outline',
  Inventory: 'cube-outline',
  Products: 'fast-food-outline',
  History: 'time-outline',
  Settings: 'settings-outline',
  Attendance: 'finger-print-outline',
};

function buildTabsFor(role: 'owner' | 'manager' | 'cashier'): (keyof RootTabParamList)[] {
  switch (role) {
    case 'owner':
      return ['Sales', 'Inventory', 'Products', 'History', 'Settings'];
    case 'manager':
      return ['Sales', 'Inventory', 'Products', 'History', 'Settings'];
    case 'cashier':
      return ['Sales', 'Inventory', 'History', 'Attendance', 'Settings'];
  }
}

export function RootNavigator() {
  const { profile } = useAuth();
  const tabs = buildTabsFor(profile?.role ?? 'cashier');

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name]} size={size} color={color} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontWeight: '600' },
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        unmountOnBlur: true,
      })}
    >
      <Tab.Screen
        name="Sales"
        component={SalesScreen}
        options={{ headerShown: false }}
      />
      {tabs.includes('Inventory') && (
        <Tab.Screen name="Inventory" component={InventoryScreen} options={{ title: 'Inventory' }} />
      )}
      {tabs.includes('Products') && (
        <Tab.Screen name="Products" component={ProductsScreen} options={{ title: 'Products' }} />
      )}
      {tabs.includes('History') && (
        <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
      )}
      {tabs.includes('Attendance') && (
        <Tab.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      )}
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
}
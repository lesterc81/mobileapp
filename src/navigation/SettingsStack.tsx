import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import AttendanceScreen from '../screens/AttendanceScreen';
import BranchesScreen from '../screens/BranchesScreen';
import DashboardScreen from '../screens/DashboardScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StaffScreen from '../screens/StaffScreen';
import { colors } from '../theme';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Dashboard: undefined;
  Attendance: undefined;
  Staff: undefined;
  Branches: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontWeight: '800' },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Time clock' }} />
      <Stack.Screen name="Staff" component={StaffScreen} options={{ title: 'Staff' }} />
      <Stack.Screen name="Branches" component={BranchesScreen} options={{ title: 'Branches' }} />
    </Stack.Navigator>
  );
}
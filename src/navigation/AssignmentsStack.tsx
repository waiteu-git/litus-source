import { createNativeStackNavigator } from '@react-navigation/native-stack'
import AssignmentsScreen from '../screens/AssignmentsScreen'
import CollectAssignmentsScreen from '../screens/CollectAssignmentsScreen'
import type { AssignmentsStackParamList } from './types'
import { COLORS } from '../theme'

const Stack = createNativeStackNavigator<AssignmentsStackParamList>()

export default function AssignmentsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.emerald },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="AssignmentsHome" component={AssignmentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CollectAssignments" component={CollectAssignmentsScreen} options={{ title: '課題を収集' }} />
    </Stack.Navigator>
  )
}

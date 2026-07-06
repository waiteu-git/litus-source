import { createNativeStackNavigator } from '@react-navigation/native-stack'
import AssignmentsScreen from '../screens/AssignmentsScreen'
import CollectAssignmentsScreen from '../screens/CollectAssignmentsScreen'
import type { AssignmentsStackParamList } from './types'

const Stack = createNativeStackNavigator<AssignmentsStackParamList>()

export default function AssignmentsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="AssignmentsHome" component={AssignmentsScreen} options={{ title: '課題' }} />
      <Stack.Screen name="CollectAssignments" component={CollectAssignmentsScreen} options={{ title: '課題を収集' }} />
    </Stack.Navigator>
  )
}

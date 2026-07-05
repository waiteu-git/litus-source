import { createNativeStackNavigator } from '@react-navigation/native-stack'
import TimetableScreen from '../screens/TimetableScreen'
import CollectTimetableScreen from '../screens/CollectTimetableScreen'
import type { TimetableStackParamList } from './types'

const Stack = createNativeStackNavigator<TimetableStackParamList>()

export default function TimetableStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="TimetableHome" component={TimetableScreen} options={{ title: '時間割' }} />
      <Stack.Screen name="Collect" component={CollectTimetableScreen} options={{ title: '時間割を収集' }} />
    </Stack.Navigator>
  )
}

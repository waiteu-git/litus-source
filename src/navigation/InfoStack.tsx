import { createNativeStackNavigator } from '@react-navigation/native-stack'
import InfoScreen from '../screens/InfoScreen'
import LinkViewerScreen from '../screens/LinkViewerScreen'
import PdfViewerScreen from '../screens/PdfViewerScreen'
import type { InfoStackParamList } from './types'
import { COLORS } from '../theme'

const Stack = createNativeStackNavigator<InfoStackParamList>()

export default function InfoStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.emerald },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="InfoHome" component={InfoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Link" component={LinkViewerScreen} options={({ route }) => ({ title: route.params.title ?? 'ページ' })} />
      <Stack.Screen name="PdfViewer" component={PdfViewerScreen} options={({ route }) => ({ title: route.params.title ?? 'ファイル' })} />
    </Stack.Navigator>
  )
}

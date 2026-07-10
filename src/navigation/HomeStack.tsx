import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HomeScreen from '../screens/HomeScreen'
import AttendanceScreen from '../screens/AttendanceScreen'
import InfoScreen from '../screens/InfoScreen'
import BulletinListScreen from '../screens/BulletinListScreen'
import LinkViewerScreen from '../screens/LinkViewerScreen'
import PdfViewerScreen from '../screens/PdfViewerScreen'
import SettingsScreen from '../screens/SettingsScreen'
import type { HomeStackParamList } from './types'
import { COLORS } from '../theme'

const Stack = createNativeStackNavigator<HomeStackParamList>()

/**
 * ホームタブのスタック。出席・インフォ・設定をホーム内へ集約する（タブは 時間割/ホーム/課題 の3本）。
 * ScreenHeader を自前描画する画面（Home/Attendance/Info/Settings）は headerShown:false。
 */
export default function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.emerald },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="HomeHome" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Info" component={InfoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Bulletin" component={BulletinListScreen} options={{ title: 'CLASS掲示' }} />
      <Stack.Screen
        name="Link"
        component={LinkViewerScreen}
        options={({ route }) => ({ title: route.params.title ?? 'ページ' })}
      />
      <Stack.Screen
        name="PdfViewer"
        component={PdfViewerScreen}
        options={({ route }) => ({ title: route.params.title ?? 'ファイル' })}
      />
    </Stack.Navigator>
  )
}

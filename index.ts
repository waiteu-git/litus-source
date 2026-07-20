import { registerRootComponent } from 'expo';

import App from './App';
import { registerWidgetTaskHandler } from './src/widget/registerTaskHandler';

// ホーム画面ウィジェットのヘッドレスタスク登録（アプリ停止中も OS から起動されて描画する）。
// registerRootComponent より前に登録する。widgetTaskHandler は AsyncStorage 直読のみで軽量。
// react-native-android-widget への依存は registerTaskHandler.android.ts 側に閉じ込めてある
// （iOS / Expo Go には当該ネイティブモジュールが無く、静的 import すると起動時に落ちるため）。
registerWidgetTaskHandler();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

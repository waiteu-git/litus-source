import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './src/widget/widget-task-handler';

// ホーム画面ウィジェットのヘッドレスタスク登録（アプリ停止中も OS から起動されて描画する）。
// registerRootComponent より前に登録する。widgetTaskHandler は AsyncStorage 直読のみで軽量。
registerWidgetTaskHandler(widgetTaskHandler);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

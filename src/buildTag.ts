/**
 * 開発ビルドの識別タグ。APKファイル名(litus-v1.0.0-vNN.apk)と一致させ、ビルドごとに手で上げる。
 * ホーム画面に常時表示して、どのビルドを実機で見ているか区別できるようにする（開発中のみの目印）。
 * 注意: android/app/build/gradle の versionCode も同時に上げること（上げないとAndroidが「更新」と
 * 認識せず上書きインストールがスキップされ、古いビルドが残る）。build.gradleはgitignoreなので手動。
 */
export const BUILD_TAG = 'v60'

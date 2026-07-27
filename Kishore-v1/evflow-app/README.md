# EVFLOW Android shell

Capacitor WebView wrapper around https://evflow-web.vercel.app (debug-signed, hackathon demo).

Rebuild:
`export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools JAVA_HOME=/opt/homebrew/opt/openjdk@21 && cd android && ./gradlew assembleDebug`
APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

Install: `adb install EVFLOW.apk`, or copy the APK to the phone and open it (enable "Install unknown apps" for your file manager when prompted).

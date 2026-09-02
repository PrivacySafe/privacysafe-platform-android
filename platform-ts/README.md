# PrivacySafe platform for Android

### Starting platform

```mermaid
sequenceDiagram
  participant U as User actions <br> (Android system)
  participant I as InitActivity
  participant App as App GUI component <br> (WebView in Activity)
  participant Srv as CoreRunnerService
  participant Core as CoreRunner <br> JS in JSRunner

  U ->> I : Clicks Launcher icon <br> among apps in Android <br> (main/system task history)
  activate I
  I ->> I : checking and getting <br> permissions
  deactivate I
  I ->> Srv : Start long running service with JSEngine's <br> containing core and non-gui components
  Srv ->> Core : setup core's JSEngine <br> calls init()
  Core ->> Srv : opens ipc port <br> for app component
  activate Core
  Srv ->> App : starts activity, <br> sets port into WebView <br> connects port from core <br> to port from app
  App -->> I : Startup app replaces <br> InitActivity in system <br> task history
  App -> Core : ipc communication starts in connected ports' pipe
  deactivate Core
```

### Activity lifecycle and app component

Android activities have a lifecycle, [described here](https://developer.android.com/guide/components/activities/activity-lifecycle#activity-lifecycle-concepts). The following diagram suggest what we should do between subsystems -- what info passed, and when -- to run platform in Android way on Android.

```mermaid
sequenceDiagram
  participant U as User actions <br> (Android system)
  participant App as App GUI component <br> (WebView in Activity)
  participant Srv as AppGUIComponentConnector <br> inner from JSRunner <br> via CoreRunnerService
  participant Core as CoreRunner <br> JS in JSRunner

  activate Srv
  activate App
  App --> Core : ipc communication starts in connected ports' pipe <br> established when app started

  U ->> App : another activity comes into foreground <br> onPause() is triggered
  App ->> Srv : onPause -> notify that this activity <br> (3NWeb app component) <br> is paused for interactions
  Srv ->> Srv : notification about Activity state gives info <br> in case things are gone, restarted, etc.
  U --> App: Android may kill whole app process <br> (process with activity or whole platform process? <br> If whole platform gets killed, we can't do anything, anyway)
  U ->> App : this activity isn't visible <br> onStop() is triggered
  U --> App: Android may kill whole app process
  App ->> App : we let things be as is, cause acitivity can be reopened any moment <br> Android keeps it in the memory, i.e. in quick to restart/resume state
  U ->> App : navigation to app and other intents trigger: <br> after stop: onRestart() -> onStart() -> onResume() <br> after only pause: onResume()
  App ->> Srv : onResume -> notify that this activity is active

  U ->> App : activity is closed, which is triggering onPause()
  App ->> Srv : onPause -> notify that this activity is paused
  U ->> App : then -> onStop()
  U ->> App : then -> onDestroy()
  App ->> Srv : onDestroy -> notify that this activity is closed <br> break pipe between component and core
  deactivate App

  Srv ->> Core : tell core that component closed <br> break pipe and cleanup
  deactivate Srv

```

Note from reading [Android docs](https://developer.android.com/guide/components/processes-and-threads) we may play with separating different processes, besides multiple threads. This may or may not be useful in contexts of performance, and cleaing/killing things for memory by us and system.


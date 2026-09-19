# expo-observe privacy repro

Minimal reproduction for two bugs found while integrating EAS Observe
(`expo-observe`, `expo-app-metrics`, `expo-eas-client`) into a consent-gated
Expo SDK 57 app.

This repo uses npm. The original bug write-ups this repro supports were
drafted against a pnpm project; nothing here depends on the package manager,
only on the resolved npm package versions below.

## Bug 1: no iOS privacy manifest

`expo-observe`, `expo-app-metrics`, and `expo-eas-client` add iOS native code
that reads and stores device and diagnostic data (MetricKit crash
diagnostics, unhandled JavaScript error records, launch/route timings, the
EAS install identifier) and send it to Expo's servers. None of the three
packages ships a `PrivacyInfo.xcprivacy`, so App Store Connect's Privacy
Report cannot surface their data collection and a developer has to
reconstruct it by reading the Swift sources.

### Steps to reproduce

Platform: iOS (development build and release archive; not Expo Go). Package
manager: npm.

1. Install the three packages in an Expo SDK 57 app: `npx expo install
   expo-observe expo-app-metrics expo-eas-client`, then `npx expo prebuild -p
   ios`.
2. Run `scripts/list-privacy-manifests.sh` from the repo root. It searches
   all three packages for `*.xcprivacy` files and greps their podspecs for
   `xcprivacy`/`resource_bundles` entries. Every section reports `none` (see
   script output below).
3. Inspect the podspecs directly: `node_modules/expo-observe/ios/ExpoObserve.podspec`,
   `node_modules/expo-app-metrics/ios/ExpoAppMetrics.podspec`, and
   `node_modules/expo-eas-client/ios/EASClient.podspec`. None declares a
   `resource_bundles` entry that would carry a privacy manifest.
4. Archive the app and open the Privacy Report in Xcode (Product > Archive >
   Generate Privacy Report): the Expo Observe packages contribute no entries
   although they collect crash data, diagnostic data, and a device
   identifier at runtime. See `node_modules/expo-app-metrics/ios/AppMetricsModule.swift`
   (MetricKit subscription, `clearStoredEntries`), `node_modules/expo-app-metrics/src/installErrorHandler.ts`
   (unhandled-error capture), and `node_modules/expo-observe/ios/Observability.swift`
   (dispatch to Expo's servers).

In 57.0.20 the recording paths are `ios/MetricKitSubscriber.swift`,
`ios/CrashReporting/CrashReport.swift` and `ios/LogEvents/ErrorReport.swift`
(with `src/installErrorHandler.ts` installing the JavaScript error handler on import).

### Expected

Each package declares its collected data types and required-reason API usage
(`UserDefaults`) in a `PrivacyInfo.xcprivacy` bundled through the podspec, as
`expo-updates` and other Expo packages already do.

## Bug 2: `clearStoredEntries` is a no-op on iOS

`expo-app-metrics` starts recording unhandled JavaScript errors and MetricKit
diagnostics the moment the module is imported, independent of
`dispatchingEnabled` (confirmed in `node_modules/expo-observe/ios/Observability.swift:254-256`:
`dispatchingEnabled` is read only inside the dispatch/flush gate, never at
the point entries are recorded). An app that keeps dispatch disabled until
the user consents therefore accumulates records before consent, and the one
API that could discard them, `clearStoredEntries`, is implemented only on
Android.

### Code references (file:line, expo-app-metrics 57.0.20 / expo-observe 57.0.23)

- `node_modules/expo-app-metrics/ios/AppMetricsModule.swift:81-83`: `AsyncFunction("clearStoredEntries") { // no-op }`.
- `node_modules/expo-app-metrics/android/src/main/java/expo/modules/appmetrics/AppMetricsModule.kt:255`: `AsyncFunction("clearStoredEntries") Coroutine { -> sessionManager.clearAllData() }`.
- `node_modules/expo-app-metrics/src/types.ts:525`: the shared `clearStoredEntries(): Promise<void>` type, so the no-op is invisible from the JS/TS surface.
- `node_modules/expo-observe/ios/Observability.swift:254-256`: `dispatchingEnabled` is folded into `shouldDispatch`, checked inside `dispatchMetrics`/`dispatchLogs` (lines 63, 134), not at recording time.
- `node_modules/expo-observe/ios/ObserveAppDelegateSubscriber.swift:7` and `:13`: `applicationWillResignActive` and `applicationWillTerminate` are the two flush triggers referenced in the original draft.

### Steps to reproduce

Platform: iOS (development build and release archive; not Expo Go). Package
manager: npm.

1. Configure Observe with dispatch disabled at launch (consent not yet
   given): `Observe.configure({ dispatchingEnabled: false })` at module
   scope, before mount (see `App.js`).
2. Throw an unhandled JavaScript error before the user answers the consent
   prompt; do not background the app. (`App.js`'s "Throw unhandled error"
   button: `setTimeout(() => { throw new Error('pre-consent error') }, 0)`.)
3. Call `AppMetrics.clearStoredEntries()` on iOS (`App.js`'s
   "clearStoredEntries()" button), then enable dispatch: `Observe.configure({
   dispatchingEnabled: true })` (`App.js`'s "Grant consent" button).
4. Background the app (there is no documented JS API to do this
   programmatically; press the Home button or, in the Simulator,
   Cmd+Shift+H. The "Background me hint" button in `App.js` says so rather
   than inventing a call). The error recorded in step 2 is delivered to EAS
   Observe on `applicationWillResignActive`. On Android, step 3 discards it
   and nothing is delivered.

### Expected

Either `clearStoredEntries` clears the SQLite-backed log and metric rows on
iOS as it does on Android, or `dispatchingEnabled: false` also suppresses
recording, or the package documents that automatic error capture begins at
import time and cannot be cleared on iOS.

## App.js API notes

Built from `node_modules/expo-observe/src/module.ts`, `.../types.ts`, and the
`expo:eas-observe` skill's `setup.md` reference (SDK 56+ surface: `ObserveRoot`,
`useObserve`, `Observe.configure`). All four buttons use only documented,
exported functions:

- `ObserveRoot.wrap(App)`: root HOC, measures Time to First Render.
- `Observe.configure({ dispatchingEnabled })`: the master dispatch switch.
- `AppMetrics.clearStoredEntries()` (from `expo-app-metrics`, also forwarded
  through `Observe.clearStoredEntries()` via the proxy in `module.ts`).
- Unhandled errors are captured automatically by a global `ErrorUtils`
  handler installed on import (`installErrorHandler.ts`); there is no public
  "trigger a test error" function, so the demo throws a real unhandled error
  from a `setTimeout`.
- No public API exists to background the app from JS; the fourth button
  only shows a hint instead of inventing one.

## Script output (`scripts/list-privacy-manifests.sh`)

```
=== expo-observe ===
  resolved version: 57.0.23
  .xcprivacy files:
    none
  podspec xcprivacy references:
    none
  podspec resource_bundles entries:
    none

=== expo-app-metrics ===
  resolved version: 57.0.20
  .xcprivacy files:
    none
  podspec xcprivacy references:
    none
  podspec resource_bundles entries:
    none

=== expo-eas-client ===
  resolved version: 57.0.4
  .xcprivacy files:
    none
  podspec xcprivacy references:
    none
  podspec resource_bundles entries:
    none
```

## Versions

| Package | Resolved version |
|---|---|
| expo | 57.0.24 |
| expo-observe | 57.0.23 |
| expo-app-metrics | 57.0.20 |
| expo-eas-client | 57.0.4 |
| react-native | 0.86.3 |
| react | 19.2.3 |

## Environment (`npx expo-env-info`)

```
expo-env-info 2.1.0 environment info:
  System:
    OS: macOS 26.7
    Shell: 3.2.57 - /bin/bash
  Binaries:
    Node: 24.21.0 - /opt/homebrew/opt/node@24/bin/node
    Yarn: 1.22.22 - /opt/homebrew/bin/yarn
    npm: 11.19.0 - /opt/homebrew/opt/node@24/bin/npm
  Managers:
    CocoaPods: 1.17.0 - /opt/homebrew/bin/pod
  SDKs:
    iOS SDK:
      Platforms: DriverKit 27.0, iOS 27.0, macOS 27.0, tvOS 27.0, visionOS 27.0, watchOS 27.0
  IDEs:
    Xcode: 27.0/27A266a - /usr/bin/xcodebuild
  npmPackages:
    expo: ~57.0.24 => 57.0.24
    react: 19.2.3 => 19.2.3
    react-native: 0.86.3 => 0.86.3
  npmGlobalPackages:
    eas-cli: 24.5.0
  Expo Workflow: managed
```

## Expo Doctor (`npx expo-doctor@latest`)

```
Running 21 checks on your project...
21/21 checks passed. No issues detected!
```

## What this repo does not verify

- `App.js` was not run on a Simulator or device build; `npx expo prebuild -p
  ios` was used only to confirm the config plugin chain resolves (the
  generated `ios/` directory was then deleted; it is gitignored). The
  runtime behavior described above (recording independent of
  `dispatchingEnabled`, the iOS no-op, the resign-active/terminate flush
  triggers) is read directly from the installed package sources, not
  observed from a live app run.
- Whether the Xcode Privacy Report archive step (bug 1, step 4) actually
  omits entries was not re-run here; it is carried over from the original
  draft and is consistent with there being no `.xcprivacy` file to draw from.

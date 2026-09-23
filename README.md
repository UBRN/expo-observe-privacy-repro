# expo-observe privacy repro

A small Expo SDK 57 app that shows two privacy problems in EAS Observe
(`expo-observe`, `expo-app-metrics` and `expo-eas-client`) on iOS. Both
matter for apps that only collect diagnostics after the user agrees to it.

Both issues are present in the latest published versions (see
[Versions](#versions)).

## Issue 1: no iOS privacy manifest

**What happens.** The three packages collect crash reports, JavaScript error
reports, app timing data and an install identifier, and send them to Expo.
None of them includes an Apple privacy manifest (`PrivacyInfo.xcprivacy`).

**Why it matters.** Xcode's Privacy Report and App Store Connect cannot see
what these packages collect. Every developer has to work it out by reading
the native source code and declare it by hand.

**Check it yourself.**

```sh
npm install
./scripts/list-privacy-manifests.sh
```

The script looks for privacy manifests in the three packages. Every section
prints `none`.

**Expected.** Each package ships a privacy manifest that lists the data it
collects and the "required reason" APIs it uses (such as `UserDefaults`),
as `expo-updates` and other Expo packages already do.

## Issue 2: stored data cannot be cleared on iOS

**What happens.** The packages start recording errors and diagnostics as
soon as they load, even while sending is turned off
(`dispatchingEnabled: false`). The only function meant to throw that data
away, `clearStoredEntries()`, works on Android but does nothing on iOS.

**Why it matters.** An app that waits for consent before sending anything
still ends up sending data recorded *before* the user said yes, and it has
no way to delete that data on iOS.

**Steps to reproduce (iOS development build, not Expo Go).**

1. Start the app. Sending starts turned off, as if consent has not been
   given yet.
2. Tap **Throw unhandled error**. Do not leave the app.
3. Tap **clearStoredEntries()**.
4. Tap **Grant consent (enable dispatch)**.
5. Send the app to the background (Home button, or Cmd+Shift+H in the
   Simulator).

The error from step 2 is sent to EAS Observe, although it was recorded
before consent and "cleared" in step 3. On Android, step 3 removes it and
nothing is sent.

**Why step 2 says "do not leave the app".** If the app goes to the
background while sending is still off, Observe skips everything recorded so
far and never sends it. So the pre-consent data only leaks when the user
grants consent before the app is first backgrounded. That is a common flow
(a consent screen on first launch), which is why this still matters.

**Expected.** Any one of these would fix it: `clearStoredEntries()` deletes
stored data on iOS as it does on Android; turning sending off also stops
recording; or the documentation says that error capture starts on import
and cannot be cleared on iOS.

<details>
<summary>Where this is in the code</summary>

Paths are inside `node_modules`, for the versions listed below.

- `expo-app-metrics/ios/AppMetricsModule.swift:81-83`: `clearStoredEntries`
  is an empty function (`// no-op`).
- `expo-app-metrics/android/src/main/java/expo/modules/appmetrics/AppMetricsModule.kt:255`:
  on Android it calls `sessionManager.clearAllData()`.
- `expo-observe/ios/Observability.swift:251-257`: `dispatchingEnabled` is only
  checked when sending, not when recording.
- `expo-observe/ios/Observability.swift:73-77` and `144-148`: while sending
  is off, a flush moves the "already sent" marker past all stored data, so
  it is skipped.
- `expo-observe/ios/ObserveAppDelegateSubscriber.swift`: sending happens when
  the app goes to the background or is closed.
- Recording: `expo-app-metrics/ios/MetricKitSubscriber.swift`,
  `ios/CrashReporting/CrashReport.swift`, `ios/LogEvents/ErrorReport.swift`,
  and `src/installErrorHandler.ts` (installs the JavaScript error handler on
  import).

</details>

## About the demo app

`App.js` uses only public, documented APIs: `ObserveRoot.wrap`,
`Observe.configure({ dispatchingEnabled })` and
`AppMetrics.clearStoredEntries()`. There is no public way to trigger a test
error or to background the app from JavaScript, so the app throws a real
error and asks you to press Home.

## Versions

| Package | Version |
|---|---|
| expo | 57.0.24 |
| expo-observe | 57.0.23 |
| expo-app-metrics | 57.0.20 |
| expo-eas-client | 57.0.4 |
| react-native | 0.86.3 |
| react | 19.2.3 |

Environment: macOS with Xcode 27 and the iOS 27 SDK. `npx expo-doctor`
passes all checks.

## Limitations

- Issue 2 was confirmed by reading the package source code, not by
  watching network traffic from a running app.
- The Xcode Privacy Report step for issue 1 was not re-run for this repo.
  It follows from the missing manifest files.

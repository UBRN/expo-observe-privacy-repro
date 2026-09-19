import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Observe, ObserveRoot } from 'expo-observe';
import AppMetrics from 'expo-app-metrics';

// Consent is not granted yet when the app launches, so dispatch starts disabled.
// Recording (unhandled JS errors, MetricKit diagnostics) is NOT gated by this flag;
// see issue 2 in the README. This must run at module scope, before mount.
Observe.configure({ dispatchingEnabled: false });

function Button({ label, onPress }) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function App() {
  const [status, setStatus] = useState('No action taken yet.');
  const [dispatching, setDispatching] = useState(false);

  function throwUnhandledError() {
    setStatus('Scheduled an unhandled error for the next tick.');
    setTimeout(() => {
      throw new Error('pre-consent error');
    }, 0);
  }

  async function clearStoredEntries() {
    try {
      await AppMetrics.clearStoredEntries();
      setStatus(
        'clearStoredEntries() resolved. On iOS this is a documented no-op ' +
          '(ios/AppMetricsModule.swift), so already-recorded entries are still ' +
          'on disk. On Android it clears them (SessionManager.clearAllData()).'
      );
    } catch (error) {
      setStatus('clearStoredEntries() rejected: ' + String(error?.message ?? error));
    }
  }

  function grantConsent() {
    Observe.configure({ dispatchingEnabled: true });
    setDispatching(true);
    setStatus(
      'Dispatch enabled. Any pending pre-consent records are now eligible ' +
        'for delivery on the next flush (resign-active or terminate).'
    );
  }

  function backgroundHint() {
    setStatus(
      'There is no documented API to background the app from JS. Press the ' +
        'Home button (or Cmd+Shift+H in the Simulator) to resign active and ' +
        'trigger expo-observe’s flush.'
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>expo-observe privacy repro</Text>
      <Text style={styles.state}>dispatchingEnabled: {String(dispatching)}</Text>

      <Button label="Throw unhandled error" onPress={throwUnhandledError} />
      <Button label="clearStoredEntries()" onPress={clearStoredEntries} />
      <Button label="Grant consent (enable dispatch)" onPress={grantConsent} />
      <Button label="Background me hint" onPress={backgroundHint} />

      <Text style={styles.status}>{status}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

export default ObserveRoot.wrap(App);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  state: {
    fontSize: 13,
    color: '#555',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: '100%',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '500',
  },
  status: {
    marginTop: 16,
    fontSize: 13,
    color: '#333',
    textAlign: 'center',
  },
});

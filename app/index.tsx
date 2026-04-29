import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { verifyVoice } from '../lib/voiceProcessor';

type Status = 'idle' | 'recording' | 'processing' | 'granted' | 'denied';

export default function MemberAuthScreen() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function handleAuth() {
    try {
      console.log("🎤 Starting authentication...");

      // 🎤 Step 1: Recording
      setStatus('recording');
      setMessage('Speak naturally for 5 seconds...');

      const result = await verifyVoice();

      // 🛑 If failed
      if (!result) {
        throw new Error('No response from backend');
      }

      console.log("✅ Backend response:", result);

      // 🔄 Step 2: Processing
      setStatus('processing');
      setMessage('Verifying identity...');

      // 🔐 Step 3: Decision
      if (result.access) {
        setStatus('granted');
        setMessage(`Welcome ${result.user}`);

        await logAccess(
          null,
          result.user,
          'granted',
          result.score
        );

      } else {
        setStatus('denied');
        setMessage('Access Denied');

        await logAccess(
          null,
          'Unknown',
          'denied',
          result.score
        );
      }

      // 🔁 Reset UI
      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 3000);

    } catch (err) {
      console.error('❌ Auth error:', err);

      setStatus('denied');
      setMessage('Network / server error');

      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 2000);
    }
  }

  async function logAccess(
    memberId: string | null,
    memberName: string,
    accessStatus: 'granted' | 'denied',
    confidence: number
  ) {
    try {
      await supabase.from('access_logs').insert({
        member_id: memberId,
        member_name: memberName,
        status: accessStatus,
        confidence,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Log error:", err);
    }
  }

  const buttonColors: Record<Status, string> = {
    idle: '#3B8BD4',
    recording: '#EF9F27',
    processing: '#888780',
    granted: '#1D9E75',
    denied: '#E24B4A',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Factory Access</Text>
      <Text style={styles.subtitle}>Voice Authentication</Text>

      <Pressable
        style={[styles.button, { backgroundColor: buttonColors[status] }]}
        onPress={handleAuth}
        disabled={status !== 'idle'}
      >
        {(status === 'recording' || status === 'processing') ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Text style={styles.buttonIcon}>🎤</Text>
        )}
      </Pressable>

      <Text style={styles.statusLabel}>
        {status === 'idle' ? 'Tap to authenticate' : message}
      </Text>

      {status === 'granted' && (
        <Text style={styles.grantedText}>ACCESS GRANTED</Text>
      )}
      {status === 'denied' && (
        <Text style={styles.deniedText}>ACCESS DENIED</Text>
      )}

      <Pressable
        style={styles.adminLink}
        onPress={() => router.push('/admin/login')}
      >
        <Text style={styles.adminLinkText}>Admin</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
    gap: 20,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 15, color: '#888', marginTop: -12 },
  button: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: { fontSize: 48 },
  statusLabel: { color: '#aaa', fontSize: 15, marginTop: 8 },
  grantedText: {
    color: '#1D9E75',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },
  deniedText: {
    color: '#E24B4A',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },
  adminLink: { position: 'absolute', bottom: 30, right: 24 },
  adminLinkText: { color: '#444', fontSize: 13 },
});
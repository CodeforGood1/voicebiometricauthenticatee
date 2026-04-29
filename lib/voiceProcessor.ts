import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// 🌐 Backend URL
import { Platform } from "react-native";

const getBaseUrl = () => {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      return `http://${window.location.hostname}:8000`;
    }
    return "http://localhost:8000";
  }

  return process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.5:8000";
};

const BASE_URL = getBaseUrl();

console.log("🌐 BASE_URL:", BASE_URL);

// ------------------ 🎤 RECORD AUDIO ------------------
export async function recordAudioBase64(): Promise<string | null> {
  try {
    await Audio.requestPermissionsAsync();

    const recording = new Audio.Recording();

    await recording.prepareToRecordAsync({
      android: {
        extension: '.wav',
        outputFormat: Audio.AndroidOutputFormat.DEFAULT,
        audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: {
        extension: '.wav',
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      web: {},
    });

    console.log("🎤 Recording started...");
    await recording.startAsync();

    await new Promise(resolve => setTimeout(resolve, 4000));

    await recording.stopAndUnloadAsync();
    console.log("🛑 Recording stopped");

    const uri = recording.getURI();
    if (!uri) throw new Error("No audio recorded");

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as any,
    });

    console.log("📦 Audio converted to base64");

    return base64;

  } catch (err) {
    console.error("❌ Recording error:", err);
    return null;
  }
}

// ------------------ 🌐 SAFE FETCH WITH TIMEOUT ------------------
async function fetchWithTimeout(url: string, options: any, timeout = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.log("⏳ Request timeout reached");
    controller.abort();
  }, timeout);

  try {
    console.log("🌐 Sending request to:", url);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timer);

    console.log("✅ Response received");

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    return response;

  } catch (err) {
    console.error("❌ Fetch error:", err);
    return null;
  }
}

// ------------------ 🧠 GET EMBEDDING (REGISTER) ------------------
export async function getEmbedding() {
  try {
    const base64 = await recordAudioBase64();
    if (!base64) return null;

    console.log("📡 Sending to /api/embed");

    const response = await fetchWithTimeout(`${BASE_URL}/api/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_base64: base64,
      }),
    });

    if (!response) throw new Error("No response from server");

    const data = await response.json();

    console.log("📥 Embedding response:", data);

    return data.embedding;

  } catch (err) {
    console.error("❌ Embedding error:", err);
    return null;
  }
}

// ------------------ 🔐 VERIFY VOICE (AUTH) ------------------
export async function verifyVoice() {
  try {
    const base64 = await recordAudioBase64();
    if (!base64) return null;

    console.log("📡 Sending to /api/verify");
    console.log("📡 FINAL URL:", `${BASE_URL}/api/verify`);
    const response = await fetchWithTimeout(`${BASE_URL}/api/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_base64: base64,
      }),
    });

    if (!response) throw new Error("No response from server");

    const data = await response.json();

    console.log("🔐 Verify response:", data);

    return data;

  } catch (err) {
    console.error("❌ Verify error:", err);
    return null;
  }
}
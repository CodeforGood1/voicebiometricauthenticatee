const AUTH_KEY = 'voicebiometric.admin.authed';
const PASSCODE_KEY = 'voicebiometric.admin.passcode';
const SAMPLE_TARGET = 5;
const RECORDING_SECONDS = 4;

const state = {
  samples: [],
  recording: false,
  adminAuthed: localStorage.getItem(AUTH_KEY) === '1',
  adminPasscode: localStorage.getItem(PASSCODE_KEY) || '',
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setGlobalStatus(message, tone = 'neutral') {
  els.globalStatus.textContent = message;
  els.globalStatus.className = `status-banner status-${tone}`;
}

function setAuthResult(message, tone = 'neutral') {
  els.authResult.textContent = message;
  els.authResult.className = `result-pill status-${tone}`;
}

function setEnrollMessage(message, tone = 'neutral') {
  els.enrollMessage.textContent = message;
  els.enrollMessage.className = `helper status-${tone}`;
}

function setRuntimeNote(message) {
  els.runtimeNote.textContent = message;
}

function updateSampleUi() {
  const count = state.samples.length;
  els.sampleCount.textContent = `${count} of ${SAMPLE_TARGET} samples captured`;
  els.sampleBtn.textContent = count >= SAMPLE_TARGET ? 'Sample limit reached' : `Capture sample ${count + 1}`;
  els.sampleBtn.disabled = state.recording || count >= SAMPLE_TARGET;
  els.saveBtn.disabled = count < SAMPLE_TARGET || state.recording;
  els.resetSamplesBtn.disabled = state.recording || count === 0;

  els.sampleStrip.innerHTML = '';
  if (count === 0) {
    const chip = document.createElement('span');
    chip.className = 'sample-chip';
    chip.textContent = 'No samples captured yet';
    els.sampleStrip.appendChild(chip);
    return;
  }

  state.samples.forEach((_, index) => {
    const chip = document.createElement('span');
    chip.className = 'sample-chip';
    chip.textContent = `Sample ${index + 1}`;
    els.sampleStrip.appendChild(chip);
  });
}

function setDashboardVisible(visible) {
  els.adminLogin.classList.toggle('hidden', visible);
  els.adminDashboard.classList.toggle('hidden', !visible);
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, options);
  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(data.detail || data.error || data.message || `Request failed (${response.status})`);
  }

  return data;
}

function mergeChunks(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function floatTo16BitPCM(view, offset, input) {
  for (let i = 0; i < input.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  floatTo16BitPCM(view, 44, samples);

  return new Blob([view], { type: 'audio/wav' });
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error('Unable to convert audio to base64'));
    reader.readAsDataURL(blob);
  });
}

async function recordWavBase64(durationMs = RECORDING_SECONDS * 1000) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('This browser does not support microphone capture.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext();
  await audioContext.resume();
  const sampleRate = audioContext.sampleRate;
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentGain = audioContext.createGain();
  const chunks = [];
  let stopped = false;

  silentGain.gain.value = 0;
  processor.onaudioprocess = event => {
    if (stopped) {
      return;
    }
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

  try {
    await new Promise(resolve => setTimeout(resolve, durationMs));
  } finally {
    stopped = true;
    processor.disconnect();
    source.disconnect();
    silentGain.disconnect();
    stream.getTracks().forEach(track => track.stop());
    await audioContext.close().catch(() => {});
  }

  const merged = mergeChunks(chunks);
  const wavBlob = encodeWav(merged, sampleRate);
  return blobToBase64(wavBlob);
}

function renderStats(stats) {
  els.totalMembers.textContent = String(stats.total_members ?? 0);
  els.activeMembers.textContent = String(stats.active_members ?? 0);
  els.logCount.textContent = String(stats.log_count ?? 0);
  els.databaseName.textContent = stats.platform || 'Operational';
}

function renderMembers(members) {
  els.membersList.innerHTML = '';

  if (!members.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No active members yet. Enroll a member to populate this list.';
    els.membersList.appendChild(empty);
    return;
  }

  for (const member of members) {
    const row = document.createElement('div');
    row.className = 'list-row';

    const left = document.createElement('div');
    left.className = 'row-main';

    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = member.name;

    const meta = document.createElement('div');
    meta.className = 'row-meta';
    meta.textContent = `ID ${member.employee_id} · ${member.sample_count || 0} samples · Enrolled ${new Date(member.enrolled_at).toLocaleString()}`;

    left.appendChild(title);
    left.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const activeChip = document.createElement('span');
    activeChip.className = 'chip chip-success';
    activeChip.textContent = 'Active';

    const removeButton = document.createElement('button');
    removeButton.className = 'ghost small';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => deactivateMember(member));

    actions.appendChild(activeChip);
    actions.appendChild(removeButton);

    row.appendChild(left);
    row.appendChild(actions);
    els.membersList.appendChild(row);
  }
}

function renderLogs(logs) {
  els.logsList.innerHTML = '';

  if (!logs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No access logs recorded yet.';
    els.logsList.appendChild(empty);
    return;
  }

  for (const log of logs) {
    const row = document.createElement('div');
    row.className = 'list-row';

    const left = document.createElement('div');
    left.className = 'row-main';

    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = log.member_name;

    const meta = document.createElement('div');
    meta.className = 'row-meta';
    meta.textContent = `${log.status.toUpperCase()} · ${(Number(log.confidence || 0) * 100).toFixed(1)}% confidence · ${new Date(log.timestamp).toLocaleString()}`;

    left.appendChild(title);
    left.appendChild(meta);

    const status = document.createElement('span');
    status.className = `chip ${log.status === 'granted' ? 'chip-success' : 'chip-danger'}`;
    status.textContent = log.status;

    row.appendChild(left);
    row.appendChild(status);
    els.logsList.appendChild(row);
  }
}

async function refreshOverview() {
  const stats = await requestJson('/api/stats');
  renderStats(stats);
}

async function refreshAdminData() {
  const [members, logs, stats] = await Promise.all([
    requestJson('/api/members'),
    requestJson('/api/logs?limit=50'),
    requestJson('/api/stats'),
  ]);

  renderMembers(members);
  renderLogs(logs);
  renderStats(stats);

  if (state.adminAuthed) {
    setGlobalStatus('Dashboard refreshed.', 'success');
  }
}

async function authenticateVoice() {
  if (state.recording) {
    return;
  }

  state.recording = true;
  els.authBtn.disabled = true;
  els.authClearBtn.disabled = true;
  setAuthResult('Recording audio...', 'warning');
  setGlobalStatus('Capturing voice sample.', 'warning');

  try {
    const audioBase64 = await recordWavBase64();
    setAuthResult('Processing sample...', 'warning');
    setGlobalStatus('Submitting sample for verification.', 'warning');

    const result = await requestJson('/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audio_base64: audioBase64 }),
    });

    if (result.access) {
      setAuthResult(`Access granted for ${result.user}`, 'success');
      setGlobalStatus(`Voice match accepted for ${result.user}.`, 'success');
    } else {
      setAuthResult(`Access denied for ${result.user || 'Unknown'}`, 'danger');
      setGlobalStatus('Voice match rejected.', 'danger');
    }

    await refreshOverview();

    if (state.adminAuthed) {
      await refreshAdminData();
    }
  } catch (error) {
    setAuthResult('Capture failed', 'danger');
    setGlobalStatus(error.message || 'Unable to record or verify voice sample.', 'danger');
  } finally {
    state.recording = false;
    els.authBtn.disabled = false;
    els.authClearBtn.disabled = false;
  }
}

function clearAuthResult() {
  setAuthResult('Idle', 'neutral');
  setGlobalStatus('Ready for verification.', 'neutral');
}

function resetSamples() {
  if (state.recording) {
    return;
  }

  state.samples = [];
  updateSampleUi();
  setEnrollMessage('Capture five samples before saving.', 'neutral');
}

async function recordSample() {
  if (state.recording) {
    return;
  }

  const name = els.memberName.value.trim();
  const employeeId = els.memberId.value.trim();

  if (!name || !employeeId) {
    setEnrollMessage('Enter a name and employee ID before recording samples.', 'danger');
    return;
  }

  if (state.samples.length >= SAMPLE_TARGET) {
    return;
  }

  state.recording = true;
  updateSampleUi();
  setEnrollMessage(`Recording sample ${state.samples.length + 1}...`, 'warning');
  setGlobalStatus('Capturing an enrollment sample.', 'warning');

  try {
    const audioBase64 = await recordWavBase64();
    state.samples.push(audioBase64);
    updateSampleUi();
    setEnrollMessage(`Sample ${state.samples.length} captured. Record ${Math.max(SAMPLE_TARGET - state.samples.length, 0)} more.`, 'success');
    setGlobalStatus(`Enrollment sample ${state.samples.length} captured.`, 'success');
  } catch (error) {
    setEnrollMessage(error.message || 'Failed to capture sample.', 'danger');
    setGlobalStatus(error.message || 'Failed to capture sample.', 'danger');
  } finally {
    state.recording = false;
    updateSampleUi();
  }
}

async function saveMember() {
  if (state.recording) {
    return;
  }

  const name = els.memberName.value.trim();
  const employeeId = els.memberId.value.trim();

  if (!name || !employeeId) {
    setEnrollMessage('Enter a name and employee ID first.', 'danger');
    return;
  }

  if (state.samples.length < SAMPLE_TARGET) {
    setEnrollMessage('Capture five samples before saving.', 'warning');
    return;
  }

  els.saveBtn.disabled = true;
  setEnrollMessage('Saving member record...', 'warning');
  setGlobalStatus('Writing enrollment record.', 'warning');

  try {
    if (!state.adminPasscode) {
      setEnrollMessage('Unlock the admin dashboard again before saving members.', 'warning');
      return;
    }

    const response = await requestJson('/api/members/enroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        employee_id: employeeId,
        samples: state.samples,
        admin_passcode: state.adminPasscode,
      }),
    });

    setEnrollMessage(`Member ${response.member.name} enrolled successfully.`, 'success');
    setGlobalStatus(`Member ${response.member.name} enrolled successfully.`, 'success');
    els.memberName.value = '';
    els.memberId.value = '';
    state.samples = [];
    updateSampleUi();
    await refreshOverview();
    if (state.adminAuthed) {
      await refreshAdminData();
    }
  } catch (error) {
    setEnrollMessage(error.message || 'Could not save member.', 'danger');
    setGlobalStatus(error.message || 'Could not save member.', 'danger');
  } finally {
    updateSampleUi();
  }
}

async function loginAdmin() {
  const passcode = els.adminPasscode.value.trim();

  if (!passcode) {
    setGlobalStatus('Enter the admin passcode.', 'warning');
    return;
  }

  setGlobalStatus('Checking administrator passcode.', 'warning');

  try {
    const result = await requestJson('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ passcode }),
    });

    if (!result.ok) {
      setGlobalStatus('Incorrect passcode.', 'danger');
      return;
    }

    state.adminAuthed = true;
    state.adminPasscode = passcode;
    localStorage.setItem(AUTH_KEY, '1');
    localStorage.setItem(PASSCODE_KEY, passcode);
    els.adminPasscode.value = '';
    setDashboardVisible(true);
    setGlobalStatus('Dashboard unlocked.', 'success');
    setEnrollMessage('Administrator access granted. Enroll members using the form below.', 'success');
    await refreshAdminData();
  } catch (error) {
    setGlobalStatus(error.message || 'Unable to unlock dashboard.', 'danger');
  }
}

function logoutAdmin() {
  state.adminAuthed = false;
  state.adminPasscode = '';
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(PASSCODE_KEY);
  state.samples = [];
  els.memberName.value = '';
  els.memberId.value = '';
  updateSampleUi();
  setEnrollMessage('Administrator access required to enroll members.', 'neutral');
  setDashboardVisible(false);
  setGlobalStatus('Dashboard locked.', 'neutral');
}

async function deactivateMember(member) {
  if (!confirm(`Remove ${member.name} from active access?`)) {
    return;
  }

  try {
    await requestJson(`/api/members/${member.id}/deactivate`, {
      method: 'POST',
    });

    setGlobalStatus(`${member.name} was removed from active members.`, 'success');
    await refreshOverview();
    await refreshAdminData();
  } catch (error) {
    setGlobalStatus(error.message || 'Unable to remove member.', 'danger');
  }
}

function bindEvents() {
  els.authBtn.addEventListener('click', authenticateVoice);
  els.authClearBtn.addEventListener('click', clearAuthResult);
  els.sampleBtn.addEventListener('click', recordSample);
  els.resetSamplesBtn.addEventListener('click', resetSamples);
  els.saveBtn.addEventListener('click', saveMember);
  els.adminLoginBtn.addEventListener('click', loginAdmin);
  els.logoutBtn.addEventListener('click', logoutAdmin);
  els.refreshAdminBtn.addEventListener('click', refreshAdminData);
  els.adminPasscode.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      loginAdmin();
    }
  });

  els.memberName.addEventListener('input', () => {
    if (state.samples.length === 0) {
      setEnrollMessage('Capture five samples before saving.', 'neutral');
    }
  });

  els.memberId.addEventListener('input', () => {
    if (state.samples.length === 0) {
      setEnrollMessage('Capture five samples before saving.', 'neutral');
    }
  });
}

async function bootstrap() {
  els.globalStatus = $('global-status');
  els.runtimeNote = $('runtime-note');
  els.authResult = $('auth-result');
  els.authBtn = $('auth-btn');
  els.authClearBtn = $('auth-clear-btn');
  els.memberName = $('member-name');
  els.memberId = $('member-id');
  els.sampleCount = $('sample-count');
  els.sampleStrip = $('sample-strip');
  els.resetSamplesBtn = $('reset-samples-btn');
  els.sampleBtn = $('sample-btn');
  els.saveBtn = $('save-btn');
  els.enrollMessage = $('enroll-message');
  els.adminLogin = $('admin-login');
  els.adminDashboard = $('admin-dashboard');
  els.adminPasscode = $('admin-passcode');
  els.adminLoginBtn = $('admin-login-btn');
  els.logoutBtn = $('logout-btn');
  els.refreshAdminBtn = $('refresh-admin-btn');
  els.membersList = $('members-list');
  els.logsList = $('logs-list');
  els.totalMembers = $('stat-total-members');
  els.activeMembers = $('stat-active-members');
  els.logCount = $('stat-log-count');
  els.databaseName = $('stat-database');

  bindEvents();
  updateSampleUi();
  setDashboardVisible(state.adminAuthed);
  clearAuthResult();
  setEnrollMessage(
    state.adminAuthed
      ? 'Administrator access granted. Enroll members using the form below.'
      : 'Administrator access required to enroll members.',
    state.adminAuthed ? 'success' : 'neutral'
  );

  try {
    await refreshOverview();
    setRuntimeNote('The dashboard is ready. Administrators can manage members and review activity.');
  } catch (error) {
    setRuntimeNote('Start the FastAPI backend on port 8765, then refresh this page.');
    setGlobalStatus(error.message || 'Local backend is not reachable.', 'danger');
  }

  if (state.adminAuthed) {
    try {
      await refreshAdminData();
    } catch {
      setGlobalStatus('Dashboard data is not available yet.', 'warning');
    }
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);

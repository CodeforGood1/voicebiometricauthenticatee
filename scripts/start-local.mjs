import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const backendDir = path.join(repoRoot, 'backend');
const port = 8765;
const rootUrl = `http://127.0.0.1:${port}/`;

function commandAvailable(command, args = []) {
  const result = spawnSync(command, [...args, '--version'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function resolvePythonLauncher() {
  if (process.platform === 'win32') {
    if (commandAvailable('python')) {
      return { command: 'python', args: [] };
    }

    if (commandAvailable('py', ['-3'])) {
      return { command: 'py', args: ['-3'] };
    }
  } else {
    if (commandAvailable('python3')) {
      return { command: 'python3', args: [] };
    }

    if (commandAvailable('python')) {
      return { command: 'python', args: [] };
    }
  }

  throw new Error('Python was not found on PATH. Install Python 3.10+ and try again.');
}

function openBrowser(url) {
  const openers = {
    win32: { command: 'cmd', args: ['/c', 'start', '', url] },
    darwin: { command: 'open', args: [url] },
    linux: { command: 'xdg-open', args: [url] },
  };

  const opener = openers[process.platform] ?? openers.linux;
  const browserProcess = spawn(opener.command, opener.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  browserProcess.unref();
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({ statusCode: response.statusCode ?? 0, body });
      });
    });

    request.setTimeout(2000, () => {
      request.destroy(new Error('Request timed out'));
    });

    request.on('error', reject);
  });
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForUi(timeoutMilliseconds = 30000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    try {
      const response = await requestText(rootUrl);
      if (response.statusCode === 200 && response.body.includes('Voice Biometric Access')) {
        return true;
      }
    } catch {
      // keep polling until the backend is ready or the timeout expires
    }

    await delay(1000);
  }

  return false;
}

async function main() {
  const existingUiReady = await waitForUi(1000);
  if (existingUiReady) {
    openBrowser(rootUrl);
    console.log(`Voice Biometric Local is already running at ${rootUrl}`);
    return;
  }

  const pythonLauncher = resolvePythonLauncher();
  const backendArgs = [
    ...pythonLauncher.args,
    '-m',
    'uvicorn',
    'main:app',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ];

  const backendProcess = spawn(pythonLauncher.command, backendArgs, {
    cwd: backendDir,
    stdio: 'inherit',
    windowsHide: true,
  });

  let backendExited = false;
  backendProcess.on('exit', (code, signal) => {
    backendExited = true;
    if (code && code !== 0 && signal == null) {
      console.error(`Backend exited with code ${code}.`);
    }
  });

  process.on('SIGINT', () => {
    backendProcess.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    backendProcess.kill();
    process.exit(0);
  });

  const ready = await waitForUi();

  if (backendExited && !ready) {
    throw new Error('Backend exited before the UI became ready. Check the terminal output above.');
  }

  if (ready) {
    openBrowser(rootUrl);
    console.log(`Voice Biometric Local is ready at ${rootUrl}`);
  } else {
    console.log(`The backend started, but the UI was not ready yet. Open ${rootUrl} manually after a few seconds.`);
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

#!/usr/bin/env python3
"""Actual Docker/TTY CI test; disposable files and public test credentials only."""
import base64
import errno
import hashlib
import os
from pathlib import Path
import pty
import re
import select
import signal
import subprocess
import sys
import tempfile
import time
import uuid

IMAGE = sys.argv[1] if len(sys.argv) == 2 else 'nestlet:ci'
PASSWORD = 'ci-disposable-operator-password'
INITIAL = b'# Public test fixture only\nNESTLET_OPERATOR_PASSWORD_HASH=\nDEEPSEEK_API_KEY=\nENABLE_LIVE_AI=false\n'


def exercise(directory, cancel=False):
    name = 'nestlet-helper-ci-' + uuid.uuid4().hex
    command = [
        'docker', 'run', '--rm', '-it', '--pull', 'never', '--init', '--name', name,
        '--network', 'none', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '--log-driver', 'none',
        '--pids-limit', '32', '--memory', '256m', '--cpus', '1',
        '--user', f'{os.geteuid()}:{os.getegid()}',
        '--mount', f'type=bind,src={directory},dst=/runtime',
        IMAGE, 'node', 'scripts/setup-operator.js', '/runtime/runtime.env',
    ]
    child, master = pty.fork()
    if child == 0:
        os.execvp(command[0], command)
    transcript = bytearray()
    child_status = None
    deadline = time.monotonic() + 45

    def read_until(marker):
        nonlocal child_status
        while marker not in transcript:
            if time.monotonic() >= deadline:
                raise AssertionError('Docker helper timed out waiting for a terminal prompt')
            ready, _, _ = select.select([master], [], [], 0.1)
            if ready:
                try:
                    chunk = os.read(master, 8192)
                except OSError as error:
                    if error.errno == errno.EIO:
                        raise AssertionError('Docker helper closed before expected prompt') from None
                    raise
                if not chunk:
                    raise AssertionError('Docker helper closed before expected prompt')
                transcript.extend(chunk)
            pid, status = os.waitpid(child, os.WNOHANG)
            if pid:
                child_status = status
                if marker not in transcript:
                    raise AssertionError('Docker helper exited before expected prompt')

    try:
        read_until(b'New operator password')
        os.write(master, PASSWORD.encode() + b'\r')
        read_until(b'Confirm operator password')
        os.write(master, PASSWORD.encode() + b'\r')
        read_until(b'Type SET OPERATOR')
        os.write(master, b'\x03' if cancel else b'SET OPERATOR\r')
        read_until(b'Cancelled; no file was changed.' if cancel else b'Operator password updated privately')
        while child_status is None:
            if time.monotonic() >= deadline:
                raise AssertionError('Docker helper did not exit after confirmation/cancellation')
            pid, status = os.waitpid(child, os.WNOHANG)
            if pid:
                child_status = status
            else:
                ready, _, _ = select.select([master], [], [], 0.1)
                if ready:
                    try:
                        transcript.extend(os.read(master, 8192))
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
        assert os.waitstatus_to_exitcode(child_status) == (1 if cancel else 0)
        assert PASSWORD.encode() not in transcript, 'Public test password appeared in terminal output'
        assert b'scrypt$' not in transcript, 'Generated test hash appeared in terminal output'
    finally:
        os.close(master)
        if child_status is None:
            try:
                os.kill(child, signal.SIGTERM)
            except ProcessLookupError:
                pass
        # Only this disposable test container; never global cleanup or pruning.
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10, check=False)
        if child_status is None:
            try:
                os.waitpid(child, 0)
            except ChildProcessError:
                pass


with tempfile.TemporaryDirectory(prefix='nestlet-helper-private-') as directory:
    os.chmod(directory, 0o700)
    target = Path(directory) / 'runtime.env'
    target.write_bytes(INITIAL)
    target.chmod(0o600)
    original_inode = target.stat().st_ino
    exercise(directory)
    result = target.read_bytes()
    assert target.stat().st_mode & 0o777 == 0o600
    assert target.stat().st_uid == os.geteuid()
    assert target.stat().st_ino != original_inode, 'Expected atomic replacement'
    match = re.search(rb"^NESTLET_OPERATOR_PASSWORD_HASH='scrypt\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})'$", result, re.M)
    assert match, 'Expected a single valid scrypt assignment'
    assert result.replace(match[0], b'NESTLET_OPERATOR_PASSWORD_HASH=') == INITIAL
    salt = base64.urlsafe_b64decode(match[1] + b'==')
    expected = base64.urlsafe_b64decode(match[2] + b'=')
    actual = hashlib.scrypt(PASSWORD.encode(), salt=salt, n=16384, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024)
    assert actual == expected
    assert not list(Path(directory).glob('.*')), 'No helper temporary files should remain'
    target.write_bytes(INITIAL)
    before = target.stat().st_ino
    exercise(directory, cancel=True)
    assert target.read_bytes() == INITIAL and target.stat().st_ino == before
print('Actual Docker/PTY helper passed: hidden entry, cryptographic verification, atomic owner-only update, and cancellation with no mutation. Only disposable public test credentials were used.')

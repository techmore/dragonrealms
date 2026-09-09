// Publish a complete credential file with private permissions. Renaming an
// owned temporary file also replaces an existing symlink instead of following it.
import { randomBytes } from 'node:crypto';
import { writeFileSync, renameSync, rmSync, openSync, closeSync, fstatSync, readFileSync, constants } from 'node:fs';
export function writePrivateJson(path, value) {
  const temporary = `${path}.${randomBytes(16).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}


export function readPrivateJson(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('Credential file must be private and owned by the current user.');
    }
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
}

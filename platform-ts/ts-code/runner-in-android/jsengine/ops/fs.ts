/*
 Copyright (C) 2026 3NSoft Inc.
 
 This program is free software: you can redistribute it and/or modify it under
 the terms of the GNU General Public License as published by the Free Software
 Foundation, either version 3 of the License, or (at your option) any later
 version.
 
 This program is distributed in the hope that it will be useful, but
 WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 See the GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public License along with
 this program. If not, see <http://www.gnu.org/licenses/>.
*/

import type { FileHandle, PlatformDeviceFS } from 'core-3nweb-client-lib/build/injected-globals/platform-devfs';
import type { Mode, ObjectEncodingOptions, Stats } from 'fs';
import { wrapFnOnAndroidSide, stringArrayValueType, intValueType, stringValueType } from '../runtime-ipc-via-ports';
import { toBuffer } from '../../../platform/lib-common/buffer-utils';
import { fs_op as pb } from "../../protos/fs-op.proto";
import { fixInt, ProtoType } from "../../../platform/lib-common/protobuf-msg";
import { FileException, makeFileExceptionFromCode } from '../../../platform/lib-common/exceptions/file';
import { errWithCause } from '../../../platform/lib-common/exceptions/error';

export function makePlatformDeviceFS(): PlatformDeviceFS {
  return {
    appendFile,
    copyFile,
    lstat,
    stat,
    mkdir,
    open,
    readdir,
    readFile,
    readlink,
    rename,
    rmdir,
    symlink,
    truncate,
    unlink,
    writeFile,
  };
}

const copyFileFn = wrapFnOnAndroidSide('fs_copyFile');
interface CopyFileArgs { src: string; dst: string; overwrite: boolean }
const copyFileArgsType = ProtoType.for<CopyFileArgs>(pb.CopyFileArgs);

async function copyFile(src: string, dst: string, overwrite = false): Promise<void> {
  await copyFileFn(copyFileArgsType.pack({ src, dst, overwrite }));
}

interface StatsPB {
  isFile: boolean,
  isDirectory: boolean,
  isSymbolicLink: boolean,
  birthtimeMs: number,
  mtimeMs: number,
  atimeMs: number,
  size: number,
  blocks: number,
  blksize: number
}
const statsType = ProtoType.for<StatsPB>(pb.Stats);

function falseFn(): false {
  return false;
}

function jsonToStats(json: StatsPB): Stats {
  const { blksize } = json;
  const atimeMs = fixInt(json.atimeMs);
  const mtimeMs = fixInt(json.mtimeMs);
  const birthtimeMs = fixInt(json.birthtimeMs);
  const size = fixInt(json.size);
  const blocks = fixInt(json.blocks);
  const mtime = new Date(mtimeMs);
  return {
    dev: 1,
    rdev: 0,
    ino: 1,
    nlink: 1,
    mode: 0,
    uid: 1000,
    gid: 1000,
    size, blksize, blocks,
    birthtimeMs, atimeMs, mtimeMs, ctimeMs: mtimeMs,
    birthtime: new Date(birthtimeMs),
    atime: new Date(atimeMs),
    mtime, ctime: mtime,
    isFile: () => json.isFile,
    isDirectory: () => json.isDirectory,
    isSymbolicLink: () => json.isSymbolicLink,
    isBlockDevice: falseFn,
    isCharacterDevice: falseFn,
    isFIFO: falseFn,
    isSocket: falseFn,
  };
}

function throwExcFromJSON(excJSON: string, path: string): never {
  let exc: any;
  try {
    exc = JSON.parse(excJSON) as FileException;
  } catch (err) {
    throw errWithCause(excJSON, `error in operation on path ${path}`);
  }
  if ((typeof exc !== 'object') || !exc) {
    throw new Error(`${exc}`);
  }
  if (!exc.runtimeException || (exc.type !== 'file')) {
    throw exc;
  }
  throw makeFileExceptionFromCode(exc.code, path);
}

const statFn = wrapFnOnAndroidSide('fs_stat');
interface PathArgs { path: string; }
const pathArgsType = ProtoType.for<PathArgs>(pb.PathArgs);

async function stat(path: string): Promise<Stats> {
  const res = await statFn(pathArgsType.pack({ path }))
  .catch(excStr => throwExcFromJSON(excStr, path));
  return jsonToStats(statsType.unpack(res));
}

const lstatFn = wrapFnOnAndroidSide('fs_lstat');

async function lstat(path: string): Promise<Stats> {
  const res = await lstatFn(pathArgsType.pack({ path }))
  .catch(excStr => throwExcFromJSON(excStr, path));
  return jsonToStats(statsType.unpack(res));
}

const readdirFn = wrapFnOnAndroidSide('fs_readdir');

async function readdir(path: string): Promise<string[]> {
  const res = await readdirFn(pathArgsType.pack({ path }))
  .catch(excStr => throwExcFromJSON(excStr, path));
  return stringArrayValueType.unpack(res).values;
}

const appendFileFn = wrapFnOnAndroidSide('fs_appendFile');
interface AppendFileArgs {
  path: string;
  chunk: Buffer;
}
const appendFileArgsTypes = ProtoType.for<AppendFileArgs>(pb.AppendFileArgs);

async function appendFile(
  path: string, data: string | Uint8Array,
  options?: (ObjectEncodingOptions & { flush?: boolean; }) | BufferEncoding | null
): Promise<void> {
  await appendFileFn(appendFileArgsTypes.pack({ path, chunk: bytesOf(data, options) }))
  .catch(excStr => throwExcFromJSON(excStr, path));
  // XXX debug help in showing logged messages, that use this fs appendFile method
  if ((typeof data === 'string') && path.includes(`/util/logs/`)) {
    console.log(`Written to ${path}:`, data);
  }
}

const readFileFn = wrapFnOnAndroidSide('fs_readFile');

function readFile(path: string, options?: { encoding?: null; } | null): Promise<Buffer>;
function readFile(path: string, options: { encoding: BufferEncoding; } | BufferEncoding): Promise<string>;
async function readFile(
  path: string, options?: ObjectEncodingOptions | BufferEncoding | null
): Promise<string | Buffer> {
  const bytes = await readFileFn(pathArgsType.pack({ path }))
  .catch(excStr => throwExcFromJSON(excStr, path));
  if (typeof options === 'string') {
    return bytes.toString(options);
  } else if (options?.encoding) {
    return bytes.toString(options.encoding);
  } else {
    return bytes;
  }
}

const writeFileFn = wrapFnOnAndroidSide('fs_writeFile');
interface WriteFileArgs { path: string; writeFlag: 'w'|'wx'|'r+'; content: Uint8Array; }
const writeFileArgsType = ProtoType.for<WriteFileArgs>(pb.WriteFileArgs);

async function writeFile(
  path: string, data: string|Uint8Array,
  options?: (ObjectEncodingOptions & { mode?: Mode; flag?: string; flush?: boolean; })|BufferEncoding|null
): Promise<void> {
  const writeFlag = writeFlagFor(options);
  const content = bytesOf(data, options);
  await writeFileFn(writeFileArgsType.pack({ path, writeFlag, content }))
  .catch(excStr => throwExcFromJSON(excStr, path));
}

const mkdirFn = wrapFnOnAndroidSide('fs_mkdir');
interface DirRecursiveArgs { path: string; recursive: boolean; }
const dirRecursiveArgsType = ProtoType.for<DirRecursiveArgs>(pb.DirRecursiveArgs);

async function mkdir(path: string, options?: { recursive?: boolean; }): Promise<void> {
  const recursive = !!options?.recursive;
  await mkdirFn(dirRecursiveArgsType.pack({ path, recursive }))
  .catch(excStr => throwExcFromJSON(excStr, path));
}

const openFn = wrapFnOnAndroidSide('fs_open');
interface OpenFileArgs { path: string; openFlag: string; }
const openFileArgsType = ProtoType.for<OpenFileArgs>(pb.OpenFileArgs);

async function open(path: string, flags?: string, _mode?: Mode): Promise<FileHandle> {
  const openFlag = flags ?? 'r';
  const fd = intValueType.unpack(
    await openFn(openFileArgsType.pack({ path, openFlag }))
    .catch(excStr => throwExcFromJSON(excStr, path))
  ).value;
  return new Descriptor(fd, path);
}

const unlinkFn = wrapFnOnAndroidSide('fs_unlink');

async function unlink(path: string): Promise<void> {
  await unlinkFn(pathArgsType.pack({ path }))
  .catch(excStr => throwExcFromJSON(excStr, path));
}

const truncateFn = wrapFnOnAndroidSide('fs_truncate');
interface TruncateFileArgs { path: string; len: number; }
const truncateFileArgsType = ProtoType.for<TruncateFileArgs>(pb.TruncateFileArgs);

async function truncate(path: string, len?: number): Promise<void> {
  await truncateFn(truncateFileArgsType.pack({ path, len: ((len === undefined) ? 0 : len) }))
  .catch(excStr => throwExcFromJSON(excStr, path));
}

const readlinkFn = wrapFnOnAndroidSide('fs_readlink');

async function readlink(path: string): Promise<string> {
  return stringValueType.unpack(
    await readlinkFn(pathArgsType.pack({ path }))
    .catch(excStr => throwExcFromJSON(excStr, path))
  ).value;
}

const symlinkFn = wrapFnOnAndroidSide('fs_symlink');
interface SymLinkCreateArgs { path: string; target: string; }
const symLinkCreateArgsType = ProtoType.for<SymLinkCreateArgs>(pb.SymLinkCreateArgs);

async function symlink(target: string, path: string): Promise<void> {
  await symlinkFn(symLinkCreateArgsType.pack({ path, target }))
  .catch(excStr => throwExcFromJSON(excStr, path));
}

const rmdirFn = wrapFnOnAndroidSide('fs_rmdir');

async function rmdir(path: string, options?: { recursive?: boolean; }): Promise<void> {
  await rmdirFn(dirRecursiveArgsType.pack({ path, recursive: !!options?.recursive }))
  .catch(excStr => throwExcFromJSON(excStr, path));
}

const renameFn = wrapFnOnAndroidSide('fs_rename');
interface RenameArgs { oldPath: string; newPath: string; }
const renameArgsType = ProtoType.for<RenameArgs>(pb.RenameArgs);

async function rename(oldPath: string, newPath: string): Promise<void> {
  await renameFn(renameArgsType.pack({ oldPath, newPath }))
  .catch(excStr => throwExcFromJSON(excStr, oldPath));
}

function bytesOf(
  data: string | Uint8Array,
  options: ObjectEncodingOptions | BufferEncoding | null | undefined
): Buffer {
  if (typeof data !== 'string') {
    return toBuffer(data);
  }
  if (!options) {
    return Buffer.from(data, 'utf8');
  } else if (typeof options === 'string') {
    return Buffer.from(data, options);
  } else {
    return Buffer.from(data, options.encoding ?? 'utf8');
  }
}

function writeFlagFor(
  options?: { flag?: string; }|BufferEncoding|null
): 'w'|'wx'|'r+' {
  if (!options || (typeof options === 'string') || !options.flag) {
    return 'w';
  }
  const { flag } = options;
  if ((flag === 'r+') || (flag === 'rs+')) {
    return 'r+';
  } else if ((flag === 'wx') || (flag === 'wx+')) {
    return 'wx';
  } else if ((flag === 'w') || (flag === 'w+')) {
    return 'w';
  } else {
    throw new Error(`Flag value ${flag} is not for writing complete file.`);
  }
}

const fhStatFn = wrapFnOnAndroidSide('fh_stat');
const fhCloseFn = wrapFnOnAndroidSide('fh_close');
const fhSyncFn = wrapFnOnAndroidSide('fh_sync');
interface FdArgs { fd: number; }
const fdArgsType = ProtoType.for<FdArgs>(pb.FdArgs);

const fhReadFn = wrapFnOnAndroidSide('fh_read');
interface ReadFdPosArg { fd: number; readPos: number|undefined; len: number; }
const readFdPosArgType = ProtoType.for<ReadFdPosArg>(pb.ReadFdPosArg);

const fhWriteFn = wrapFnOnAndroidSide('fh_write');
interface WriteAtFdPosArgs { fd: number; writePos: number|undefined; chunk: Uint8Array; }
const writeAtFdPosArgsType = ProtoType.for<WriteAtFdPosArgs>(pb.WriteAtFdPosArgs);

const fhTruncateFn = wrapFnOnAndroidSide('fh_truncate');
interface FdTruncateArgs { fd: number; len: number; }
const fdTruncateArgsType = ProtoType.for<FdTruncateArgs>(pb.FdTruncateArgs)

class Descriptor implements FileHandle {

  constructor (
    public readonly fd: number,
    private readonly path: string
  ) {
    Object.seal(this);
  }

  async stat(): Promise<Stats> {
    const res = await fhStatFn(fdArgsType.pack({ fd: this.fd }))
    .catch(excStr => throwExcFromJSON(excStr, this.path));
    return jsonToStats(statsType.unpack(res));
  }

  async close(): Promise<void> {
    await fhCloseFn(fdArgsType.pack({ fd: this.fd }));
  }

  async read(
    buf: Uint8Array, ofsIntoBuf?: number, length?: number, posInFile?: number
  ): Promise<{ bytesRead: number; }> {
    const bytes = await fhReadFn(readFdPosArgType.pack({
      fd: this.fd,
      readPos: posInFile,
      len: length ?? (buf.length - (ofsIntoBuf ?? 0))
    }))
    .catch(excStr => throwExcFromJSON(excStr, this.path));
    buf.set(bytes, ofsIntoBuf);
    return { bytesRead: bytes.length };
  }

  async write(
    buf: Uint8Array, ofsIntoBuf?: number, length?: number, posInFile?: number
  ): Promise<{ bytesWritten: number; }> {
    ofsIntoBuf = ((typeof ofsIntoBuf === 'number') ? ofsIntoBuf : 0);
    const maxLen = buf.length - ofsIntoBuf;
    length = ((typeof length === 'number') ? length : maxLen);
    const chunk = buf.slice(ofsIntoBuf, ofsIntoBuf+length);
    await fhWriteFn(writeAtFdPosArgsType.pack({
      fd: this.fd, writePos: posInFile, chunk
    }))
    .catch(excStr => throwExcFromJSON(excStr, this.path));
    return { bytesWritten: chunk.length };
  }

  async sync(): Promise<void> {
    await fhSyncFn(fdArgsType.pack({ fd: this.fd }));
  }

  async truncate(len = 0): Promise<void> {
    await fhTruncateFn(fdTruncateArgsType.pack({ fd: this.fd, len }))
    .catch(excStr => throwExcFromJSON(excStr, this.path));
  }

}

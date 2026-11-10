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

import { ProtoType } from "../../../platform/lib-common/protobuf-msg";
import { wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { fs_op as pb } from "../../protos/fs-op.proto";


const writeFileIntoAndroidUtilFn = wrapFnOnAndroidSide('android_util_write_file');
interface WriteFileIntoAndroidUtilArgs { path: string; content: Uint8Array; }
const writeFileArgsType = ProtoType.for<WriteFileIntoAndroidUtilArgs>(pb.WriteFileIntoAndroidUtilArgs);

export async function writeAndroidUtilFile(path: string, content: Uint8Array): Promise<void> {
	await writeFileIntoAndroidUtilFn(writeFileArgsType.pack({ path, content }))
}

const readFileFromAndroidUtilFn = wrapFnOnAndroidSide('android_util_read_file');
interface PathArgs { path: string; }
const pathArgsType = ProtoType.for<PathArgs>(pb.PathArgs);
interface FileContentFromAndroidUtil { fileFound: boolean; content?: Uint8Array; }
const fileContentType = ProtoType.for<FileContentFromAndroidUtil>(pb.FileContentFromAndroidUtil);

export async function readAndroidUtilFile(path: string): Promise<Uint8Array|undefined> {
	const reply = await readFileFromAndroidUtilFn(pathArgsType.pack({ path }));
	const { fileFound, content } = fileContentType.unpack(reply);
	return (fileFound ? content : undefined);
}

const removeFromAndroidUtilFn = wrapFnOnAndroidSide('android_util_remove');

export async function removeInAndroidUtil(path: string): Promise<void> {
	await removeFromAndroidUtilFn(pathArgsType.pack({ path }));
}

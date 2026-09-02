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
import { keystore_op as pb } from '../../protos/keystore-op.proto';


const keyStoreDecryptFn = wrapFnOnAndroidSide('keystore_decrypt');
const keyStoreEncryptFn = wrapFnOnAndroidSide('keystore_encrypt');

const cryptArgsType = ProtoType.for<{
	keyName: string;
	data: Uint8Array;
}>(pb.CryptArgs);

export async function encryptWithinKeyStore(keyName: string, data: Uint8Array): Promise<Uint8Array> {
	return await keyStoreEncryptFn(cryptArgsType.pack({ keyName, data }));
}

export async function decryptWithinKeyStore(keyName: string, data: Uint8Array): Promise<Uint8Array> {
	return await keyStoreDecryptFn(cryptArgsType.pack({ keyName, data }));
}


Object.freeze(exports);
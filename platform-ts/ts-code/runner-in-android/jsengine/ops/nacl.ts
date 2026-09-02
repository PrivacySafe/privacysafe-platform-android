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

import { wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { ProtoType } from "../../../platform/lib-common/protobuf-msg";
import { nacl_op as pb } from '../../protos/nacl-op.proto';

export function makeNaClSecretBoxOpen(): (c: Uint8Array, n: Uint8Array, k: Uint8Array) => Promise<Uint8Array> {
	const sboxOpenFn = wrapFnOnAndroidSide('nacl_sbox_open');
	const argsType = ProtoType.for<{ c: Uint8Array; n: Uint8Array; k: Uint8Array; }>(pb.OpenArgs);
	return async (c, n, k) => sboxOpenFn(argsType.pack({ c, n, k }));
}

export function makeNaClSecretBoxPack(): (m: Uint8Array, n: Uint8Array, k: Uint8Array) => Promise<Uint8Array> {
	const sboxOpenFn = wrapFnOnAndroidSide('nacl_sbox_pack');
	const argsType = ProtoType.for<{ m: Uint8Array; n: Uint8Array; k: Uint8Array; }>(pb.PackArgs);
	return async (m, n, k) => sboxOpenFn(argsType.pack({ m, n, k }));
}

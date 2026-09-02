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

import { AsyncRNG } from "core-3nweb-client-lib/build/lib-common/rng-def";
import { wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { random_op as pb } from '../../protos/random-op.proto';
import { ProtoType } from "../../../platform/lib-common/protobuf-msg";

export function makeRandom(): AsyncRNG {
  const randomFn = wrapFnOnAndroidSide('crypto_random');
  const argsType = ProtoType.for<{ numOfBytes: number; }>(pb.NumOfBytesArgs);
  return async numOfBytes => randomFn(argsType.pack({ numOfBytes }));
}

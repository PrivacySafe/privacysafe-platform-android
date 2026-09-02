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

import { ExecCounter } from './cryptor-work-labels';
import { Cryptor, makeInProcessWasmCryptor } from 'ecma-nacl-cryptors';
import { makeNaClSecretBoxOpen, makeNaClSecretBoxPack } from '../ops/nacl';
import { secret_box as sbox } from 'ecma-nacl';
import type { EncryptionException } from 'ecma-nacl-cryptors/build/lib-common/exceptions/runtime';
import { errWithCause } from '../../../platform/lib-common/exceptions/error';

const NONCE_LENGTH = sbox.NONCE_LENGTH;

const maxThreads = 4;

export function makeHybridCryptor(): { cryptor: Cryptor; close: () => Promise<void>; } {

	const { cryptor: { box, scrypt, signing } } = makeInProcessWasmCryptor();

	let numOfWorkInProgress = 0;

	const execCounter = new ExecCounter(() => Math.max(maxThreads - numOfWorkInProgress, 0));

	const openOpFn = makeNaClSecretBoxOpen();
	const packOpFn = makeNaClSecretBoxPack();

	async function open(c: Uint8Array, n: Uint8Array, k: Uint8Array): Promise<Uint8Array> {
		numOfWorkInProgress += 1;
		try {
			const m = await openOpFn(c, n, k);
			if (!m || (m.length === 0)) {
				throw errWithCause({ failedCipherVerification: true } as EncryptionException, `Error in cryptor`);
			}
			return m;
		} finally {
			numOfWorkInProgress -= 1;
		}
	}

	async function pack(m: Uint8Array, n: Uint8Array, k: Uint8Array): Promise<Uint8Array> {
		numOfWorkInProgress += 1;
		try {
			return await packOpFn(m, n, k);
		} finally {
			numOfWorkInProgress -= 1;
		}
	}

	function openWN(cn: Uint8Array, k: Uint8Array): Promise<Uint8Array> {
		const n = cn.subarray(0, NONCE_LENGTH);
		const c = (cn.subarray(NONCE_LENGTH));
		return open(c, n, k);
	}

	async function packWN(m: Uint8Array, n: Uint8Array, k: Uint8Array): Promise<Uint8Array> {
		const c = (await pack(m, n, k));
		const cn = new Uint8Array(c.length + NONCE_LENGTH);
		cn.set(n);
		cn.set(c, NONCE_LENGTH);
		return cn;
	}

	return {

		cryptor: {

			box,
			scrypt,
			signing,

			sbox: {
				canStartUnderWorkLabel: l => execCounter.canStartUnderWorkLabel(l),
				open: (c, n, k, workLabel) => execCounter.wrapOpPromise(
					workLabel,
					open( c, n, k )
				),
				pack: (m, n, k, workLabel) => execCounter.wrapOpPromise(
					workLabel,
					pack( m, n, k )
				),
				formatWN: {
					open: (cn, k, workLabel) => execCounter.wrapOpPromise(
						workLabel,
						openWN(cn, k)
					),
					pack: (m, n, k, workLabel) => execCounter.wrapOpPromise(
						workLabel,
						packWN(m, n, k)
					)
				}
			},

		},

		close: async () => {}

	};
}


Object.freeze(exports);
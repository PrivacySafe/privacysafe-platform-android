/*
 Copyright (C) 2025 - 2026 3NSoft Inc.
 
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

import { areAddressesEqual, toCanonicalAddress } from "../../../../platform/lib-common/canonical-address";
import { UserLogin as UserLoginType } from "../../../../platform/inject-defs/platform";
import { base64 } from "../../../../platform/lib-common/buffer-utils";
import type { FileException } from "../../../../platform/lib-common/exceptions/file";
import { readFile, unlink, writeFile } from "../../../../platform/lib-common/async-fs-node";
import { join } from "path";
import type { Logging } from "../../../../platform/inject-defs/confs";
import { decryptWithinKeyStore, encryptWithinKeyStore } from "../../ops/keystore";

type UserLoginSettings = web3n.system.UserLoginSettings;
type ProgressCB = web3n.startup.ProgressCB;
type LogError = Logging['logError'];

export interface UserKey {
	userId: string;
	key: Uint8Array;
}

interface UserKeyJSON {
	userId: string;
	packedKey: string;
	// XXX should we add here a packed master key, for OS's API to never see root/master key,
	//     but only random key that packs master key here.
}

const AUTOLOGIN_FNAME = 'autologin.json';


export class UserLogin implements UserLoginType {

	private constructor(
		private readonly utilDir: string,
		private readonly logError: LogError,
		private readonly userId: string,
		private readonly getKeyFromPass: (pass: string, progressCB: ProgressCB) => Promise<Uint8Array|undefined>
	) {
		Object.freeze(this);
	}

	static make(
		utilDir: string, logError: LogError,
		userId: string,
		getKeyFromPass: (pass: string, progressCB: ProgressCB) => Promise<Uint8Array|undefined>
	): UserLoginType {
		return (new UserLogin(utilDir, logError, userId, getKeyFromPass)).wrapCAP();
	}

	async isAutoLoginSet(): Promise<boolean> {
		if (!this.isAutoLoginAvailable()) {
			return false;
		}
		const setUsers = await lookForAutologinUsers(this.utilDir, this.logError);
		return !!setUsers?.find(({ userId }) => areAddressesEqual(userId, this.userId))
	}

	async removeAutoLogin(): Promise<void> {
		const existing = await lookForAutologinUsers(this.utilDir, this.logError);
		if (!existing) {
			return;
		}
		const filePath = join(this.utilDir, AUTOLOGIN_FNAME);
		const ind = existing.findIndex(creds => areAddressesEqual(creds.userId, this.userId));
		if (ind < 0) {
			return;
		}
		if (existing.length === 1) {
			await unlink(filePath).catch(noop);
		} else {
			existing.splice(ind, 1);
			await saveAutologinData(existing, this.utilDir);
		}
	}

	async setAutoLogin(password: string, progressCB: ProgressCB): Promise<void> {
		if (!this.isAutoLoginAvailable()) {
			throw `Can't set autologin when it isn't available in OS environment`;
		}
		const key = await this.getKeyFromPass(password, progressCB);
		if (!key) {
			throw `Is password correct?`;
		}
		await saveUserKeyForAutologin({
			userId: this.userId,
			key
		}, this.utilDir, this.logError);
	}

	async isAutoLoginAvailable(): Promise<boolean> {
		return true;
	}

	wrapCAP(): UserLoginSettings {
		return {
			isAutoLoginSet: this.isAutoLoginSet.bind(this),
			removeAutoLogin: this.removeAutoLogin.bind(this),
			setAutoLogin: this.setAutoLogin.bind(this),
			isAutoLoginAvailable: this.isAutoLoginAvailable.bind(this),
		}
	}

}
Object.freeze(UserLogin.prototype);
Object.freeze(UserLogin);


export async function saveUserKeyForAutologin(userKey: UserKey, utilDir: string, logError: LogError): Promise<void> {
	const existing = await lookForAutologinUsers(utilDir, logError);
	if (existing) {
		const ind = existing.findIndex(creds => areAddressesEqual(creds.userId, userKey.userId));
		if (ind < 0) {
			existing.push(userKey);
		} else {
			existing[ind] = userKey;
		}
		await saveAutologinData(existing, utilDir);
	} else {
		await saveAutologinData([ userKey ], utilDir);
	}
}

async function saveAutologinData(data: UserKey[], utilDir: string): Promise<void> {
	const str = JSON.stringify(await Promise.all(data.map(
		async ({ userId, key }) => ({
			userId,
			packedKey: await packKeyWithSafeStorage(key)
		} as UserKeyJSON)
	)), null, 2);
	const filePath = join(utilDir, AUTOLOGIN_FNAME);
	await writeFile(filePath, str);
}

export async function lookForAutologinUsers(utilDir: string, logError: LogError): Promise<UserKey[]|undefined> {
	const filePath = join(utilDir, AUTOLOGIN_FNAME);
	try {
		const fileContent = await readFile(filePath, { encoding: 'utf8' });
		const users = await parseAndCheckCredentials(fileContent);
		return ((users.length > 0) ? users : undefined);
	} catch (exc) {
		if ((exc as FileException).notFound) {
			return;
		} else {
			await logError(exc, `Failed to read and parse ${AUTOLOGIN_FNAME} file`);
		}
	}
}

async function parseAndCheckCredentials(str: string): Promise<UserKey[]> {
	const jsons = JSON.parse(str) as UserKeyJSON[];
	const checked: UserKey[] = [];
	if (!Array.isArray(jsons)) {
		throw `This isn't an array with login credentials`;
	}
	const canonicalIds = new Set<string>();
	for (const { userId, packedKey } of jsons) {
		// implicit check of user id
		canonicalIds.add(toCanonicalAddress(userId));
		checked.push({
			userId,
			key: await unpackKeyWithSafeStorage(packedKey)
		});
	}
	if (canonicalIds.size !== checked.length) {
		throw `There are non-unique user ids in ${AUTOLOGIN_FNAME} file`;
	}
	return checked;
}

const LOGIN_ON_DEVICE_KEY_NAME = 'login-key';

async function packKeyWithSafeStorage(key: Uint8Array): Promise<string> {
	const encrypted = await encryptWithinKeyStore(LOGIN_ON_DEVICE_KEY_NAME, key);
	const keyB64 = base64.pack(encrypted);
	return keyB64;
}

async function unpackKeyWithSafeStorage(packedKey: string): Promise<Uint8Array> {
	const encrypted = base64.open(packedKey);
	return await decryptWithinKeyStore(LOGIN_ON_DEVICE_KEY_NAME, encrypted);
}

function noop() {}

Object.freeze(exports);
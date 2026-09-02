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

import { makeLogger } from "core-3nweb-client-lib";
import type { Logging } from "../../platform/inject-defs/confs";
import { stringifyErr } from "../../platform/lib-common/exceptions/error";
import { makeFSCollection } from "core-3nweb-client-lib/build/lib-client/fs-utils/fs-collection";

export const LAUNCHER_APP_DOMAIN = "launcher.app.privacysafe.io";
export const STARTUP_APP_DOMAIN = "startup.app.privacysafe.io";

export const SIGNUP_URL = "https://signup.privacysafe.me/";

export const BUNDLED_APPS = [
	LAUNCHER_APP_DOMAIN,
	STARTUP_APP_DOMAIN
];

export const BUNDLED_APP_PACKS = [
	"files.app.privacysafe.io",
	"chat.app.privacysafe.io",
	"contacts.app.privacysafe.io",
	"inbox.app.privacysafe.io",
	"treasure.app.privacysafe.io"
];

export const DATA_DIR_NAME = "PrivacySafe";

export function loggerToFileAndConsole(utilDir: string): Logging {
	const loggerToFile = makeLogger(utilDir);
	return {
		appLog: loggerToFile.appLog,
		logError: async (err, msg) => {
			console.error(msg ?? "Error in core:\n", stringifyErr(err));
			return loggerToFile.logError(err, msg);
		},
		logWarning: async (err, msg) => {
			console.error(msg ?? "Warning in core:\n", stringifyErr(err));
			return loggerToFile.logWarning(err, msg);
		},
		recordUnhandledRejectionsInProcess: () => {}
	};
}

type UI = web3n.ui.UI;
type FormFactor = web3n.ui.FormFactor;
type FSItem = web3n.files.FSItem;

export function makeUICap(): UI {
	return { uiFormFactor: async () => deviceFormFactor() };
}

export function deviceFormFactor(): FormFactor {
	return 'phone'
}

export async function sysFilesOnDevice(): Promise<FSItem> {
	const c = makeFSCollection();
	return { isCollection: true, item: c };
}

export const dohURLs = [
	`https://dns.google/resolve`,
	`https://cloudflare-dns.com/dns-query`
];

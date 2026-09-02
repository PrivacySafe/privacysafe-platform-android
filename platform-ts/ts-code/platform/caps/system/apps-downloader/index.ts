/*
 Copyright (C) 2021, 2024, 2026 3NSoft Inc.
 
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

import { getAppLocation } from "./app-package-locator";
import { from, Observable, Subject } from "rxjs";
import { mergeMap } from "rxjs/operators";
import { appChannels, channelLatestVersion, listAppVersionPacks, getJson, makeAppDownloadExc } from "./download-resources";
import { toRxObserver } from "../../../lib-common/utils-for-observables";
import type { SystemPlaces } from "../system-places";
import type { DnsResolver } from "core-3nweb-client-lib/build/lib-client/service-locator";
import { Logging } from "../../../inject-defs/confs";
import { RequestFn } from "core-3nweb-client-lib/build/lib-client/request-utils";

type DownloadProgress = web3n.system.apps.DownloadProgress;
type Observer<T> = web3n.Observer<T>;
type AppVersionPacks = web3n.system.apps.AppDistributionList;
type DistChannels = web3n.system.apps.DistChannels;
type AppManifest = web3n.caps.AppManifest;

const MANIFEST_FILE = 'manifest.json';

type HashSha512 = (bytes: Buffer) => Promise<string>;

export class AppDownloader {

	constructor(
		private readonly sysPlaces: SystemPlaces,
		private readonly request: RequestFn<unknown>,
		private readonly dnsResolvers: DnsResolver[],
		private readonly logError: Logging['logError'],
		private readonly hashSha512: HashSha512
	) {
		Object.seal(this);
	}

	private async getAppUrl(id: string): Promise<string> {
		try {
			const appBaseUrl = await getAppLocation(id, this.dnsResolvers, this.logError);
			return appBaseUrl;
		} catch (exc) {
			throw makeAppDownloadExc(id, { dnsErr: true }, exc);
		}
	}

	async getAppChannels(id: string): Promise<DistChannels> {
		const appUrl = await this.getAppUrl(id);
		return appChannels(appUrl, id, this.request);
	}

	async getLatestAppVersion(id: string, channel: string): Promise<string> {
		const appUrl = await this.getAppUrl(id);
		return channelLatestVersion(appUrl, id, channel, this.request);
	}

	async getAppVersionFilesList(
		id: string, version: string
	): Promise<AppVersionPacks> {
		const appUrl = await this.getAppUrl(id);
		const { listInAppVersion } = await listAppVersionPacks(appUrl, id, version, this.request);
		return listInAppVersion;
	}

	downloadWebApp(
		id: string, version: string, observer: Observer<DownloadProgress>
	): () => void {
		const sub = from(this.startDownloadProc(id, version))
		.pipe(mergeMap(proc => proc))
		.subscribe(toRxObserver(observer));
		return () => sub.unsubscribe();
	}

	private async locateUnpackedApp(
		id: string, version: string
	): Promise<{ content: AppContent; unpackedAppUrl: string; }> {
		const appUrl = await this.getAppUrl(id);
		const {
			appVersionUrl, listInAppVersion
		} = await listAppVersionPacks(appUrl, id, version, this.request);
		const fName = getUnpackedFolder(listInAppVersion);
		if (!fName) { throw makeAppDownloadExc(id, { noUnpackedVariant: true }); }
		const unpackedAppUrl = `${appVersionUrl}/${fName}`;
		const content = await appVersionContent(id, unpackedAppUrl, this.request);
		return { content, unpackedAppUrl };
	}

	private async startDownloadProc(
		id: string, version: string
	): Promise<Observable<DownloadProgress>> {
		const procObs = new Subject<DownloadProgress>();
		this.locateUnpackedApp(id, version)
		.then(async ({ content, unpackedAppUrl }) => {
			const {
				dir, mvDirOnCompletion, rmDirOnErr
			} = await this.sysPlaces.makeDownloadFolder(id, version);
			// 
			// XXX add to dir xattr pack_source with some json data in it with
			//     timestamp, url, note if download is complete, or uses prev
			//     version(s).
			// 
			let filesLeft = 0;
			let bytesLeft = 0;
			for (const file of content.content) {
				filesLeft += 1;
				bytesLeft += file.size;
			}
			const totalFiles = filesLeft;
			const totalBytes = bytesLeft;
			await dir.writeJSONFile(CONTENT_FNAME, content);
			try {
				procObs.next({ totalFiles, filesLeft, totalBytes, bytesLeft });
				for (const entry of content.content) {
					procObs.next({
						totalFiles, filesLeft, totalBytes, bytesLeft,
						currentFileSize: entry.size,
						fileInProgress: entry.file
					});
					const fileBytes = await downloadAndCheck(
						id, unpackedAppUrl, entry, this.request as RequestFn<Buffer>, this.hashSha512
					);
					await dir.writeBytes(entry.file, fileBytes);
					filesLeft -= 1;
					bytesLeft -= entry.size;
					procObs.next({ totalFiles, filesLeft, totalBytes, bytesLeft });
				}
				const m = await dir.readJSONFile<AppManifest>(MANIFEST_FILE);
				if (m.appDomain !== id) { throw makeAppDownloadExc(
					id, { badAppFile: true }, `Wrong app domain in manifest`
				); }
				await mvDirOnCompletion();
				procObs.complete();
			} catch (exc) {
				await rmDirOnErr();
			}
		}, exc => procObs.error(exc));
		return procObs.asObservable();
	}

}
Object.freeze(AppDownloader.prototype);
Object.freeze(AppDownloader);


function getUnpackedFolder(lst: AppVersionPacks): string|undefined {
	for (const [fName, info] of Object.entries(lst.files)) {
		if ((info.content === 'bin/unpacked')) {
			return fName;
		}
	}
}

export interface AppContent {
	content: ContentFileInfo[];
}

export interface ContentFileInfo {
	file: string;
	sha512: string;
	size: number;
}

const CONTENT_FNAME = 'content.json';

async function appVersionContent(
	appDomain: string, unpackedAppUrl: string, request: RequestFn<unknown>
): Promise<AppContent> {
	const content = await getJson<AppContent>(`${unpackedAppUrl}/${CONTENT_FNAME}`, request);
	if (content && Array.isArray(content.content)) {
		return content;
	} else {
		throw makeAppDownloadExc(appDomain, { noAppContent: true });
	}
}

async function downloadAppFile(
	appDomain: string, unpackedAppUrl: string, file: string, request: RequestFn<Buffer>
): Promise<Buffer> {
	const rep = await request({
		method: 'GET',
		url: `${unpackedAppUrl}/${file}`,
		responseType: 'arraybuffer'
	});
	if (rep.status === 200) {
		return rep.data;
	} else {
		throw makeAppDownloadExc(appDomain, { badAppFile: true },
			`Can't download file ${file}. Server returns status ${rep.status}.`);
	}
}

async function downloadAndCheck(
	appDomain: string, unpackedAppUrl: string, info: ContentFileInfo, request: RequestFn<Buffer>,
	hashSha512: HashSha512
): Promise<Uint8Array> {
	if (!info.sha512) { throw makeAppDownloadExc(
		appDomain, { badAppFile: true },
		`No expected sha512 for file ${info.file}`
	); }
	const fileContent = await downloadAppFile(appDomain, unpackedAppUrl, info.file, request);
	if (fileContent.length !== info.size) {
		throw makeAppDownloadExc(
			appDomain, { badAppFile: true },
			`Got ${fileContent.length} bytes for file ${info.file} instead of expected ${info.size}`
		);
	}
	if (info.sha512 !== (await hashSha512(fileContent))) {
		throw makeAppDownloadExc(
			appDomain, { badAppFile: true }, `Calculated sha512 of file ${info.file} deviates from expected hash`
		);
	}
	return fileContent;
}


Object.freeze(exports);
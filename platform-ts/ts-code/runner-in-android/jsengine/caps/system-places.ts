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

import { reverseDomain, type Core } from "core-3nweb-client-lib";
import { appVersionFolder, completePackAppVersionFolder, InstalledAppParams, SystemPlaces } from "../../../platform/caps/system/system-places";
import { Logging } from "../../../platform/inject-defs/confs";
import { BUNDLED_APPS, LAUNCHER_APP_DOMAIN, STARTUP_APP_DOMAIN } from "../confs";
import { hasStartupLaunchersDefined } from "../../../platform/lib-common/manifest-utils";
import { AppFolder } from "../../../platform/apps/app";
import { Observable, Subject } from "rxjs";
import { utf8StringFromBytes, wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { fs_op as pb } from "../../protos/fs-op.proto";
import { ProtoType } from "../../../platform/lib-common/protobuf-msg";

type AppManifest = web3n.caps.AppManifest;
type ListingEntry = web3n.files.ListingEntry;
type GeneralAppManifest = web3n.caps.GeneralAppManifest;
type AppUnpackProgress = web3n.system.apps.AppUnpackProgress;
type WritableFS = web3n.files.WritableFS;

const COMPLETE_PACKS_DIR = 'complete';
const PARTIAL_PACKS_DIR = 'partial';
const MANIFEST_FILE = 'manifest.json';
const APP_ROOT_FOLDER = 'app';

const sysApps = [
	STARTUP_APP_DOMAIN, LAUNCHER_APP_DOMAIN
];

export function makeSystemPlaces(
  getStorages: Core['getStorages'], logError: Logging['logError']
): SystemPlaces {
  return new SystemPlaces(
    getStorages,
    () => listInstalledBundledApps(sysApps),
    listBundledAppPacks,
    listInstalledBundledAppsWithStartup,
    isBundledApp,
    appManifestOnDev,
    appAndManifestOnDev,
    getBundledPackManifest,
    getBundledPackFileBytes,
    unpackBundledApp,
    stub('system_places.unpackAppFromFile'),
    logError
  );
}

function stub(fnName: string) {
  return () => {
    const err = new Error(`${fnName} needs implementation`);
    console.error(err.message, "\n", err.stack);
    throw err;
  };
}

export function isBundledApp(appDomain: string): boolean {
  return (
    (appDomain === LAUNCHER_APP_DOMAIN) ||
    BUNDLED_APPS.includes(appDomain)
  );
}

const readBytesFromAssetsFn = wrapFnOnAndroidSide('assets_readBytes');
interface ReadFromAssetsPathArgs { fromPacks: boolean; path: string; start?: number; end?: number; }
const readFromAssetsPathArgsType = ProtoType.for<ReadFromAssetsPathArgs>(pb.ReadFromAssetsPathArgs);

function readBytesFromAssets(
  fromPacks: boolean, path: string, start?: number, end?: number
): Promise<Uint8Array> {
  return readBytesFromAssetsFn(readFromAssetsPathArgsType.pack(
    { fromPacks, path, start: start, end }
  ));
}

const listFolderFromAssetsFn = wrapFnOnAndroidSide('assets_listFolder');
interface AssetsPathArgs { fromPacks: boolean; path: string; }
const assetsPathArgsType = ProtoType.for<AssetsPathArgs>(pb.AssetsPathArgs);
interface AssetsFolderListing { items: { name: string; isFolder: boolean; }[]; }
const assetsFolderListingType = ProtoType.for<AssetsFolderListing>(pb.AssetsFolderListing);

async function listFolderFromAssets(
  fromPacks: boolean, path: string
): Promise<{ name: string; isFolder: boolean; }[]> {
  return assetsFolderListingType.unpack(
    await listFolderFromAssetsFn(assetsPathArgsType.pack({ fromPacks, path }))
  ).items;
}

export async function appManifestOnDev(appDomain: string): Promise<AppManifest> {
  const bytes = await readBytesFromAssets(false, `${reverseDomain(appDomain)}/${MANIFEST_FILE}`);
  return JSON.parse(utf8StringFromBytes(bytes));
}

async function makeAppFolder(appDomain: string): Promise<AppFolder> {

  const pathPrefix = `${reverseDomain(appDomain)}/${APP_ROOT_FOLDER}`;

  function readBytes(path: string, start?: number, end?: number): Promise<Uint8Array|undefined> {
    path = (path.startsWith('/') ? `${pathPrefix}${path}` : `${pathPrefix}/${path}`);
    return readBytesFromAssets(false, path, start, end);
  }

  async function listFolder(folder: string): Promise<ListingEntry[]> {
    return (await listFolderFromAssets(
      false, (folder.startsWith('/') ? `${pathPrefix}${folder}` : `${pathPrefix}/${folder}`)
    ))
    .map(({ name, isFolder }) => ({
      name,
      isFolder,
      isFile: !isFolder
    }));
  }

  return {
    readBytes,
    listFolder,
    checkFilePresence: stub('AppFolder. checkFilePresence'),
    getByteSource: stub('AppFolder. getByteSource')
  };
}

async function appAndManifestOnDev(appDomain: string): Promise<InstalledAppParams> {
  const manifest = await appManifestOnDev(appDomain);
	const hasStartupLaunchers = hasStartupLaunchersDefined(manifest);
  const appRoot = await makeAppFolder(appDomain);
  return {
    appRoot, manifest, sysParamsForApp: { hasStartupLaunchers }
  };
}

async function manifestsOfInstalledBundledApps(
	skipApps?: string[]
): Promise<AppManifest[]> {
  let lst = (await listFolderFromAssets(false, ''))
  .map(({ name }) => reverseDomain(name));
  if (skipApps) {
    lst = lst.filter(fName => !skipApps.includes(fName));
  }
  return Promise.all(lst.map(appManifestOnDev));
}

export async function listInstalledBundledApps(
	skipApps?: string[]
): Promise<{ id: string; version: string; }[]> {
	return (await manifestsOfInstalledBundledApps(skipApps))
	.map(m => ({
		id: m.appDomain,
		version: m.version
	}));
}

async function listInstalledBundledAppsWithStartup(skipApps?: string[]): Promise<string[]> {
	return (await manifestsOfInstalledBundledApps(skipApps))
	.filter(m => {
		const launchers = (m as GeneralAppManifest).launchOnSystemStartup;
		return (launchers && (launchers.length > 0));
	})
	.map(({ appDomain }) => appDomain);

}

export async function listBundledAppPacks(): Promise<{ id: string; version: string; }[]> {
  return (await manifestsFromAppsOnDevice(true)).map(m => ({
		id: m.appDomain,
		version: m.version
	}));
}

async function manifestsFromAppsOnDevice(fromPacks: boolean): Promise<AppManifest[]> {
  const manifests = (await listFolderFromAssets(fromPacks, ''))
  .map(({ name: reversedDomain }) => 
    readBytesFromAssets(fromPacks, `${reversedDomain}/${MANIFEST_FILE}`)
    .then(bytes => JSON.parse(utf8StringFromBytes(bytes)) as AppManifest)
  );
  return Promise.all(manifests);
}

async function getBundledPackManifest(appDomain: string): Promise<AppManifest|undefined> {
  const bytes = await readBytesFromAssets(true, `${reverseDomain(appDomain)}/${MANIFEST_FILE}`).catch(noop);
  if (bytes) {
    return JSON.parse(utf8StringFromBytes(bytes));
  }
}

function noop() {}

async function getBundledPackFileBytes(appDomain: string, path: string): Promise<Uint8Array|undefined> {
  const bytes = await readBytesFromAssets(true, `${reverseDomain(appDomain)}/${path}`).catch(noop);
  if (bytes) {
    return bytes;
  }
}

async function unpackBundledApp(appDomain: string, packsFS: WritableFS): Promise<Observable<AppUnpackProgress>> {
  const reversedDomain = reverseDomain(appDomain);
  const m = JSON.parse(utf8StringFromBytes(
    await readBytesFromAssets(true, `${reversedDomain}/${MANIFEST_FILE}`)
  )) as AppManifest;
  const partialDirPath = `${PARTIAL_PACKS_DIR}/${appVersionFolder(appDomain, m.version)}`;
  const completeDirPath = completePackAppVersionFolder(appDomain, m.version);
	const progressObs = new Subject<AppUnpackProgress>();

  const filePaths: string[] = [];
  async function collectFilePaths(dirPath: string[]) {
    const pathInAssets = [ reversedDomain, ...dirPath ].join('/');
    const dirLst = await listFolderFromAssets(true, pathInAssets);
    for (const { name, isFolder } of dirLst) {
      const itemPath = dirPath.concat(name);
      if (isFolder) {
        await collectFilePaths(itemPath);
      } else {
        filePaths.push(itemPath.join('/'));
      }
    }
  }

  let numOfFiles = 0;
  let numOfProcessed = 0;

  collectFilePaths([])
  .then(async () => {
    numOfFiles = filePaths.length;
    const dstFS = await packsFS.writableSubRoot(partialDirPath);
    for (const filePath of filePaths) {
      progressObs.next({
        numOfFiles, numOfProcessed, fileInProgress: filePath
      });
      const bytes = await readBytesFromAssets(true, `${reversedDomain}/${filePath}`);
      await dstFS.writeBytes(filePath, bytes);
      numOfProcessed += 1;
    }
  })
  .then(async () => {
    await packsFS.move(partialDirPath, completeDirPath);
    progressObs.complete();
  })
  .catch(exc => {
    progressObs.error(exc);
  });

  return progressObs.asObservable();
}



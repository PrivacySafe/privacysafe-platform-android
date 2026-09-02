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

import { BooleanValue, booleanValueType, fnsForAndroid, IntValue, intValueType, StringArrayValue, stringArrayValueType, StringValue, stringValueType } from "./runtime-ipc-via-ports";
import { init as initPb } from '../protos/init.proto';
import { components as pb } from '../protos/components.proto';
import { ProtoType } from "../../platform/lib-common/protobuf-msg";
import type { InitProc } from "../init-proc";
import type { FileException } from "../../platform/lib-common/exceptions/file";
import { isBundledApp as isBundled } from "../jsengine/caps/system-places";

type ReadonlyFS = web3n.files.ReadonlyFS;

export function exposeInitProcFns(initProc: InitProc): void {

	/**
	 * This should be called by Android side when it sets up message port to respective component.
	 */
	function attachComponentPortToConnector({ connectorId }: ConnectorIdArgs): Promise<void> {
		return initProc.attachComponentPortToConnector(connectorId);
	}
	interface ConnectorIdArgs { connectorId: string; }
	const connectorIdArgsType = ProtoType.for<ConnectorIdArgs>(initPb.ConnectorIdArgs);
	fnsForAndroid.exposeFn(
		attachComponentPortToConnector,
		connectorIdArgsType,
		undefined
	);

	async function listObjPathInConnector({
		connectorId, objPath
	}: ConnectorAndObjPathArgs): Promise<StringArrayValue|undefined> {
		const lst = initProc.listObjPathInConnector(connectorId, objPath)!;
		if (lst) {
			return { values: lst };
		}
	}
	interface ConnectorAndObjPathArgs { connectorId: string; objPath: string[]; }
	fnsForAndroid.exposeFn(
		listObjPathInConnector,
		ProtoType.for<ConnectorAndObjPathArgs>(initPb.ConnectorAndObjPathArgs),
		stringArrayValueType
	);

	async function getSignedUserIdEventually(): Promise<StringValue> {
		return { value: await initProc.getSignedUserIdEventually() };
	}
	fnsForAndroid.exposeFn(
		getSignedUserIdEventually,
		undefined,
		stringValueType
	);

	interface AppDomainArgs { appDomain: string; }
	const appDomainArgsType = ProtoType.for<AppDomainArgs>(pb.AppDomainArgs)

	async function isBundledApp({ appDomain }: AppDomainArgs): Promise<BooleanValue> {
		return { value: isBundled(appDomain) };
	}
	fnsForAndroid.exposeFn(
		isBundledApp,
		appDomainArgsType,
		booleanValueType
	);

	/**
	 * This should be called by Android side, when component has been closed in/from it's side.
	 * @param connectorId 
	 */
	async function onComponentClosedInAndroid({ connectorId }: ConnectorIdArgs): Promise<void> {
		const c = initProc.getComponent(connectorId);
		if (c) {
			initProc.removeComponentConnector(connectorId);
			c.close();
		}
	}
	interface ConnectorIdArgs { connectorId: string; }
	fnsForAndroid.exposeFn(
		onComponentClosedInAndroid,
		ProtoType.for<ConnectorIdArgs>(pb.ConnectorIdArgs),
		undefined
	);

	/**
	 * This return file size as number in string, or undefined, when file is not found.
	 * @param path in app folder of the app
	 */
	async function getFileSizeInAppCodeFS({
		connectorId, path
	}: ConnectorAndPathArgs): Promise<IntValue> {
		const c = initProc.getComponent(connectorId);
		if (c) {
			const stats = await (c.appRoot as ReadonlyFS).stat(path).catch(rethrowDifferentFromNotFound);
			if (stats?.isFile && (typeof stats.size == 'number')) {
				return { value: stats.size! };
			} else {
				return { value: -1 };
			}
		} else {
			console.error(`connector ${connectorId} is not found to stat file ${path} in related app`);
			return { value: -1 };
		}
	}
	interface ConnectorAndPathArgs { connectorId: string; path: string; }
	fnsForAndroid.exposeFn(
		getFileSizeInAppCodeFS,
		ProtoType.for<ConnectorAndPathArgs>(pb.ConnectorAndPathArgs),
		intValueType
	);

	async function readBytesFromFileInAppCodeFS(
		{ connectorId, path, start, end }: FileReadArgs
	): Promise<Uint8Array|undefined> {
		const c = initProc.getComponent(connectorId);
		if (!c) {
			return;
		}
		return c.appRoot.readBytes(path, start, end).catch(rethrowDifferentFromNotFound);
	}
	interface FileReadArgs { connectorId: string; path: string; start: number; end: number; }
	fnsForAndroid.exposeFn(
		readBytesFromFileInAppCodeFS,
		ProtoType.for<FileReadArgs>(pb.FileReadArgs),
		undefined
	);

	async function launchAppFromAndroid({ appDomain }: AppDomainArgs): Promise<ConnectorIdAndEntrypoint> {
		return await initProc.launchAppFromAndroid(appDomain);
	}
	interface ConnectorIdAndEntrypoint { connectorId: string; entrypoint: string; }
	fnsForAndroid.exposeFn(
		launchAppFromAndroid,
		appDomainArgsType,
		ProtoType.for<ConnectorIdAndEntrypoint>(pb.ConnectorAndEntrypoint)
	);

	async function processURL({ url }: UrlArgs) {
		initProc.processURL(url);
	}
	interface UrlArgs { url: string }
	fnsForAndroid.exposeFn(
		processURL,
		ProtoType.for<UrlArgs>(initPb.UrlArgs),
		undefined
	);

	async function processURLBeforeLogin({ url }: UrlArgs): Promise<StringValue> {
		return { value: initProc.processURLBeforeLogin(url) ?? '' };
	}
	interface UrlArgs { url: string }
	fnsForAndroid.exposeFn(
		processURLBeforeLogin,
		ProtoType.for<UrlArgs>(initPb.UrlArgs),
		stringValueType
	);

}

function rethrowDifferentFromNotFound(exc: FileException): undefined {
	if (exc.notFound) {
		return undefined;
	} else {
		throw exc;
	}
}

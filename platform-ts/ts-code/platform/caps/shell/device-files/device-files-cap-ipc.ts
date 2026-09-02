/*
 Copyright (C) 2025 3NSoft Inc.
 
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
import { Caller, CoreSideServices, ExposedObj, exposeFileService, exposeFSService, FileMsg, FSMsg, callerSideJSONWrap as jsonCall, serviceSideJSONWrap as jsonSrv, makeFileCaller, makeFSCaller } from 'core-3nweb-client-lib/build/ipc';
import { file as filePb } from '../../../protos/file.proto';
import { fs as fsPb } from '../../../protos/fs.proto';
import { ProtoType } from 'core-3nweb-client-lib/build/lib-client/protobuf-type';

type DeviceFiles = NonNullable<web3n.shell.ShellCAPs['deviceFiles']>;

const filePbType = ProtoType.for<FileMsg>(filePb.File);
const fsPbType = ProtoType.for<FSMsg>(fsPb.FS);

export function exposeDeviceFilesCAP(
	cap: DeviceFiles, expServices: CoreSideServices
): ExposedObj<DeviceFiles> {
	const exposed: ExposedObj<DeviceFiles> = {
		standardFileToDeviceFile: jsonSrv.wrapReqReplySrvMethod(cap, 'standardFileToDeviceFile', {
			packReply: f => filePbType.pack(exposeFileService(f, expServices))
		}),
		standardFileToDeviceFolder: jsonSrv.wrapReqReplySrvMethod(cap, 'standardFileToDeviceFolder', {
			packReply: f => fsPbType.pack(exposeFSService(f, expServices))
		}),
		statStandardItem: jsonSrv.wrapReqReplySrvMethod(cap, 'statStandardItem')
	};
	return exposed;
}

export function makeDeviceFiles(
	caller: Caller, objPath: string[]
): DeviceFiles {
	const devFiles: DeviceFiles = {
		standardFileToDeviceFile: jsonCall.makeReqRepObjCaller<DeviceFiles, 'standardFileToDeviceFile'>(
			caller, objPath, 'standardFileToDeviceFile', {
				unpackReply: env => makeFileCaller(caller, filePbType.unpack(env))
			}
		),
		standardFileToDeviceFolder: jsonCall.makeReqRepObjCaller<DeviceFiles, 'standardFileToDeviceFolder'>(
			caller, objPath, 'standardFileToDeviceFolder', {
				unpackReply: env => makeFSCaller(caller, fsPbType.unpack(env))
			}
		),
		statStandardItem: jsonCall.makeReqRepObjCaller<DeviceFiles, 'statStandardItem'>(
			caller, objPath, 'statStandardItem'
		)
	};
	return devFiles;
}

/*
 Copyright (C) 2024 3NSoft Inc.
 
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

import { Caller, ExposedFn, CoreSideServices, FSMsg, FileMsg, exposeFSService, exposeFileService, makeFSCaller, makeFileCaller, makeIPCException } from "core-3nweb-client-lib/build/ipc";
import { shell_fs_resource as pb } from '../../../protos/shell_fs_resource.proto';
import { ProtoType, Value, toOptVal, valOfOpt } from '../../../lib-common/protobuf-msg';

type GetFSResource = web3n.shell.GetFSResource;
type ReadonlyFS = web3n.files.ReadonlyFS;
type ReadonlyFile = web3n.files.ReadonlyFile;

namespace getFSResource {

	const requestType = ProtoType.for<{
		appDomain?: Value<string>;
		resourceName: string;
	}>(pb.GetFSResourceRequestBody);

	const replyType = ProtoType.for<{
		file?: FileMsg;
		folder?: FSMsg;
	}>(pb.GetFSResourceReplyBody);

	export function wrapService(
		fn: GetFSResource, expServices: CoreSideServices
	): ExposedFn {
		return bytes => {
			const { resourceName, appDomain } = requestType.unpack(bytes);
			const promise = fn(valOfOpt(appDomain), resourceName)
			.then(item => {
				if ((item as ReadonlyFS).listFolder) {
					return replyType.pack({
						folder: exposeFSService(item as ReadonlyFS, expServices)
					});
				} else {
					return replyType.pack({
						file: exposeFileService(item as ReadonlyFile, expServices)
					});
				}
			});
			return { promise };
		};
	}

	export function makeCaller(
		caller: Caller, path: string[]
	): GetFSResource {
		return async (appDomain, resourceName) => {
			if (appDomain === null) {
				appDomain = undefined
			}
			const req = requestType.pack({
				appDomain: toOptVal(appDomain), resourceName
			});
			const buf = await caller.startPromiseCall(path, req);
			const reply = replyType.unpack(buf);
			if (reply.file) {
				return makeFileCaller(caller, reply.file);
			} else if (reply.folder) {
				return makeFSCaller(caller, reply.folder);
			} else {
				throw makeIPCException({
					message: `Neither file, nor folder were present in message from another side of ipc`,
					badReply: true,
					path
				});
			}
		}
	}

}
Object.freeze(getFSResource);


export const exposeGetFSResourceCAP = getFSResource.wrapService;
export const makeGetFSResource = getFSResource.makeCaller;


Object.freeze(exports);
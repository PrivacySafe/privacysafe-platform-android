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

import { toCanonicalAddress } from '../../../../../platform/lib-common/canonical-address';
import { makeFileException } from '../../../../../platform/lib-common/exceptions/file';
import { Mounter } from './user-mounts';
import { makeRuntimeException } from '../../../../../platform/lib-common/exceptions/runtime';
import { mounted_fs as pb } from "../../../../protos/mounted-fs.proto";
import { fnsForAndroid, StringValue, stringValueType } from '../../../runtime-ipc-via-ports';
import { ProtoType } from '../../../../../platform/lib-common/protobuf-msg';

type FS = web3n.files.FS;
type File = web3n.files.File;
type MountException = web3n.shell.mounts.MountException;

export function makeMounting(): {
	getOrMakeUserMounts: (userId: string) => Promise<Mounter>;
	exposeMountedFsFnsToAndroid: () => void;
} {

	const userMounts = new Map<string, Mounter>();

	async function getOrMakeUserMounts(userId: string): Promise<Mounter> {
		const uId = toCanonicalAddress(userId);
		let mounts = userMounts.get(uId);
		if (!mounts) {
			const rootNodePath = userId.replace(sep, '_');
			mounts = new Mounter(userId, await mountTree.makeNodeInRoot(userId), rootNodePath);
			userMounts.set(uId, mounts);
		}
		return mounts;
	}

	const mountTree = new MountTree();


	return {
		getOrMakeUserMounts,
		exposeMountedFsFnsToAndroid: mountTree.exposeMountedFsFnsToAndroid.bind(mountTree)
	};
}

export const sep = '/';

export function sanitizePath(path: string[]): string[] {
	if (path.length === 0) {
		throw makeMountException({ badPath: true, message: `path array is empty` });
	}
	path = path.map(s => s.trim());
	if (path.find(s => (s.length === 0))) {
		throw makeMountException({ badPath: true, message: `path section is either empty, or white space only` });
	}
	for (let i=0; i<path.length; i+=1) {
		const s = path[i];
		if (s.includes(sep)) {
			path[i] = s.split(sep).join('_');
		}
	}
	return path;
}

export function makeMountException(params: Partial<MountException>): MountException {
	return makeRuntimeException('mount', params, {});
}

interface Stats { isFile: boolean; size: number; name: string; }


class MountTree {

	private readonly rootNode = DirectoryNode.makeRootNode();

	constructor() {
		Object.seal(this);
	}

	async makeNodeInRoot(topName: string): Promise<DirectoryNode> {
		if (topName.includes(sep)) {
			topName = topName.split(sep).join('_');
		}
		return this.rootNode!.makeNewChildNode(topName);
	}

	private getNodeAt(path: string): NonNullable<ReturnType<DirectoryNode['getTreeNode']>> {
		const found = this.rootNode.getTreeNode(path);
		if (found) {
			return found;
		} else {
			throw makeFileException('notFound', path);
		}
	}

	private async statPath(path: string): Promise<Stats> {
		let { node, pathIntoFS } = this.getNodeAt(path);
		if (node instanceof NodeWithFile) {
			const { size } = await node.file.stat();
			return {
				isFile: true,
				size: ((size === undefined) ? 0 : size),
				name: node.name
			};
		} else if (node instanceof NodeWithFS) {
			const { isFile, size } = await node.fs.stat(pathIntoFS!);
			let name: string;
			if (pathIntoFS!.length > 0) {
				const ind = pathIntoFS!.lastIndexOf('/');
				if (ind >= 0) {
					name = pathIntoFS!.substring(ind+1);
				} else {
					name = pathIntoFS!;
				}
			} else {
				name = node.name;
			}
			return {
				isFile: !!isFile,
				size: ((size === undefined) ? 0 : size),
				name
			};
		} else {
			return {
				isFile: false,
				name: node.name,
				size: 0
			};
		}
	}

	private async readBytesFromFileInMountedFS(path: string, start: number, end: number): Promise<Uint8Array> {
		const { node, pathIntoFS } = this.getNodeAt(path);
		let bytes: Uint8Array|undefined;
		if (node instanceof NodeWithFile) {
			bytes = await node.file.readBytes(start, end);
		} else if (node instanceof NodeWithFS) {
			bytes = await node.fs.readBytes(pathIntoFS!, start, end);
		} else {
			throw makeFileException('notFile', path);
		}
		if (bytes) {
			return bytes;
		} else {
			throw makeFileException('endOfFile', path);
		}
	}

	exposeMountedFsFnsToAndroid(): void {
		const mountTree = this;

		async function statItemInMountedFS({ value: path }: StringValue): Promise<Stats|undefined> {
			return await mountTree.statPath(path);
		}
		fnsForAndroid.exposeFn(
			statItemInMountedFS,
			stringValueType,
			ProtoType.for<Stats>(pb.Stats)
		);

		async function readBytesFromFileInMountedFS({
			path, start, end
		}: FileReadArgs): Promise<Uint8Array> {
			return await mountTree.readBytesFromFileInMountedFS(path, start, end);
		}
		interface FileReadArgs { path: string; start: number; end: number; }
		fnsForAndroid.exposeFn(
			readBytesFromFileInMountedFS,
			ProtoType.for<FileReadArgs>(pb.FileReadArgs),
			undefined
		);

	}

}
Object.freeze(MountTree.prototype);
Object.freeze(MountTree);


export class TreeNode {

	protected constructor(
		readonly name: string,
		readonly parent: DirectoryNode|undefined
	) {}

	removeFromTree(): void {
		this.parent?.removeChildNode(this);
	}

}
Object.freeze(TreeNode.prototype);
Object.freeze(TreeNode);


export class DirectoryNode extends TreeNode {

	readonly children = new Map<string, DirectoryNode|NodeWithFS|NodeWithFile>();

	private constructor(name: string, parent: DirectoryNode|undefined) {
		super(name, parent)
		Object.freeze(this);
	}

	static makeRootNode(): DirectoryNode {
		return new DirectoryNode('', undefined);
	}

	makeNewChildNode(name: string): DirectoryNode {
		if (this.children.has(name)) {
			throw makeFileException('alreadyExists', name);
		}
		const node = new DirectoryNode(name, this);
		this.children.set(name, node);
		return node;
	}

	getOrMakeChildDirectoryNode(name: string): DirectoryNode {
		let child = this.children.get(name);
		if (!child) {
			return this.makeNewChildNode(name);
		} else if (child instanceof DirectoryNode) {
			return child;
		} else {
			throw makeFileException('alreadyExists', name);
		}
	}

	mountFS(name:string, fs: FS): NodeWithFS {
		if (this.children.has(name)) {
			throw makeFileException('alreadyExists', name);
		}
		const node = new NodeWithFS(name, this, fs);
		this.children.set(name, node);
		return node;
	}

	mountFile(name:string, file: File): NodeWithFile {
		if (this.children.has(name)) {
			throw makeFileException('alreadyExists', name);
		}
		const node = new NodeWithFile(name, this, file);
		this.children.set(name, node);
		return node;
	}

	removeChildNode(node: TreeNode): boolean {
		const foundChild = this.children.get(node.name);
		if (foundChild === node) {
			this.children.delete(node.name);
			return true;
		} else {
			return false;
		}
	}

	removeFromTree(): void {
		super.removeFromTree();
		this.children.clear();
	}

	getTreeNode(path: string): { node: TreeNode; pathIntoFS?: string; }|undefined {
		while (path.startsWith('/')) {
			path = path.substring(1);
		}
		const ind = path.indexOf('/');
		if (ind < 0) {
			const node = this.children.get(path);
			return (node ? { node } : undefined);
		}
		const childName = path.substring(0, ind);
		path = path.substring(ind+1);
		const node = this.children.get(childName);
		if (!node) {
			return undefined;
		} else if (node instanceof DirectoryNode) {
			if (path.length > 0) {
				return node.getTreeNode(path);
			} else {
				return { node };
			}
		} else if (node instanceof NodeWithFS) {
			return { node, pathIntoFS: path };
		} else {
			return ((path.length > 0) ? undefined : { node });
		}
	}

}
Object.freeze(DirectoryNode.prototype);
Object.freeze(DirectoryNode);


export class NodeWithFS extends TreeNode {

	constructor(
		name: string,
		parent: DirectoryNode,
		readonly fs: FS
	) {
		super(name, parent)
		Object.freeze(this);
	}

}

export class NodeWithFile extends TreeNode {

	constructor(
		name: string,
		parent: DirectoryNode,
		readonly file: File
	) {
		super(name, parent)
		Object.freeze(this);
	}

}


Object.freeze(exports);